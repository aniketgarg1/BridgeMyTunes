import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { jsonError } from "@/lib/http";
import { appleDeveloperToken } from "@/lib/platforms/apple";

/** The developer token is meant to be public (MusicKit JS needs it in the browser). */
export async function GET() {
  if (env.mock) return NextResponse.json({ mock: true });
  try {
    return NextResponse.json({ developerToken: await appleDeveloperToken() });
  } catch (err) {
    return jsonError(err);
  }
}
