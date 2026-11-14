import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { getUniversalPlaylist, publicPlaylist, syncUniversalPlaylist } from "@/lib/playlists";
import { getUserId } from "@/lib/session";

export async function GET(_req: Request, ctx: RouteContext<"/api/playlists/[slug]">) {
  try {
    const { slug } = await ctx.params;
    const doc = await getUniversalPlaylist(slug);
    if (!doc) return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    // Live link: re-sync from the source if the snapshot is stale.
    const fresh = await syncUniversalPlaylist(doc);
    return NextResponse.json(publicPlaylist(fresh, await getUserId()));
  } catch (err) {
    return jsonError(err);
  }
}
