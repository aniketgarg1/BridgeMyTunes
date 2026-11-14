import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { collections } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { saveHouse } from "@/lib/platforms/house";
import { getUserId } from "@/lib/session";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * One-time setup: after signing in to Spotify on this site as the house account, open
 * /api/admin/spotify-house?key=<ADMIN_KEY>. The sign-in moves from this browser session to the house slot.
 */
export async function GET(req: NextRequest) {
  try {
    const expected = process.env.ADMIN_KEY ?? "";
    const key = req.nextUrl.searchParams.get("key") ?? "";
    if (!expected || !same(key, expected)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    const userId = await getUserId();
    const { connections } = await collections();
    const conn = userId ? await connections.findOne({ userId, platform: "spotify" }) : null;
    if (!conn) return NextResponse.json({ error: "Sign in to Spotify on this site as the house account first." }, { status: 400 });
    await saveHouse({
      accessToken: conn.accessToken,
      refreshToken: conn.refreshToken,
      expiresAt: conn.expiresAt,
      spotifyUserId: conn.externalUserId,
      displayName: conn.displayName,
    });
    // Move, don't copy: two holders of one refresh token break each other when Spotify rotates it.
    await connections.deleteOne({ _id: conn._id });
    return NextResponse.json({ ok: true, house: conn.displayName ?? conn.externalUserId });
  } catch (err) {
    return jsonError(err);
  }
}
