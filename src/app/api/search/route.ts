import { NextResponse, type NextRequest } from "next/server";
import { isPlatform, jsonError } from "@/lib/http";
import { adapterFor, NotConnectedError } from "@/lib/platforms/index";
import { getUserId } from "@/lib/session";

/** Manual replacement search on the destination catalog. */
export async function GET(req: NextRequest) {
  try {
    const platform = req.nextUrl.searchParams.get("platform");
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
    if (!isPlatform(platform)) throw new Error("Unknown platform");
    if (!q) return NextResponse.json({ tracks: [] });
    const userId = await getUserId();
    if (!userId) throw new NotConnectedError(platform);
    const adapter = await adapterFor(userId, platform);
    return NextResponse.json({ tracks: await adapter.searchText(q.slice(0, 200)) });
  } catch (err) {
    return jsonError(err);
  }
}
