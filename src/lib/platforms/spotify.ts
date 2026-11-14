import "server-only";
import { env } from "../env";
import type { PlaylistSnapshot, PlaylistSummary, Track } from "../types";
import { chunk, fetchJson, type MusicAdapter, type SearchQuery } from "./types";

/*
 * Spotify Web API, written against the February 2026 Development Mode rules:
 *  - playlist routes are /playlists/{id}/items (not /tracks), entries carry `item` (not `track`)
 *  - create playlist is POST /me/playlists
 *  - item contents are only returned for playlists the user owns or collaborates on
 *  - search limit is max 10; batch GET /tracks?ids= is gone
 *  - saving to library is PUT /me/library with URIs
 */

const API = "https://api.spotify.com/v1";
const ACCOUNTS = "https://accounts.spotify.com";

export const SPOTIFY_SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-private",
  "playlist-modify-public",
  "user-library-read",
  "user-library-modify",
].join(" ");

export const spotifyRedirectUri = () => `${env.appUrl}/api/auth/spotify/callback`;

export function spotifyAuthorizeUrl(state: string) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.spotifyClientId,
    scope: SPOTIFY_SCOPES,
    redirect_uri: spotifyRedirectUri(),
    state,
  });
  return `${ACCOUNTS}/authorize?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const basic = Buffer.from(`${env.spotifyClientId}:${env.spotifyClientSecret}`).toString("base64");
  return fetchJson<TokenResponse>("spotify", `${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
}

let appToken: { token: string; exp: number } | null = null;

/** App-only token (client credentials): enough for songs, albums and search, no user involved. */
export async function spotifyAppToken(): Promise<string> {
  if (appToken && appToken.exp - Date.now() > 60_000) return appToken.token;
  const t = await tokenRequest({ grant_type: "client_credentials" });
  appToken = { token: t.access_token, exp: Date.now() + t.expires_in * 1000 };
  return appToken.token;
}

export const exchangeSpotifyCode = (code: string) =>
  tokenRequest({ grant_type: "authorization_code", code, redirect_uri: spotifyRedirectUri() });

export const refreshSpotifyToken = (refreshToken: string) =>
  tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });

/* eslint-disable @typescript-eslint/no-explicit-any */
function toTrack(t: any): Track | null {
  if (!t || t.type !== "track" || !t.id) return null;
  return {
    title: t.name,
    artists: (t.artists ?? []).map((a: any) => a.name),
    album: t.album?.name,
    durationMs: t.duration_ms,
    isrc: t.external_ids?.isrc?.toUpperCase(),
    explicit: t.explicit,
    artworkUrl: t.album?.images?.[0]?.url,
    url: t.external_urls?.spotify,
    ids: { spotify: t.id },
  };
}

export class SpotifyAdapter implements MusicAdapter {
  platform = "spotify" as const;
  private meId?: string;

  constructor(
    private accessToken: string,
    private opts: { publicPlaylists?: boolean } = {},
  ) {}

  private get<T>(path: string) {
    const url = path.startsWith("http") ? path : `${API}${path}`;
    return fetchJson<T>("spotify", url, { headers: { Authorization: `Bearer ${this.accessToken}` } });
  }

  private send<T>(method: string, path: string, body: unknown) {
    return fetchJson<T>("spotify", `${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async me(): Promise<{ id: string; display_name?: string }> {
    const me = await this.get<{ id: string; display_name?: string }>("/me");
    this.meId = me.id;
    return me;
  }

  private async paginate(path: string): Promise<any[]> {
    const out: any[] = [];
    let next: string | null = path;
    while (next) {
      const page: any = await this.get(next);
      out.push(...(page.items ?? []));
      next = page.next;
    }
    return out;
  }

  async listPlaylists(): Promise<PlaylistSummary[]> {
    const meId = this.meId ?? (await this.me()).id;
    const items = await this.paginate("/me/playlists?limit=50");
    return items
      .filter(Boolean)
      .map((p) => ({
        id: p.id,
        name: p.name,
        imageUrl: p.images?.[0]?.url,
        trackCount: p.items?.total ?? p.tracks?.total,
        readable: p.owner?.id === meId || Boolean(p.collaborative),
        ownerName: p.owner?.display_name,
      }));
  }

  async getTrack(id: string): Promise<Track | null> {
    return toTrack(await this.get(`/tracks/${encodeURIComponent(id)}`));
  }

  private async getAlbum(id: string): Promise<PlaylistSnapshot> {
    const a: any = await this.get(`/albums/${encodeURIComponent(id)}`);
    const items = await this.paginate(`/albums/${encodeURIComponent(id)}/tracks?limit=50`);
    const tracks = items
      .map((t) => toTrack({ ...t, album: { name: a.name, images: a.images }, external_ids: t.external_ids }))
      .filter((t): t is Track => t !== null);
    return {
      platform: "spotify",
      id: `album:${id}`,
      name: a.name,
      imageUrl: a.images?.[0]?.url,
      ownerName: (a.artists ?? []).map((x: any) => x.name).join(", "),
      url: a.external_urls?.spotify,
      tracks,
    };
  }

  async getPlaylist(id: string): Promise<PlaylistSnapshot> {
    if (id.startsWith("album:")) return this.getAlbum(id.slice(6));
    const meta: any = await this.get(`/playlists/${encodeURIComponent(id)}?fields=id,name,description,images,owner,external_urls`);
    const entries = await this.paginate(`/playlists/${encodeURIComponent(id)}/items?limit=50&additional_types=track`);
    const tracks = entries
      .filter((e) => !e.is_local)
      // New shape uses `item`; older responses used `track` (which may now be a boolean).
      .map((e) => toTrack(e.item ?? (typeof e.track === "object" ? e.track : null)))
      .filter((t): t is Track => t !== null);
    return {
      platform: "spotify",
      id: meta.id,
      name: meta.name,
      description: meta.description || undefined,
      imageUrl: meta.images?.[0]?.url,
      ownerName: meta.owner?.display_name,
      url: meta.external_urls?.spotify,
      tracks,
    };
  }

  async getLikedTracks(): Promise<Track[]> {
    const entries = await this.paginate("/me/tracks?limit=50");
    return entries.map((e) => toTrack(e.item ?? e.track)).filter((t): t is Track => t !== null);
  }

  async lookupByIsrc(isrcs: string[]): Promise<Map<string, Track[]>> {
    const out = new Map<string, Track[]>();
    for (const isrc of isrcs) {
      const res: any = await this.get(`/search?type=track&limit=5&q=${encodeURIComponent(`isrc:${isrc}`)}`);
      out.set(isrc, (res.tracks?.items ?? []).map(toTrack).filter(Boolean));
    }
    return out;
  }

  async search({ title, artist }: SearchQuery): Promise<Track[]> {
    const clean = (s: string) => s.replace(/"/g, "");
    const fielded = `track:"${clean(title)}" artist:"${clean(artist)}"`;
    const res: any = await this.get(`/search?type=track&limit=10&q=${encodeURIComponent(fielded)}`);
    const tracks: Track[] = (res.tracks?.items ?? []).map(toTrack).filter(Boolean);
    if (tracks.length > 0) return tracks;
    return this.searchText(`${title} ${artist}`);
  }

  async searchText(text: string): Promise<Track[]> {
    const res: any = await this.get(`/search?type=track&limit=10&q=${encodeURIComponent(text)}`);
    return (res.tracks?.items ?? []).map(toTrack).filter(Boolean);
  }

  async createPlaylist(name: string, description: string, trackIds: string[]) {
    const pl: any = await this.send("POST", "/me/playlists", {
      name: name.slice(0, 100),
      description: description.replace(/\s+/g, " ").slice(0, 300),
      public: Boolean(this.opts.publicPlaylists),
    });
    await this.addToPlaylist(pl.id, trackIds);
    return { id: pl.id as string, url: pl.external_urls?.spotify as string | undefined };
  }

  /** Add only the songs the playlist doesn't have yet (for reused playlists). Reading works on playlists this account owns. */
  async addMissing(playlistId: string, trackIds: string[]) {
    const existing = new Set<string>();
    for (const e of await this.paginate(`/playlists/${encodeURIComponent(playlistId)}/items?limit=50`)) {
      const id = (e.item ?? (typeof e.track === "object" ? e.track : null))?.id;
      if (id) existing.add(id);
    }
    await this.addToPlaylist(playlistId, [...new Set(trackIds)].filter((id) => !existing.has(id)));
  }

  async addToPlaylist(playlistId: string, trackIds: string[]) {
    for (const ids of chunk(trackIds, 100)) {
      await this.send("POST", `/playlists/${encodeURIComponent(playlistId)}/items`, {
        uris: ids.map((id) => `spotify:track:${id}`),
      });
    }
  }

  async saveToLibrary(trackIds: string[]) {
    for (const ids of chunk(trackIds, 40)) {
      await this.send("PUT", "/me/library", { uris: ids.map((id) => `spotify:track:${id}`) });
    }
  }
}
