import "server-only";
import { collections } from "../db";
import type { MusicAdapter } from "../platforms/types";
import type { MatchResult, Platform, Replacement, ScoredCandidate, Track } from "../types";
import { adjudicate, aiEnabled, suggestReplacements, suggestSearches, type AiCase } from "./gemini";
import { MAJOR_TAGS, parseTitle, primaryArtist } from "./normalize";
import { AUTO_ACCEPT, CONSIDER, rankCandidates } from "./score";

/*
 * Matching pipeline for each source track, cheapest and most certain first:
 *   1. already known  – the track carries a destination id, or a confirmed mapping is cached in MongoDB
 *   2. ISRC           – exact recording lookup on the destination
 *   3. metadata       – search by title + artist, score title/artist/album/duration/version
 *   3b. Gemini search – for songs the search missed, Gemini suggests cleaner searches (video noise removed,
 *                      real artist, other script); the results are scored by the same rules as step 3
 *   4. Gemini         – batch-adjudicate anything that scored between CONSIDER and AUTO_ACCEPT
 *   4b. replacements  – for songs that still aren't there, Gemini suggests up to 3 similar songs, each confirmed to
 *                      exist on the destination by a search; the user can add one instead on the review screen
 *   5. user review    – whatever is still uncertain or unavailable
 */

const MAX_CANDIDATES = 5;
/** At most this many missed songs per transfer get Gemini searches (each search costs destination API quota). */
const MAX_RESCUES = 25;
/** At most this many missing songs per transfer get replacement suggestions, at most 2 offered each (quota again). */
const MAX_REPLACED = 10;
const REPLACEMENTS_EACH = 2;

const cacheKeys = (t: Track, dest: Platform) => {
  const keys = Object.entries(t.ids)
    .filter(([p, id]) => p !== dest && id)
    .map(([p, id]) => `${p}:${id}`);
  if (t.isrc) keys.push(`isrc:${t.isrc}`);
  return keys;
};

function searchTitle(t: Track) {
  const p = parseTitle(t.title);
  const majors = [...p.tags].filter((tag) => MAJOR_TAGS.has(tag));
  return [p.base, ...majors].join(" ");
}

const strip = (c: ScoredCandidate & { breakdown?: unknown }): ScoredCandidate => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { breakdown, ...rest } = c;
  return rest;
};

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

export interface MatchOptions {
  onProgress?: (results: (MatchResult | undefined)[], processed: number) => Promise<void> | void;
  concurrency?: number;
}

export async function matchTracks(tracks: Track[], dest: MusicAdapter, opts: MatchOptions = {}): Promise<MatchResult[]> {
  const destPlatform = dest.platform;
  const results: (MatchResult | undefined)[] = new Array(tracks.length);
  let processed = 0;
  const report = async () => opts.onProgress?.(results, processed);

  const settle = (i: number, r: Omit<MatchResult, "index" | "source" | "added">) => {
    results[i] = { index: i, source: tracks[i], added: false, ...r };
    processed++;
  };

  // 1. Known ids + cache
  const { mappings } = await collections();
  const allKeys = [...new Set(tracks.flatMap((t) => cacheKeys(t, destPlatform)))];
  const cached = allKeys.length
    ? await mappings.find({ destination: destPlatform, key: { $in: allKeys } }).toArray()
    : [];
  const cacheByKey = new Map(cached.map((m) => [m.key, m]));

  const pending: number[] = [];
  tracks.forEach((t, i) => {
    if (t.ids[destPlatform]) {
      return settle(i, { status: "matched", method: "cache", confidence: 1, match: t, candidates: [], flags: [] });
    }
    const hit = cacheKeys(t, destPlatform).map((k) => cacheByKey.get(k)).find(Boolean);
    if (hit) {
      return settle(i, { status: "matched", method: "cache", confidence: hit.confidence, match: hit.track, candidates: [], flags: [] });
    }
    pending.push(i);
  });
  await report();

  // 2. ISRC lookups in bulk
  const isrcs = [...new Set(pending.map((i) => tracks[i].isrc).filter(Boolean) as string[])];
  let byIsrc = new Map<string, Track[]>();
  try {
    byIsrc = isrcs.length ? await dest.lookupByIsrc(isrcs) : byIsrc;
  } catch (err) {
    console.warn("[match] ISRC lookup failed, falling back to search:", err);
  }

  // 3. Per-track scoring (with search when ISRC wasn't conclusive)
  const forAi: AiCase[] = [];
  await pool(pending, opts.concurrency ?? 4, async (i) => {
    const src = tracks[i];
    let ranked = rankCandidates(src, src.isrc ? (byIsrc.get(src.isrc) ?? []) : []);
    let method: MatchResult["method"] = "isrc";

    if (!ranked[0] || ranked[0].score < AUTO_ACCEPT) {
      method = "metadata";
      try {
        const found = await dest.search({ title: searchTitle(src), artist: primaryArtist(src.artists), album: src.album });
        ranked = rankCandidates(src, [...ranked, ...found]);
      } catch (err) {
        console.warn(`[match] search failed for "${src.title}":`, err);
      }
    }

    const best = ranked[0];
    const candidates = ranked.slice(0, MAX_CANDIDATES).map(strip);
    if (best && best.score >= AUTO_ACCEPT) {
      settle(i, {
        status: "matched",
        method: best.breakdown.isrc ? "isrc" : method,
        confidence: best.score,
        match: strip(best),
        candidates,
        flags: best.breakdown.flags,
      });
    } else if (best && best.score >= CONSIDER) {
      // Tentatively uncertain; Gemini may promote or reject it below.
      settle(i, { status: "uncertain", method: "metadata", confidence: best.score, match: strip(best), candidates, flags: best.breakdown.flags });
      forAi.push({ key: i, source: src, candidates });
    } else {
      settle(i, { status: "unavailable", method: "none", confidence: best?.score ?? 0, candidates, flags: [] });
    }
    await report();
  });

  // 3b. Songs the search missed: Gemini suggests cleaner searches, which are scored like any other result.
  const missed = results
    .filter((r): r is MatchResult => r?.status === "unavailable")
    .slice(0, MAX_RESCUES)
    .map((r) => r.index);
  if (aiEnabled() && missed.length) {
    for (let b = 0; b < missed.length; b += 10) {
      const batch = missed.slice(b, b + 10);
      const suggestions = await suggestSearches(
        batch.map((i) => ({ key: i, source: tracks[i] })),
        destPlatform,
      );
      await pool(suggestions, 3, async ({ key: i, queries }) => {
        const src = tracks[i];
        let ranked = rankCandidates(src, results[i]!.candidates);
        for (const q of queries) {
          try {
            ranked = rankCandidates(src, [...ranked, ...(await dest.search({ title: q.title, artist: q.artist }))]);
          } catch (err) {
            console.warn(`[match] Gemini search failed for "${q.title}":`, err);
          }
          if (ranked[0]?.score >= AUTO_ACCEPT) break;
        }
        const best = ranked[0];
        if (!best || best.score < CONSIDER) return;
        const candidates = ranked.slice(0, MAX_CANDIDATES).map(strip);
        const r = results[i]!;
        Object.assign(r, { match: strip(best), candidates, confidence: best.score, flags: best.breakdown.flags });
        if (best.score >= AUTO_ACCEPT) {
          r.status = "matched";
          r.method = "ai";
          r.aiReason = "Found with a cleaner search from Gemini";
        } else {
          r.status = "uncertain";
          r.method = "metadata";
          forAi.push({ key: i, source: src, candidates });
        }
      });
      await report();
    }
  }

  // 4. Gemini adjudication, 8 cases per request
  if (aiEnabled() && forAi.length) {
    for (let b = 0; b < forAi.length; b += 8) {
      const batch = forAi.slice(b, b + 8);
      const verdicts = await adjudicate(batch);
      for (const v of verdicts) {
        const r = results[v.key]!;
        const c = batch.find((x) => x.key === v.key)!;
        r.aiReason = v.reason;
        if (v.choice >= 0) {
          const pick = c.candidates[v.choice];
          r.match = pick;
          r.flags = v.differences.length ? v.differences : r.flags;
          r.confidence = Math.max(r.confidence, Math.min(v.confidence, 0.99));
          // Move the AI's pick to the front so the review screen suggests it.
          r.candidates = [pick, ...c.candidates.filter((_, k) => k !== v.choice)];
          const explicitSwap = r.source.explicit !== undefined && pick.explicit !== undefined && r.source.explicit !== pick.explicit;
          if (v.confidence >= 0.8 && !explicitSwap) {
            r.status = "matched";
            r.method = "ai";
          }
        } else if (v.confidence >= 0.8) {
          r.status = "unavailable";
          r.method = "ai";
          r.match = undefined;
        }
      }
      await report();
    }
  }

  // 4b. Still missing: offer similar songs that do exist on the destination. Suggestions only; nothing is added.
  const stillMissing = results
    .filter((r): r is MatchResult => r?.status === "unavailable")
    .slice(0, MAX_REPLACED)
    .map((r) => r.index);
  if (aiEnabled() && stillMissing.length) {
    const ideas = await suggestReplacements(
      stillMissing.map((i) => ({ key: i, source: tracks[i] })),
      destPlatform,
    );
    await pool(ideas, 3, async ({ key: i, songs }) => {
      const found: Replacement[] = [];
      for (const idea of songs) {
        if (found.length >= REPLACEMENTS_EACH) break;
        try {
          const want: Track = { title: idea.title, artists: [idea.artist], ids: {} };
          const best = rankCandidates(want, await dest.search({ title: idea.title, artist: idea.artist }))[0];
          // Only offer it if the destination really has that song (good title and artist match).
          if (best && best.score >= 0.8 && !found.some((f) => f.ids[destPlatform] === best.ids[destPlatform])) {
            found.push({ ...strip(best), why: idea.why });
          }
        } catch (err) {
          console.warn(`[match] replacement search failed for "${idea.title}":`, err);
        }
      }
      if (found.length) results[i]!.replacements = found;
    });
    await report();
  }

  const final = results as MatchResult[];

  // 5. Remember confident matches for next time
  const writes = final
    .filter((r) => r.status === "matched" && r.method !== "cache" && r.match)
    .flatMap((r) =>
      cacheKeys(r.source, destPlatform).map((key) => ({
        updateOne: {
          filter: { key, destination: destPlatform },
          update: {
            $set: { key, destination: destPlatform, track: r.match!, method: r.method, confidence: r.confidence, updatedAt: new Date() },
          },
          upsert: true,
        },
      })),
    );
  if (writes.length) await mappings.bulkWrite(writes, { ordered: false });

  return final;
}

export async function rememberManualMatch(source: Track, dest: Platform, match: Track) {
  const { mappings } = await collections();
  const keys = cacheKeys(source, dest);
  if (!keys.length) return;
  await mappings.bulkWrite(
    keys.map((key) => ({
      updateOne: {
        filter: { key, destination: dest },
        update: { $set: { key, destination: dest, track: match, method: "manual", confidence: 1, updatedAt: new Date() } },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}
