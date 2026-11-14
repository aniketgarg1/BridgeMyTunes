import "server-only";
import { importPKCS8, SignJWT } from "jose";
import { env } from "../env";
import type { PlaylistSnapshot, PlaylistSummary, Track } from "../types";
import { chunk, fetchJson, type MusicAdapter, type SearchQuery } from "./types";

/*
 * Apple Music API.
 *  - Developer token: ES256 JWT signed with a MusicKit key (.p8) from the Apple Developer Program.
 *  - Music User Token: obtained in the browser with MusicKit JS `authorize()`, sent to us, stored per user.
 *  - Library playlists ("p.xxx") need the user token; catalog playlists ("pl.xxx") only need the developer token.
 */

const API = "https://api.music.apple.com/v1";

let cachedToken: { token: string; exp: number } | null = null;

export async function appleDeveloperToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - now > 3600) return cachedToken.token;
  const key = await importPKCS8(env.applePrivateKey, "ES256");
  const exp = now + 60 * 60 * 24 * 30; // Apple allows up to 6 months; 30 days keeps leaks short-lived.
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: env.appleKeyId })
    .setIssuer(env.appleTeamId)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(key);
  cachedToken = { token, exp };
  return token;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const artwork = (a: any, size = 600) =>
  a?.url ? String(a.url).replace("{w}", String(size)).replace("{h}", String(size)) : undefined;

function catalogSongToTrack(s: any): Track | null {
  if (!s?.id || !s.attributes) return null;
  const a = s.attributes;
  return {
    title: a.name,
    artists: [a.artistName],
    album: a.albumName,
    durationMs: a.durationInMillis,
    isrc: a.isrc?.toUpperCase(),
    explicit: a.contentRating === "explicit",
    artworkUrl: artwork(a.artwork),
    url: a.url,
    ids: { apple: s.id },
  };
}

/** Pull "pl.xxx" / "p.xxx" and the storefront out of a music.apple.com URL. */
export function parseAppleUrl(input: string): { id: string; storefront?: string } | null {
  try {
    const u = new URL(input);
    if (!u.hostname.endsWith("music.apple.com")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    const id = parts.find((p) => /^p(l)?\.[\w-]+$/.test(p));
    if (!id) return null;
    const storefront = /^[a-z]{2}$/.test(parts[0] ?? "") ? parts[0] : undefined;
    return { id, storefront };
  } catch {
    return null;
  }
}

export class AppleAdapter implements MusicAdapter {
  platform = "apple" as const;

  constructor(
    private userToken: string | null,
    private storefront: string = env.appleDefaultStorefront,
  ) {}

  private async headers(): Promise<Record<string, string>> {
    const h: Record<string, string> = { Authorization: `Bearer ${await appleDeveloperToken()}` };
    if (this.userToken) h["Music-User-Token"] = this.userToken;
    return h;
  }

  private async get<T>(path: string): Promise<T> {
    const url = path.startsWith("http") ? path : `${API}${path.replace(/^\/v1/, "")}`;
    return fetchJson<T>("apple", url, { headers: await this.headers() });
  }

  private async send<T>(method: string, path: string, body?: unknown): Promise<T> {
    return fetchJson<T>("apple", `${API}${path}`, {
      method,
      headers: { ...(await this.headers()), "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  private requireUser() {
    if (!this.userToken) throw new Error("Connect Apple Music to do this.");
  }

  private async paginate(path: string): Promise<any[]> {
    const out: any[] = [];
    let next: string | undefined = path;
    while (next) {
      const page: any = await this.get(next);
      out.push(...(page.data ?? []));
      next = page.next;
    }
    return out;
  }

  async fetchStorefront(): Promise<string> {
    this.requireUser();
    const res: any = await this.get("/me/storefront");
    return res.data?.[0]?.id ?? env.appleDefaultStorefront;
  }

  async listPlaylists(): Promise<PlaylistSummary[]> {
    this.requireUser();
    const items = await this.paginate("/me/library/playlists?limit=100");
    return items.map((p) => ({
      id: p.id,
      name: p.attributes?.name ?? "Untitled",
      imageUrl: artwork(p.attributes?.artwork, 300),
      readable: true,
    }));
  }

  /** Fetch full catalog song objects (with ISRC) for many ids at once. */
  private async catalogSongs(ids: string[]): Promise<Map<string, Track>> {
    const out = new Map<string, Track>();
    for (const batch of chunk(ids, 200)) {
      const res: any = await this.get(`/catalog/${this.storefront}/songs?ids=${batch.join(",")}`);
      for (const s of res.data ?? []) {
        const t = catalogSongToTrack(s);
        if (t) out.set(s.id, t);
      }
    }
    return out;
  }

  async getPlaylist(id: string): Promise<PlaylistSnapshot> {
    return id.startsWith("pl.") ? this.getCatalogPlaylist(id) : this.getLibraryPlaylist(id);
  }

  private async getCatalogPlaylist(id: string): Promise<PlaylistSnapshot> {
    const res: any = await this.get(`/catalog/${this.storefront}/playlists/${id}`);
    const p = res.data?.[0];
    const songs = await this.paginate(`/catalog/${this.storefront}/playlists/${id}/tracks?limit=100`);
    return {
      platform: "apple",
      id,
      name: p?.attributes?.name ?? "Apple Music playlist",
      description: p?.attributes?.description?.standard ?? p?.attributes?.description?.short,
      imageUrl: artwork(p?.attributes?.artwork),
      ownerName: p?.attributes?.curatorName,
      url: p?.attributes?.url,
      tracks: songs.filter((s) => s.type === "songs").map(catalogSongToTrack).filter((t): t is Track => t !== null),
    };
  }

  private async getLibraryPlaylist(id: string): Promise<PlaylistSnapshot> {
    this.requireUser();
    const res: any = await this.get(`/me/library/playlists/${id}`);
    const p = res.data?.[0];
    let entries: any[] = [];
    try {
      entries = await this.paginate(`/me/library/playlists/${id}/tracks?limit=100`);
    } catch (e: any) {
      if (e?.status !== 404) throw e; // empty playlists 404 on /tracks
    }
    return {
      platform: "apple",
      id,
      name: p?.attributes?.name ?? "Apple Music playlist",
      description: p?.attributes?.description?.standard,
      imageUrl: artwork(p?.attributes?.artwork),
      url: p?.attributes?.playParams?.globalId
        ? `https://music.apple.com/${this.storefront}/playlist/${p.attributes.playParams.globalId}`
        : undefined,
      tracks: await this.libraryEntriesToTracks(entries),
    };
  }

  /** Library songs lack ISRCs; enrich them from the catalog when they have a catalog id. */
  private async libraryEntriesToTracks(entries: any[]): Promise<Track[]> {
    const songs = entries.filter((e) => e.type === "library-songs" || e.type === "songs");
    const catalogIds = songs.map((s) => s.attributes?.playParams?.catalogId).filter(Boolean) as string[];
    const catalog = catalogIds.length ? await this.catalogSongs([...new Set(catalogIds)]) : new Map();
    return songs.map((s) => {
      const cid = s.attributes?.playParams?.catalogId as string | undefined;
      const fromCatalog = cid ? catalog.get(cid) : undefined;
      if (fromCatalog) return fromCatalog;
      const a = s.attributes ?? {};
      return {
        title: a.name,
        artists: [a.artistName],
        album: a.albumName,
        durationMs: a.durationInMillis,
        explicit: a.contentRating === "explicit",
        artworkUrl: artwork(a.artwork),
        ids: cid ? { apple: cid } : {},
      } satisfies Track;
    });
  }

  async getLikedTracks(): Promise<Track[]> {
    this.requireUser();
    const entries = await this.paginate("/me/library/songs?limit=100");
    return this.libraryEntriesToTracks(entries);
  }

  async lookupByIsrc(isrcs: string[]): Promise<Map<string, Track[]>> {
    const out = new Map<string, Track[]>();
    for (const batch of chunk(isrcs, 25)) {
      const res: any = await this.get(`/catalog/${this.storefront}/songs?filter[isrc]=${batch.join(",")}`);
      for (const s of res.data ?? []) {
        const t = catalogSongToTrack(s);
        if (!t?.isrc) continue;
        out.set(t.isrc, [...(out.get(t.isrc) ?? []), t]);
      }
    }
    return out;
  }

  async search({ title, artist }: SearchQuery): Promise<Track[]> {
    return this.searchText(`${title} ${artist}`);
  }

  async searchText(text: string): Promise<Track[]> {
    const term = encodeURIComponent(text.slice(0, 200));
    const res: any = await this.get(`/catalog/${this.storefront}/search?types=songs&limit=25&term=${term}`);
    return (res.results?.songs?.data ?? []).map(catalogSongToTrack).filter(Boolean);
  }

  async createPlaylist(name: string, description: string, trackIds: string[]) {
    this.requireUser();
    const [first = [], ...rest] = chunk(trackIds, 100);
    const res: any = await this.send("POST", "/me/library/playlists", {
      attributes: { name, description },
      relationships: { tracks: { data: first.map((id) => ({ id, type: "songs" })) } },
    });
    const id = res.data?.[0]?.id as string;
    for (const ids of rest) await this.addToPlaylist(id, ids);
    return { id, url: `https://music.apple.com/library/playlist/${id}` };
  }

  async addToPlaylist(playlistId: string, trackIds: string[]) {
    this.requireUser();
    for (const ids of chunk(trackIds, 100)) {
      await this.send("POST", `/me/library/playlists/${playlistId}/tracks`, {
        data: ids.map((id) => ({ id, type: "songs" })),
      });
    }
  }

  async saveToLibrary(trackIds: string[]) {
    this.requireUser();
    for (const ids of chunk(trackIds, 100)) {
      await this.send("POST", `/me/library?ids[songs]=${ids.join(",")}`);
    }
  }
}
