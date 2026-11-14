import type { Track } from "../types";

/*
 * Reads Spotify's public embed player page (open.spotify.com/embed/playlist/<id>), which carries the
 * playlist's name, cover and song list in its __NEXT_DATA__ block. Pure (no I/O) so it can be tested.
 * This is not an official API: Spotify can change the page at any time, so callers must handle null.
 */

export interface EmbedPlaylist {
  id: string;
  name: string;
  ownerName?: string;
  imageUrl?: string;
  tracks: Track[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function findEntity(o: any): any {
  if (!o || typeof o !== "object") return null;
  if (Array.isArray(o)) {
    for (const v of o) {
      const r = findEntity(v);
      if (r) return r;
    }
    return null;
  }
  if (Array.isArray(o.trackList)) return o;
  for (const v of Object.values(o)) {
    const r = findEntity(v);
    if (r) return r;
  }
  return null;
}

export function parseSpotifyEmbed(html: string): EmbedPlaylist | null {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  let data: unknown;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return null;
  }
  const e = findEntity(data);
  if (!e) return null;
  const tracks: Track[] = [];
  for (const t of e.trackList as any[]) {
    const id = typeof t?.uri === "string" ? t.uri.match(/^spotify:track:([A-Za-z0-9]{22})$/)?.[1] : undefined;
    if (!id || !t.title) continue; // episodes and local files have no track uri
    tracks.push({
      title: t.title,
      artists: typeof t.subtitle === "string" ? t.subtitle.split(/,\s*/).filter(Boolean) : [],
      durationMs: typeof t.duration === "number" ? t.duration : undefined,
      explicit: Boolean(t.isExplicit),
      url: `https://open.spotify.com/track/${id}`,
      ids: { spotify: id },
    });
  }
  return {
    id: e.id ?? "",
    name: e.name ?? e.title ?? "Spotify playlist",
    ownerName: typeof e.subtitle === "string" ? e.subtitle : undefined,
    imageUrl: e.coverArt?.sources?.[0]?.url,
    tracks,
  };
}

/** The embed page answers 200 with a "Page not found" body (status 404) for private or deleted playlists. */
export function embedNotFound(html: string): boolean {
  return /<script id="__NEXT_DATA__"[^>]*>[\s\S]*?"pageProps":\{"status":404/.test(html);
}
