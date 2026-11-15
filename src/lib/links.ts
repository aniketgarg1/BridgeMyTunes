import type { Platform } from "./types";

/**
 * What a pasted link points at. Pure (no I/O) so it can be unit-tested.
 *  - song:       one track. Its share page links straight to the song on every service, no sign-in.
 *  - collection: a playlist or an album. Its share page adds it to your library.
 * Album ids carry an "album:" prefix so adapters can tell them apart from playlists.
 */
export interface MusicLink {
  platform: Platform;
  kind: "song" | "collection";
  id: string;
  storefront?: string;
}

const SPOTIFY = /open\.spotify\.com\/(?:intl-[\w-]+\/)?(track|album|playlist)\/([A-Za-z0-9]+)/;
const SPOTIFY_URI = /^spotify:(track|album|playlist):([A-Za-z0-9]+)$/;

export function parseMusicLink(input: string): MusicLink | null {
  const s = input.trim();

  const sp = s.match(SPOTIFY) ?? s.match(SPOTIFY_URI);
  if (sp) {
    const [, type, id] = sp;
    if (type === "track") return { platform: "spotify", kind: "song", id };
    if (type === "album") return { platform: "spotify", kind: "collection", id: `album:${id}` };
    return { platform: "spotify", kind: "collection", id };
  }

  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }

  if (u.hostname.endsWith("music.apple.com")) {
    const parts = u.pathname.split("/").filter(Boolean);
    const storefront = /^[a-z]{2}$/.test(parts[0] ?? "") ? parts[0] : undefined;
    const type = storefront ? parts[1] : parts[0];
    const last = parts[parts.length - 1] ?? "";
    const songInAlbum = u.searchParams.get("i");
    if (type === "song" && /^\d+$/.test(last)) return { platform: "apple", kind: "song", id: last, storefront };
    if (type === "album" && songInAlbum && /^\d+$/.test(songInAlbum)) return { platform: "apple", kind: "song", id: songInAlbum, storefront };
    if (type === "album" && /^\d+$/.test(last)) return { platform: "apple", kind: "collection", id: `album:${last}`, storefront };
    const playlist = parts.find((p) => /^p(l)?\.[\w-]+$/.test(p));
    if (playlist) return { platform: "apple", kind: "collection", id: playlist, storefront };
    return null;
  }

  if (u.hostname === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return id ? { platform: "youtube", kind: "song", id } : null;
  }
  if (/(^|\.)youtube\.com$/.test(u.hostname)) {
    // A /watch link is a song even when it was played inside a playlist; /playlist is the playlist itself.
    const v = u.searchParams.get("v");
    if (u.pathname.startsWith("/watch") && v) return { platform: "youtube", kind: "song", id: v };
    const list = u.searchParams.get("list");
    if (list) return { platform: "youtube", kind: "collection", id: list };
    const short = u.pathname.match(/^\/shorts\/([\w-]+)/);
    if (short) return { platform: "youtube", kind: "song", id: short[1] };
  }
  return null;
}

/*
 * Many songs in one paste: what the Spotify desktop app copies after Cmd+A, Cmd+C on a playlist (one
 * open.spotify.com/track/… link per line). A one-line <input> strips the line breaks, so links can arrive
 * glued together; the patterns rely on each service's id shape instead of separators.
 */
const MANY: { platform: MusicLink["platform"]; re: RegExp }[] = [
  { platform: "spotify", re: /(?:open\.spotify\.com\/(?:intl-[\w-]+\/)?track\/|spotify:track:)([A-Za-z0-9]{22})/g },
  { platform: "youtube", re: /(?:youtube\.com\/watch\?(?:[^\s]*?&)?v=|youtu\.be\/)([\w-]{11})/g },
  { platform: "apple", re: /music\.apple\.com\/(?:([a-z]{2})\/)?(?:song\/[^/\s]+\/(\d+)|album\/[^/\s]+\/\d+\?i=(\d+))/g },
];

/** Every song link in the text, in order, without repeats. */
export function parseSongLinks(input: string): MusicLink[] {
  const found: { at: number; link: MusicLink }[] = [];
  for (const { platform, re } of MANY) {
    for (const m of input.matchAll(re)) {
      const link: MusicLink =
        platform === "apple"
          ? { platform, kind: "song", id: m[2] ?? m[3], storefront: m[1] }
          : { platform, kind: "song", id: m[1] };
      found.push({ at: m.index ?? 0, link });
    }
  }
  const seen = new Set<string>();
  return found
    .sort((a, b) => a.at - b.at)
    .map((f) => f.link)
    .filter((l) => {
      const key = `${l.platform}:${l.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/**
 * Every playlist or album link in the text, in order, without repeats, each with the exact text it came from.
 * Links may be separated by anything (spaces, new lines, commas) or glued together.
 */
export function parseCollectionLinks(input: string): { link: MusicLink; url: string }[] {
  const seen = new Set<string>();
  const out: { link: MusicLink; url: string }[] = [];
  for (const piece of input.split(/(?=https?:\/\/)|(?=spotify:)|[\s,;]+/)) {
    const url = piece.trim();
    if (!url) continue;
    const link = parseMusicLink(url);
    if (!link || link.kind !== "collection") continue;
    const key = `${link.platform}:${link.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ link, url });
  }
  return out;
}
