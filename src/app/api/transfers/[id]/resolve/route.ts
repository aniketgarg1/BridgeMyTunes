import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { getUserId } from "@/lib/session";
import { resolveTransfer } from "@/lib/transfers/worker";
import type { Track } from "@/lib/types";

/** Body: { decisions: [{ index, track | null }] } — null skips the song. */
export async function POST(req: Request, ctx: RouteContext<"/api/transfers/[id]/resolve">) {
  try {
    const { id } = await ctx.params;
    const userId = await getUserId();
    if (!userId || !ObjectId.isValid(id)) return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
    const { decisions } = (await req.json()) as { decisions?: { index: number; track: Track | null }[] };
    if (!Array.isArray(decisions)) throw new Error("Missing decisions");
    const clean = decisions
      .filter((d) => Number.isInteger(d.index) && (d.track === null || (typeof d.track?.title === "string" && typeof d.track?.ids === "object")))
      .slice(0, 1000);
    const results = await resolveTransfer(userId, new ObjectId(id), clean);
    return NextResponse.json({ results });
  } catch (err) {
    return jsonError(err);
  }
}
