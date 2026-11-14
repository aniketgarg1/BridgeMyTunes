import type { ScoredCandidate, Track } from "../types";
import {
  MAJOR_TAGS,
  TAG_LABEL,
  basicNormalize,
  normalizeAlbum,
  parseTitle,
  similarity,
  splitArtists,
  type VersionTag,
} from "./normalize";

/** At or above this a match is accepted automatically. */
export const AUTO_ACCEPT = 0.85;
/** Between this and AUTO_ACCEPT a match is "uncertain" (Gemini is asked, then the user if still unsure). */
export const CONSIDER = 0.45;

export interface ScoreBreakdown {
  score: number;
  title: number;
  artist: number;
  duration: number | null;
  album: number | null;
  isrc: boolean;
  flags: string[];
  explicitMismatch: boolean;
}

function artistSet(t: Track): string[] {
  const fromTitle = parseTitle(t.title).featured;
  const all = t.artists.flatMap(splitArtists).map(basicNormalize);
  return [...new Set([...all, ...fromTitle])].filter(Boolean);
}

function artistScore(src: Track, cand: Track): number {
  const a = artistSet(src);
  const b = artistSet(cand);
  if (!a.length || !b.length) return 0.5;
  // Primary artist must line up with someone on the other side.
  const primary = Math.max(...b.map((x) => similarity(a[0], x)));
  // Overall overlap rewards matching featured artists too, whether listed as artists or in the title.
  const overlap = a.filter((x) => b.some((y) => similarity(x, y) > 0.85)).length / Math.min(a.length, b.length);
  return Math.min(1, primary * 0.75 + overlap * 0.25);
}

function durationScore(a?: number, b?: number): number | null {
  if (!a || !b) return null;
  const d = Math.abs(a - b) / 1000;
  if (d <= 2) return 1;
  if (d <= 5) return 0.9;
  if (d <= 10) return 0.7;
  if (d <= 20) return 0.4;
  if (d <= 40) return 0.15;
  return 0;
}

const diffTags = (a: Set<VersionTag>, b: Set<VersionTag>) => [...a].filter((t) => !b.has(t)).concat([...b].filter((t) => !a.has(t)));

export function scoreCandidate(src: Track, cand: Track): ScoreBreakdown {
  const ps = parseTitle(src.title);
  const pc = parseTitle(cand.title);
  const flags: string[] = [];

  const title = similarity(ps.base, pc.base);
  const artist = artistScore(src, cand);
  const duration = durationScore(src.durationMs, cand.durationMs);
  const sa = normalizeAlbum(src.album);
  const ca = normalizeAlbum(cand.album);
  const album = sa.base && ca.base ? similarity(sa.base, ca.base) : null;

  // Weighted average, re-normalised when duration/album are unknown.
  let num = title * 0.45 + artist * 0.3;
  let den = 0.75;
  if (duration !== null) {
    num += duration * 0.15;
    den += 0.15;
  }
  if (album !== null) {
    num += album * 0.1;
    den += 0.1;
  }
  let score = num / den;

  // Version differences. Album tags count too ("Rumours (2004 Remaster)").
  const srcTags = new Set([...ps.tags, ...sa.tags]);
  const candTags = new Set([...pc.tags, ...ca.tags]);
  for (const tag of diffTags(srcTags, candTags)) {
    const inCand = candTags.has(tag);
    if (MAJOR_TAGS.has(tag)) {
      score *= 0.6;
      flags.push(inCand ? TAG_LABEL[tag] : `Original is ${TAG_LABEL[tag].toLowerCase()}`);
    } else if (tag !== "clean") {
      score *= 0.97;
      flags.push(inCand ? TAG_LABEL[tag] : `Original is ${TAG_LABEL[tag].toLowerCase()}`);
    }
  }

  const explicitMismatch = src.explicit !== undefined && cand.explicit !== undefined && src.explicit !== cand.explicit;
  if (explicitMismatch) {
    score *= 0.9;
    flags.push(src.explicit ? "Clean version (original is explicit)" : "Explicit version (original is clean)");
  }

  // Featured artists: platforms disagree on title vs. artist list, so compare the merged sets.
  // A feature present on only one side usually means a different version ("Levitating" vs "Levitating (feat. DaBaby)").
  const srcAll = artistSet(src);
  const candAll = artistSet(cand);
  const has = (list: string[], x: string) => list.some((y) => similarity(x, y) > 0.85);
  const missing = srcAll.slice(1).filter((a) => !has(candAll, a));
  const extra = candAll.slice(1).filter((a) => !has(srcAll, a));
  if (missing.length) {
    score *= 0.8;
    flags.push(`Without ${missing.join(", ")}`);
  }
  if (extra.length) {
    score *= 0.8;
    flags.push(`Adds ${extra.join(", ")}`);
  }

  // Same ISRC = same recording (ISRC identifies a recording, not a song). Trust it unless metadata is wildly off.
  const isrc = Boolean(src.isrc && cand.isrc && src.isrc === cand.isrc);
  if (isrc) score = title > 0.5 || artist > 0.6 ? Math.max(score, 0.97) : Math.max(score, 0.75);

  // Never swap clean ⇄ explicit silently: keep it below auto-accept so the user decides.
  if (explicitMismatch) score = Math.min(score, AUTO_ACCEPT - 0.01);

  return { score: Math.round(score * 1000) / 1000, title, artist, duration, album, isrc, flags, explicitMismatch };
}

export function rankCandidates(src: Track, candidates: Track[]): (ScoredCandidate & { breakdown: ScoreBreakdown })[] {
  const seen = new Set<string>();
  const out: (ScoredCandidate & { breakdown: ScoreBreakdown })[] = [];
  for (const c of candidates) {
    const key = Object.values(c.ids).join("|") || `${c.title}|${c.artists.join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const breakdown = scoreCandidate(src, c);
    out.push({ ...c, score: breakdown.score, breakdown });
  }
  return out.sort((a, b) => b.score - a.score);
}
