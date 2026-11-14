import { NextResponse, type NextRequest } from "next/server";
import { isPlatform, jsonError } from "@/lib/http";
import { adapterFor, NotConnectedError } from "@/lib/platforms/index";
import { getUserId } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    const platform = req.nextUrl.searchParams.get("platform");
    if (!isPlatform(platform)) throw new Error("Unknown platform");
    const userId = await getUserId();
    if (!userId) throw new NotConnectedError(platform);
    const adapter = await adapterFor(userId, platform);
    return NextResponse.json({ playlists: await adapter.listPlaylists() });
  } catch (err) {
    return jsonError(err);
  }
}
