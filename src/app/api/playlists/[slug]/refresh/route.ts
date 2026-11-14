import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { getUniversalPlaylist, publicPlaylist, syncUniversalPlaylist } from "@/lib/playlists";
import { getUserId } from "@/lib/session";

/** Owner-triggered immediate re-sync. */
export async function POST(_req: Request, ctx: RouteContext<"/api/playlists/[slug]/refresh">) {
  try {
    const { slug } = await ctx.params;
    const userId = await getUserId();
    const doc = await getUniversalPlaylist(slug);
    if (!doc) return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    if (!userId?.equals(doc.ownerId)) return NextResponse.json({ error: "Only the owner can refresh" }, { status: 403 });
    return NextResponse.json(publicPlaylist(await syncUniversalPlaylist(doc, true), userId));
  } catch (err) {
    return jsonError(err);
  }
}
