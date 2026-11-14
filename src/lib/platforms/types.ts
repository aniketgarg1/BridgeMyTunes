import type { Platform, PlaylistSnapshot, PlaylistSummary, Track } from "../types";

export interface SearchQuery {
  title: string;
  artist: string;
  album?: string;
}

/** Everything the transfer engine needs from a streaming service. */
export interface MusicAdapter {
  platform: Platform;
  listPlaylists(): Promise<PlaylistSummary[]>;
  getPlaylist(id: string): Promise<PlaylistSnapshot>;
  getLikedTracks(): Promise<Track[]>;
  /** One song by its id on this service, or null if it doesn't exist. */
  getTrack(id: string): Promise<Track | null>;
  /** Exact recording lookup. Returns candidates per ISRC (an ISRC can map to several catalog entries). */
  lookupByIsrc(isrcs: string[]): Promise<Map<string, Track[]>>;
  search(query: SearchQuery): Promise<Track[]>;
  searchText(text: string): Promise<Track[]>;
  createPlaylist(name: string, description: string, trackIds: string[]): Promise<{ id: string; url?: string }>;
  addToPlaylist(playlistId: string, trackIds: string[]): Promise<void>;
  saveToLibrary(trackIds: string[]): Promise<void>;
}

export class PlatformError extends Error {
  constructor(
    message: string,
    public status: number,
    public platform: Platform,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch + JSON with retry on 429/5xx, honouring Retry-After. */
export async function fetchJson<T>(
  platform: Platform,
  url: string,
  init: RequestInit = {},
  attempt = 0,
): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    const retryAfter = Number(res.headers.get("retry-after"));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt;
    await sleep(Math.min(wait, 15_000));
    return fetchJson<T>(platform, url, init, attempt + 1);
  }
  // Apple's catalog edge occasionally rejects a valid developer token with an empty 401. Retry it briefly.
  const isGet = !init.method || init.method === "GET";
  if (res.status === 401 && platform === "apple" && isGet && attempt < 3) {
    await sleep(400 * (attempt + 1));
    return fetchJson<T>(platform, url, init, attempt + 1);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Right after a playlist is created YouTube briefly answers 409 ABORTED or 404 "playlist cannot be found"
    // while it propagates. Both clear within seconds.
    const youtubeSettling =
      (res.status === 409 && /ABORTED|SERVICE_UNAVAILABLE/.test(body)) ||
      (res.status === 404 && /playlistNotFound|playlist identified with the request/.test(body));
    if (platform === "youtube" && youtubeSettling && attempt < 5) {
      await sleep(1000 * 2 ** attempt);
      return fetchJson<T>(platform, url, init, attempt + 1);
    }
    throw new PlatformError(
      `${platform} API ${res.status} on ${new URL(url).pathname}: ${body.slice(0, 300)}`,
      res.status,
      platform,
    );
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
