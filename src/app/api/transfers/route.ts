import { after, NextResponse } from "next/server";
import { collections } from "@/lib/db";
import { isPlatform, jsonError } from "@/lib/http";
import { houseAvailable } from "@/lib/platforms/house";
import { getConnection, NotConnectedError } from "@/lib/platforms/index";
import { createTransfer, runTransfer } from "@/lib/transfers/worker";
import type { TransferSource } from "@/lib/types";
import { ensureUserId, getUserId } from "@/lib/session";

// Transfers run after the response is sent. On Vercel this keeps the function alive (up to maxDuration).
export const maxDuration = 300;

function parseSource(raw: unknown): TransferSource {
  const s = raw as Record<string, unknown> | null;
  if (s?.type === "universal" && typeof s.slug === "string") return { type: "universal", slug: s.slug };
  if (s?.type === "playlist" && isPlatform(s.platform) && typeof s.id === "string") return { type: "playlist", platform: s.platform, id: s.id };
  if (s?.type === "liked" && isPlatform(s.platform)) return { type: "liked", platform: s.platform };
  throw new Error("Invalid transfer source");
}

/** Start one or more transfers: { destination, sources: [...] }. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { destination?: string; sources?: unknown[] };
    if (!isPlatform(body.destination)) throw new Error("Pick a destination service");
    const sources = (body.sources ?? []).map(parseSource);
    if (!sources.length || sources.length > 50) throw new Error("Pick between 1 and 50 things to transfer");
    const userId = await ensureUserId();
    // The house account only makes public playlists of shared links, never someone's own library or playlists.
    const viaHouse = body.destination === "spotify" && sources.every((s) => s.type === "universal") && (await houseAvailable());
    if (!viaHouse && !(await getConnection(userId, body.destination))) throw new NotConnectedError(body.destination);
    for (const s of sources) {
      if (s.type !== "universal" && !(await getConnection(userId, s.platform))) throw new NotConnectedError(s.platform);
    }
    const ids = [];
    for (const s of sources) {
      const id = await createTransfer(userId, s, body.destination);
      after(() => runTransfer(id).catch((err) => console.error(`[transfer ${id}] crashed:`, err)));
      ids.push(id.toHexString());
    }
    return NextResponse.json({ ids });
  } catch (err) {
    return jsonError(err);
  }
}

/** The current user's recent transfers (summaries only). */
export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ transfers: [] });
    const { transfers } = await collections();
    const docs = await transfers
      .find({ userId }, { projection: { results: 0 } })
      .sort({ createdAt: -1 })
      .limit(30)
      .toArray();
    return NextResponse.json({
      transfers: docs.map((d) => ({
        id: d._id!.toHexString(),
        sourceName: d.sourceName,
        source: d.source,
        destination: d.destination,
        status: d.status,
        total: d.total,
        processed: d.processed,
        createdAt: d.createdAt,
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}
