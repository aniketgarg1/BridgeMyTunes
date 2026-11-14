import type { Track } from "../types";

/* Pure helpers for YouTube data (no I/O), unit-tested in youtube-parse.test.ts. */

/** Pull the playlist id out of youtube.com / music.youtube.com links. */
export function parseYouTubeUrl(input: string): { id: string } | null {
  try {
    const u = new URL(input.trim());
    if (!/(^|\.)youtube\.com$/.test(u.hostname) && u.hostname !== "youtu.be") return null;
    const list = u.searchParams.get("list");
    return list ? { id: list } : null;
  } catch {
    return null;
  }
}

/** "PT3M20S" → 200000 */
function isoDurationMs(iso?: string): number | undefined {
  const m = iso?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return undefined;
  return ((Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0)) * 1000;
}

const NOISE =
  /\s*[\(\[](?:official\s*)?(?:music\s*|lyric\s*|lyrics\s*|audio\s*|visuali[sz]er\s*|hd\s*|4k\s*|hq\s*)*(?:video|audio|lyrics?|visuali[sz]er|mv)[^\)\]]*[\)\]]/gi;

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Turn a video into a track. "Artist - Topic" channels (auto-generated official audio) have descriptions like:
 *   Provided to YouTube by …
 *   Blinding Lights · The Weeknd
 *   After Hours
 * Other uploads usually title themselves "Artist - Song (Official Video)".
 */
export function videoToTrack(v: any): Track | null {
  const id = typeof v?.id === "string" ? v.id : v?.id?.videoId;
  const sn = v?.snippet;
  if (!id || !sn?.title || sn.title === "Private video" || sn.title === "Deleted video") return null;
  const channel: string = sn.videoOwnerChannelTitle ?? sn.channelTitle ?? "";
  const isTopic = / - Topic$/.test(channel);
  let title: string = sn.title;
  let artists: string[] = [];
  let album: string | undefined;

  if (isTopic && typeof sn.description === "string") {
    const lines = sn.description.split("\n").map((l: string) => l.trim()).filter(Boolean);
    const credit = lines.findIndex((l: string) => l.includes(" · "));
    if (credit >= 0) {
      const [t, ...a] = lines[credit].split(" · ");
      title = t || title;
      artists = a.filter(Boolean);
      const next = lines[credit + 1];
      if (next && !/^℗|^Released on|^Provided to YouTube|^Auto-generated/.test(next)) album = next;
    }
  }
  if (!artists.length) {
    const cleanChannel = channel.replace(/ - Topic$/, "").replace(/VEVO$/i, "").replace(/\s*Official$/i, "").trim();
    const dash = title.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    if (!isTopic && dash) {
      artists = [dash[1].trim()];
      title = dash[2];
    } else if (cleanChannel) {
      artists = [cleanChannel];
    }
  }
  title = title.replace(NOISE, "").trim();

  // Official: YouTube's auto-generated "Artist - Topic" audio, VEVO, or a channel named like the artist.
  const squash = (s: string) => s.toLowerCase().replace(/vevo$|official$|\s+|[^\p{L}\p{N}]/gu, "");
  const ch = squash(channel.replace(/ - Topic$/, ""));
  const official = isTopic || /VEVO$/i.test(channel) || (ch.length > 1 && artists.some((a) => squash(a) === ch || squash(a).startsWith(ch) || ch.startsWith(squash(a))));

  return {
    title,
    artists,
    album,
    durationMs: isoDurationMs(v?.contentDetails?.duration),
    artworkUrl: sn.thumbnails?.high?.url ?? sn.thumbnails?.medium?.url ?? sn.thumbnails?.default?.url,
    url: `https://music.youtube.com/watch?v=${id}`,
    ids: { youtube: id },
    official,
  };
}
