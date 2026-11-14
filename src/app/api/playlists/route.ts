import { NextResponse } from "next/server";
import { track } from "@/lib/analytics";
import { isPlatform, jsonError } from "@/lib/http";
import { parseMusicLink, parseSongLinks, type MusicLink } from "@/lib/links";
import { createShare, createShareFromSongs, shareUrl } from "@/lib/playlists";
import { ensureUserId } from "@/lib/session";

/** Create a share page from { platform, playlistId } or any pasted song, album or playlist { url }. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { platform?: string; playlistId?: string; url?: string; name?: string };
    // Several song links in one paste (a Spotify desktop copy, or a list): one shared list of songs.
    const songs = body.url ? parseSongLinks(body.url) : [];
    if (songs.length > 1) {
      const userId = await ensureUserId();
      const doc = await createShareFromSongs(userId, songs, typeof body.name === "string" ? body.name : undefined);
      await track("share_created", { source: songs[0].platform, kind: "songs", value: doc.tracks.length });
      return NextResponse.json({ slug: doc.slug, shareUrl: shareUrl(doc.slug) });
    }
    let target: MusicLink | null = null;
    if (body.url) {
      target = parseMusicLink(body.url);
      if (!target) throw new Error("Paste a song, album or playlist link from YouTube Music, Apple Music or Spotify.");
    } else if (isPlatform(body.platform) && body.playlistId) {
      target = { platform: body.platform, kind: "collection", id: body.playlistId };
    } else {
      throw new Error("Pick a playlist or paste a link.");
    }
    const userId = await ensureUserId();
    const doc = await createShare(userId, target);
    await track("share_created", { source: target.platform, kind: target.kind, value: doc.tracks.length });
    return NextResponse.json({ slug: doc.slug, shareUrl: shareUrl(doc.slug) });
  } catch (err) {
    return jsonError(err);
  }
}
