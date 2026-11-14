import { NextResponse } from "next/server";
import { track } from "@/lib/analytics";
import { env } from "@/lib/env";
import { jsonError } from "@/lib/http";
import { AppleAdapter } from "@/lib/platforms/apple";
import { saveConnection } from "@/lib/platforms/index";
import { ensureUserId } from "@/lib/session";

/** Receives the Music User Token that MusicKit JS produced in the browser. */
export async function POST(req: Request) {
  try {
    const userId = await ensureUserId();
    if (env.mock) {
      await saveConnection({ userId, platform: "apple", accessToken: "mock", storefront: "us", displayName: "Demo Apple Music user" });
      return NextResponse.json({ ok: true });
    }
    const { musicUserToken } = (await req.json()) as { musicUserToken?: string };
    if (!musicUserToken || typeof musicUserToken !== "string") throw new Error("Missing Apple Music user token");
    // Verifies the token works and finds the user's country catalog.
    const storefront = await new AppleAdapter(musicUserToken).fetchStorefront();
    await saveConnection({ userId, platform: "apple", accessToken: musicUserToken, storefront, displayName: "Apple Music" });
    await track("platform_connected", { source: "apple" });
    return NextResponse.json({ ok: true, storefront });
  } catch (err) {
    return jsonError(err);
  }
}
