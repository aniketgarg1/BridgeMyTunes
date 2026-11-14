import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeReturnTo } from "@/lib/http";
import { saveConnection } from "@/lib/platforms/index";
import { youtubeAuthorizeUrl } from "@/lib/platforms/youtube";
import { ensureUserId } from "@/lib/session";

export async function GET(req: NextRequest) {
  const returnTo = safeReturnTo(req.nextUrl.searchParams.get("returnTo"));
  try {
    return await startLogin(returnTo);
  } catch (err) {
    // Usually a missing setting (database or Spotify keys). Show it on the page instead of a blank error.
    console.error("[spotify login]", err);
    const url = new URL(returnTo, env.appUrl);
    url.searchParams.set("error", err instanceof Error ? err.message : "Couldn't start Google sign-in");
    return NextResponse.redirect(url);
  }
}

async function startLogin(returnTo: string) {
  const userId = await ensureUserId();

  if (env.mock) {
    await saveConnection({ userId, platform: "youtube", accessToken: "mock", displayName: "Demo YouTube user" });
    return NextResponse.redirect(new URL(returnTo, env.appUrl));
  }

  const state = randomBytes(16).toString("base64url");
  const res = NextResponse.redirect(youtubeAuthorizeUrl(state));
  res.cookies.set("tb_oauth", JSON.stringify({ state, returnTo }), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.appUrl.startsWith("https://"),
    path: "/api/auth/youtube",
    maxAge: 600,
  });
  return res;
}
