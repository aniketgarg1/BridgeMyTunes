import { ObjectId } from "mongodb";
import { after, NextResponse } from "next/server";
import { collections } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { getUserId } from "@/lib/session";
import { runTransfer } from "@/lib/transfers/worker";

export const maxDuration = 300;

/** Re-run a failed transfer. Songs matched last time come from the match cache, so no search quota is spent twice. */
export async function POST(_req: Request, ctx: RouteContext<"/api/transfers/[id]/retry">) {
  try {
    const { id } = await ctx.params;
    const userId = await getUserId();
    if (!userId || !ObjectId.isValid(id)) return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
    const _id = new ObjectId(id);
    const { transfers } = await collections();
    const res = await transfers.updateOne(
      { _id, userId, status: "failed" },
      { $set: { status: "queued", processed: 0, results: [], updatedAt: new Date() }, $unset: { error: "", finishedAt: "" } },
    );
    if (!res.modifiedCount) return NextResponse.json({ error: "Only failed transfers can be retried" }, { status: 409 });
    after(() => runTransfer(_id).catch((err) => console.error(`[transfer ${id}] retry crashed:`, err)));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
