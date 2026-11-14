import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { collections } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { getUserId } from "@/lib/session";

const STALE_MS = 6 * 60_000;

export async function GET(_req: Request, ctx: RouteContext<"/api/transfers/[id]">) {
  try {
    const { id } = await ctx.params;
    const userId = await getUserId();
    if (!userId || !ObjectId.isValid(id)) return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
    const { transfers } = await collections();
    let t = await transfers.findOne({ _id: new ObjectId(id), userId });
    if (!t) return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
    // A serverless function that hit its time limit leaves the job "running" forever; surface it as failed.
    const running = !["done", "failed"].includes(t.status);
    if (running && Date.now() - t.updatedAt.getTime() > STALE_MS) {
      const error = "This transfer stopped responding. Try again; songs matched so far are remembered.";
      await transfers.updateOne({ _id: t._id }, { $set: { status: "failed", error, finishedAt: new Date() } });
      t = { ...t, status: "failed", error };
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id, userId: _u, ...rest } = t;
    return NextResponse.json({ id, ...rest });
  } catch (err) {
    return jsonError(err);
  }
}
