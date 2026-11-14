import { NextResponse } from "next/server";
import { track } from "@/lib/analytics";
import { isPlatform, jsonError } from "@/lib/http";
import { createUniversalPlaylist, parsePlaylistInput, shareUrl } from "@/lib/playlists";
import { ensureUserId } from "@/lib/session";
import type { Platform } from "@/lib/types";

/** Create a universal link from { platform, playlistId } or from a pasted { url }. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { platform?: string; playlistId?: string; url?: string };
    let target: { platform: Platform; id: string; storefront?: string } | null = null;
    if (body.url) {
      target = parsePlaylistInput(body.url);
      if (!target) throw new Error("That doesn't look like a YouTube Music or Apple Music playlist link.");
    } else if (isPlatform(body.platform) && body.playlistId) {
      target = { platform: body.platform, id: body.playlistId };
    } else {
      throw new Error("Pick a playlist or paste a link.");
    }
    const userId = await ensureUserId();
    const doc = await createUniversalPlaylist(userId, target.platform, target.id, target.storefront);
    await track("universal_link_created", { source: target.platform, value: doc.tracks.length });
    return NextResponse.json({ slug: doc.slug, shareUrl: shareUrl(doc.slug) });
  } catch (err) {
    return jsonError(err);
  }
}
