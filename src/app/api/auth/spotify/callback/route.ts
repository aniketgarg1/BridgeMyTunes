import { NextResponse, type NextRequest } from "next/server";
import { track } from "@/lib/analytics";
import { env } from "@/lib/env";
import { safeReturnTo } from "@/lib/http";
import { saveConnection } from "@/lib/platforms/index";
import { exchangeSpotifyCode, SpotifyAdapter } from "@/lib/platforms/spotify";
import { ensureUserId } from "@/lib/session";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  let saved: { state?: string; returnTo?: string } = {};
  try {
    saved = JSON.parse(req.cookies.get("tb_oauth")?.value ?? "{}");
  } catch {}
  const returnTo = safeReturnTo(saved.returnTo);
  const back = (error?: string) => {
    const url = new URL(returnTo, env.appUrl);
    if (error) url.searchParams.set("error", error);
    const res = NextResponse.redirect(url);
    res.cookies.delete({ name: "tb_oauth", path: "/api/auth/spotify" });
    return res;
  };

  if (params.get("error")) return back(`Spotify: ${params.get("error")}`);
  const code = params.get("code");
  if (!code || !saved.state || params.get("state") !== saved.state) return back("Spotify login expired, try again.");

  try {
    const tokens = await exchangeSpotifyCode(code);
    const me = await new SpotifyAdapter(tokens.access_token).me();
    const userId = await ensureUserId();
    await saveConnection({
      userId,
      platform: "spotify",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      externalUserId: me.id,
      displayName: me.display_name ?? me.id,
    });
    await track("platform_connected", { source: "spotify" });
    return back();
  } catch (err) {
    console.error("[spotify callback]", err);
    // Dev-mode apps reject users who aren't on the app's allowlist with a 403 here.
    return back("Spotify sign-in is invite-only for now, and this Spotify account isn't on our tester list yet. Send us the email you use for Spotify and we'll add it.");
  }
}
