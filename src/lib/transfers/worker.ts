import "server-only";
import { ObjectId } from "mongodb";
import { track } from "../analytics";
import { collections, type TransferDoc } from "../db";
import { matchTracks, rememberManualMatch } from "../matching/matcher";
import { adapterFor } from "../platforms/index";
import { getUniversalPlaylist, syncUniversalPlaylist } from "../playlists";
import type { MatchResult, Platform, Track, TransferSource } from "../types";
import { PLATFORM_LABEL } from "../types";

/*
 * Transfer job: read source → match → write destination. Progress is persisted to MongoDB so the UI can
 * poll it. The API route runs it with `after()` once the response is sent. To move it to dedicated workers,
 * call `runTransfer` from a queue consumer instead.
 */

export async function createTransfer(
  userId: ObjectId,
  source: TransferSource,
  destination: Platform,
): Promise<ObjectId> {
  const { transfers } = await collections();
  const now = new Date();
  const doc: TransferDoc = {
    userId,
    source,
    destination,
    mode: source.type === "liked" ? "library" : "playlist",
    status: "queued",
    total: 0,
    processed: 0,
    results: [],
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId } = await transfers.insertOne(doc);
  return insertedId;
}

async function readSource(userId: ObjectId, source: TransferSource): Promise<{ name: string; description?: string; tracks: Track[] }> {
  if (source.type === "universal") {
    const doc = await getUniversalPlaylist(source.slug);
    if (!doc) throw new Error("This universal playlist no longer exists.");
    const fresh = await syncUniversalPlaylist(doc);
    return { name: fresh.name, description: fresh.description, tracks: fresh.tracks };
  }
  const adapter = await adapterFor(userId, source.platform);
  if (source.type === "liked") {
    return { name: `Liked songs from ${PLATFORM_LABEL[source.platform]}`, tracks: await adapter.getLikedTracks() };
  }
  const snap = await adapter.getPlaylist(source.id);
  return { name: snap.name, description: snap.description, tracks: snap.tracks };
}

const destIds = (results: MatchResult[], dest: Platform) => {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const r of results) {
    const id = r.status === "matched" && !r.skipped ? r.match?.ids[dest] : undefined;
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
};

export async function runTransfer(id: ObjectId) {
  const { transfers } = await collections();
  const t = await transfers.findOne({ _id: id });
  if (!t) return;
  const started = Date.now();
  const timings: Record<string, number> = {};
  const set = (fields: Partial<TransferDoc>) => transfers.updateOne({ _id: id }, { $set: { ...fields, updatedAt: new Date() } });
  const sourcePlatform = t.source.type === "universal" ? undefined : t.source.platform;
  const tags = { transferId: id.toHexString(), source: sourcePlatform ?? "universal", destination: t.destination };

  try {
    await set({ status: "reading" });
    await track("transfer_started", tags);
    const dest = await adapterFor(t.userId, t.destination);
    const src = await readSource(t.userId, t.source);
    timings.readMs = Date.now() - started;
    await set({ status: "matching", sourceName: src.name, total: src.tracks.length });

    const matchStart = Date.now();
    let lastWrite = 0;
    const results = await matchTracks(src.tracks, dest, {
      onProgress: async (partial, processed) => {
        // Throttle progress writes to roughly 4/s.
        if (Date.now() - lastWrite < 250 && processed < src.tracks.length) return;
        lastWrite = Date.now();
        await set({ processed, results: partial.filter(Boolean) as MatchResult[] });
      },
    });
    timings.matchMs = Date.now() - matchStart;

    await set({ status: "writing", processed: results.length, results });
    const writeStart = Date.now();
    const ids = destIds(results, t.destination);
    let destPlaylistId: string | undefined;
    let destUrl: string | undefined;
    if (t.mode === "library") {
      if (ids.length) await dest.saveToLibrary(ids);
    } else if (t.destPlaylistId) {
      // A retry: fill the playlist the earlier attempt already created instead of making a second one.
      destPlaylistId = t.destPlaylistId;
      destUrl = t.destUrl;
      await dest.addToPlaylist(destPlaylistId, ids);
    } else {
      const description = src.description ?? `Shared with BridgeMyTunes${sourcePlatform ? ` from ${PLATFORM_LABEL[sourcePlatform]}` : ""}`;
      if (t.destination === "youtube") {
        // YouTube adds songs one by one and can fail midway, so remember the playlist before filling it.
        const created = await dest.createPlaylist(src.name, description, []);
        destPlaylistId = created.id;
        destUrl = created.url;
        await set({ destPlaylistId, destUrl });
        await dest.addToPlaylist(destPlaylistId, ids);
      } else {
        const created = await dest.createPlaylist(src.name, description, ids);
        destPlaylistId = created.id;
        destUrl = created.url;
      }
    }
    const written = new Set(ids);
    for (const r of results) if (r.match?.ids[t.destination] && written.has(r.match.ids[t.destination]!) && r.status === "matched") r.added = true;
    timings.writeMs = Date.now() - writeStart;
    timings.totalMs = Date.now() - started;

    await set({ status: "done", results, destPlaylistId, destUrl, finishedAt: new Date(), timings });

    const count = (s: MatchResult["status"]) => results.filter((r) => r.status === s).length;
    const matched = count("matched");
    await track("transfer_completed", {
      ...tags,
      value: results.length ? matched / results.length : 1,
      total: results.length,
      matched,
      uncertain: count("uncertain"),
      unavailable: count("unavailable"),
      byMethod: Object.fromEntries(["cache", "isrc", "metadata", "ai"].map((m) => [m, results.filter((r) => r.method === m && r.status === "matched").length])),
      ...timings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[transfer ${id}] failed:`, err);
    await set({ status: "failed", error: message, finishedAt: new Date() });
    await track("transfer_failed", { ...tags, error: message.slice(0, 300) });
  }
}

/**
 * Apply review decisions: for each index, either a chosen destination track or null (skip).
 * Newly chosen tracks are appended to the destination playlist (or saved to the library).
 */
export async function resolveTransfer(
  userId: ObjectId,
  id: ObjectId,
  decisions: { index: number; track: Track | null }[],
) {
  const { transfers } = await collections();
  const t = await transfers.findOne({ _id: id, userId });
  if (!t) throw new Error("Transfer not found");
  if (t.status !== "done") throw new Error("Wait for the transfer to finish before reviewing.");

  const toAdd: string[] = [];
  for (const d of decisions) {
    const r = t.results[d.index];
    if (!r || r.added) continue;
    if (d.track === null) {
      r.skipped = true;
      continue;
    }
    const destId = d.track.ids[t.destination];
    if (!destId) continue;
    r.match = d.track;
    r.status = "matched";
    r.method = "manual";
    r.confidence = 1;
    r.skipped = false;
    toAdd.push(destId);
    await rememberManualMatch(r.source, t.destination, d.track);
  }

  if (toAdd.length) {
    const dest = await adapterFor(userId, t.destination);
    if (t.mode === "library") await dest.saveToLibrary(toAdd);
    else if (t.destPlaylistId) await dest.addToPlaylist(t.destPlaylistId, toAdd);
    const added = new Set(toAdd);
    for (const r of t.results) if (r.match?.ids[t.destination] && added.has(r.match.ids[t.destination]!) && r.status === "matched") r.added = true;
  }

  await transfers.updateOne({ _id: id }, { $set: { results: t.results, updatedAt: new Date() } });
  await track("transfer_reviewed", { transferId: id.toHexString(), destination: t.destination, value: toAdd.length });
  return t.results;
}
