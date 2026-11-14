import "server-only";
import { NextResponse } from "next/server";
import { NotConnectedError } from "./platforms/index";
import { PlatformError } from "./platforms/types";
import { ALL_PLATFORMS, type Platform } from "./types";

export const isPlatform = (v: unknown): v is Platform => typeof v === "string" && (ALL_PLATFORMS as string[]).includes(v);

export function jsonError(err: unknown) {
  if (err instanceof NotConnectedError) {
    return NextResponse.json({ error: err.message, needsConnect: err.platform }, { status: 401 });
  }
  if (err instanceof PlatformError) {
    if (err.platform === "youtube" && /quotaExceeded/.test(err.message)) {
      return NextResponse.json({ error: "YouTube's daily limit for this app is used up. It resets at midnight Pacific time." }, { status: 429 });
    }
    const hint =
      err.status === 403 && err.platform === "spotify"
        ? " Spotify only shares tracks of playlists you own or collaborate on."
        : err.status === 401
          ? " Your session with this service expired. Reconnect it."
          : "";
    console.error(err);
    return NextResponse.json({ error: `${err.message.split(":")[0]}.${hint}`, needsConnect: err.status === 401 ? err.platform : undefined }, { status: err.status === 401 ? 401 : 502 });
  }
  const message = err instanceof Error ? err.message : "Something went wrong";
  console.error(err);
  return NextResponse.json({ error: message }, { status: 400 });
}

/** Only allow same-site relative paths as post-login redirect targets. */
export function safeReturnTo(v: string | null | undefined, fallback = "/") {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : fallback;
}
