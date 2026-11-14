import { NextResponse } from "next/server";
import { collections } from "@/lib/db";
import { isPlatform, jsonError } from "@/lib/http";
import { getUserId } from "@/lib/session";

export async function POST(req: Request) {
  try {
    const { platform } = (await req.json()) as { platform?: string };
    if (!isPlatform(platform)) throw new Error("Unknown platform");
    const userId = await getUserId();
    if (userId) await (await collections()).connections.deleteOne({ userId, platform });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
