import { NextResponse, type NextRequest } from "next/server";
import { track } from "@/lib/analytics";
import { env } from "@/lib/env";
import { safeReturnTo } from "@/lib/http";
import { saveConnection } from "@/lib/platforms/index";
import { exchangeGoogleCode, YouTubeAdapter } from "@/lib/platforms/youtube";
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
    res.cookies.delete({ name: "tb_oauth", path: "/api/auth/youtube" });
    return res;
  };

  if (params.get("error")) return back(params.get("error") === "access_denied" ? "Google sign-in was cancelled." : `Google: ${params.get("error")}`);
  const code = params.get("code");
  if (!code || !saved.state || params.get("state") !== saved.state) return back("Google sign-in expired, try again.");

  try {
    const tokens = await exchangeGoogleCode(code);
    const me = await new YouTubeAdapter(tokens.access_token).me().catch(() => ({ name: undefined }));
    const userId = await ensureUserId();
    await saveConnection({
      userId,
      platform: "youtube",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      displayName: me.name ?? "YouTube Music",
    });
    await track("platform_connected", { source: "youtube" });
    return back();
  } catch (err) {
    console.error("[youtube callback]", err);
    return back("Couldn't connect YouTube Music. Try again.");
  }
}
