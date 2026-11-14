import "server-only";
import { env } from "../env";
import type { PlaylistSnapshot, PlaylistSummary, Track } from "../types";
import { chunk, fetchJson, PlatformError, type MusicAdapter, type SearchQuery } from "./types";
import { videoToTrack } from "./youtube-parse";

export { parseYouTubeUrl } from "./youtube-parse";

/* eslint-disable @typescript-eslint/no-explicit-any */

/*
 * YouTube Music through the YouTube Data API v3 (YouTube Music playlists are ordinary YouTube playlists).
 *  - Public playlists are read with an API key, no login.
 *  - Creating playlists needs Google sign-in (OAuth, scope youtube) and a YouTube channel on that account.
 *  - Quota: 10,000 units/day by default. search = 100, insert = 50, list/read = 1. Matching results are cached
 *    in MongoDB, so a song is only searched once.
 *  - There are no ISRCs, so matching relies on title/artist/duration. Official "Artist - Topic" uploads carry
 *    clean metadata in their description, which we parse.
 */

const API = "https://www.googleapis.com/youtube/v3";
const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";

export const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube";
export const youtubeRedirectUri = () => `${env.appUrl}/api/auth/youtube/callback`;

export function youtubeAuthorizeUrl(state: string) {
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: youtubeRedirectUri(),
    response_type: "code",
    scope: YOUTUBE_SCOPE,
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state,
  });
  return `${GOOGLE_AUTH}?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

const tokenRequest = (body: Record<string, string>) =>
  fetchJson<TokenResponse>("youtube", GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.googleClientId, client_secret: env.googleClientSecret, ...body }),
  });

export const exchangeGoogleCode = (code: string) =>
  tokenRequest({ grant_type: "authorization_code", code, redirect_uri: youtubeRedirectUri() });

export const refreshGoogleToken = (refreshToken: string) =>
  tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });

export class YouTubeAdapter implements MusicAdapter {
  platform = "youtube" as const;

  /** accessToken = signed-in user; null = public reads with the API key. */
  constructor(private accessToken: string | null) {}

  private url(path: string, params: Record<string, string | number | undefined>) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
    if (!this.accessToken) q.set("key", env.youtubeApiKey);
    return `${API}${path}?${q}`;
  }

  private headers(): Record<string, string> {
    return this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {};
  }

  private get<T>(path: string, params: Record<string, string | number | undefined>) {
    return fetchJson<T>("youtube", this.url(path, params), { headers: this.headers() });
  }

  private async send<T>(path: string, params: Record<string, string>, body: unknown): Promise<T> {
    if (!this.accessToken) throw new Error("Sign in with Google to do this.");
    try {
      return await fetchJson<T>("youtube", this.url(path, params), {
        method: "POST",
        headers: { ...this.headers(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      if (err instanceof PlatformError && /youtubeSignupRequired|channelNotFound/.test(err.message)) {
        throw new Error("This Google account has no YouTube channel yet. Create one at youtube.com/create_channel, then try again.");
      }
      if (err instanceof PlatformError && /quotaExceeded/.test(err.message)) {
        throw new Error("YouTube's daily limit for this app is used up. It resets at midnight Pacific time.");
      }
      throw err;
    }
  }

  async me(): Promise<{ name?: string }> {
    const res: any = await this.get("/channels", { part: "snippet", mine: "true" });
    return { name: res.items?.[0]?.snippet?.title };
  }

  /** Fill in durations (and full descriptions) for up to 50 videos per call. */
  private async videos(ids: string[]): Promise<Map<string, any>> {
    const out = new Map<string, any>();
    for (const batch of chunk(ids, 50)) {
      const res: any = await this.get("/videos", { part: "snippet,contentDetails", id: batch.join(","), maxResults: 50 });
      for (const v of res.items ?? []) out.set(v.id, v);
    }
    return out;
  }

  private async playlistVideos(playlistId: string): Promise<Track[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const res: any = await this.get("/playlistItems", { part: "contentDetails", playlistId, maxResults: 50, pageToken });
      ids.push(...(res.items ?? []).map((i: any) => i.contentDetails?.videoId).filter(Boolean));
      pageToken = res.nextPageToken;
    } while (pageToken && ids.length < 1000);
    const details = await this.videos(ids);
    return ids.map((id) => videoToTrack(details.get(id))).filter((t): t is Track => t !== null);
  }

  async listPlaylists(): Promise<PlaylistSummary[]> {
    if (!this.accessToken) throw new Error("Sign in with Google to see your playlists.");
    const out: PlaylistSummary[] = [];
    let pageToken: string | undefined;
    do {
      const res: any = await this.get("/playlists", { part: "snippet,contentDetails", mine: "true", maxResults: 50, pageToken });
      for (const p of res.items ?? []) {
        out.push({
          id: p.id,
          name: p.snippet?.title ?? "Untitled",
          imageUrl: p.snippet?.thumbnails?.high?.url ?? p.snippet?.thumbnails?.default?.url,
          trackCount: p.contentDetails?.itemCount,
          readable: true,
        });
      }
      pageToken = res.nextPageToken;
    } while (pageToken);
    return out;
  }

  async getPlaylist(id: string): Promise<PlaylistSnapshot> {
    const res: any = await this.get("/playlists", { part: "snippet", id });
    const p = res.items?.[0];
    if (!p) throw new Error("That YouTube playlist is private or doesn't exist. Make it Public or Unlisted and try again.");
    return {
      platform: "youtube",
      id,
      name: p.snippet?.title ?? "YouTube playlist",
      description: p.snippet?.description || undefined,
      imageUrl: p.snippet?.thumbnails?.maxres?.url ?? p.snippet?.thumbnails?.high?.url,
      ownerName: p.snippet?.channelTitle,
      url: `https://music.youtube.com/playlist?list=${id}`,
      tracks: await this.playlistVideos(id),
    };
  }

  async getLikedTracks(): Promise<Track[]> {
    if (!this.accessToken) throw new Error("Sign in with Google first.");
    return this.playlistVideos("LL");
  }

  /** YouTube has no ISRC lookup. */
  async lookupByIsrc(): Promise<Map<string, Track[]>> {
    return new Map();
  }

  async search({ title, artist }: SearchQuery): Promise<Track[]> {
    return this.searchText(`${artist} ${title}`);
  }

  async searchText(text: string): Promise<Track[]> {
    const res: any = await this.get("/search", {
      part: "snippet",
      type: "video",
      videoCategoryId: 10, // Music
      maxResults: 8,
      q: text.slice(0, 200),
    });
    const ids = (res.items ?? []).map((i: any) => i.id?.videoId).filter(Boolean) as string[];
    if (!ids.length) return [];
    const details = await this.videos(ids);
    const tracks = ids.map((id) => videoToTrack(details.get(id))).filter((t): t is Track => t !== null);
    // Official "Topic" audio first: cleanest metadata and the version YouTube Music plays.
    const topic = (t: Track) => (details.get(t.ids.youtube!)?.snippet?.channelTitle?.endsWith(" - Topic") ? 0 : 1);
    return tracks.sort((a, b) => topic(a) - topic(b));
  }

  async createPlaylist(name: string, description: string, trackIds: string[]) {
    const pl: any = await this.send("/playlists", { part: "snippet,status" }, {
      snippet: { title: name.slice(0, 150), description: description.slice(0, 5000) },
      status: { privacyStatus: "private" },
    });
    await this.addToPlaylist(pl.id, trackIds);
    return { id: pl.id as string, url: `https://music.youtube.com/playlist?list=${pl.id}` };
  }

  async addToPlaylist(playlistId: string, trackIds: string[]) {
    // One at a time: parallel inserts into the same playlist conflict.
    for (const videoId of trackIds) {
      await this.send("/playlistItems", { part: "snippet" }, {
        snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } },
      });
    }
  }

  async saveToLibrary(trackIds: string[]) {
    for (const id of trackIds) {
      if (!this.accessToken) throw new Error("Sign in with Google first.");
      await fetchJson("youtube", `${API}/videos/rate?id=${encodeURIComponent(id)}&rating=like`, {
        method: "POST",
        headers: this.headers(),
      });
    }
  }
}
