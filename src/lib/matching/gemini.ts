import "server-only";
import { GoogleGenAI, Type } from "@google/genai";
import { env } from "../env";
import type { ScoredCandidate, Track } from "../types";

export interface AiCase {
  key: number;
  source: Track;
  candidates: ScoredCandidate[];
}

export interface AiVerdict {
  key: number;
  /** Index into that case's candidates, or -1 when none is the same recording. */
  choice: number;
  confidence: number;
  differences: string[];
  reason: string;
}

let client: GoogleGenAI | null = null;

/** The configured model first; when it's overloaded or unavailable, the lighter model answers instead. */
const FALLBACK_MODEL = "gemini-3.5-flash-lite";

type GenerateParams = Parameters<GoogleGenAI["models"]["generateContent"]>[0];

async function generate(params: Omit<GenerateParams, "model">) {
  client ??= new GoogleGenAI({ apiKey: env.geminiApiKey!, httpOptions: { timeout: 25_000 } });
  const models = [...new Set([env.geminiModel, FALLBACK_MODEL])];
  let last: unknown;
  for (const model of models) {
    try {
      return await client.models.generateContent({ ...params, model });
    } catch (err) {
      last = err;
      console.warn(`[gemini] ${model} failed, ${model === models.at(-1) ? "giving up" : "trying the next model"}:`, String(err).slice(0, 160));
    }
  }
  throw last;
}

export const aiEnabled = () => Boolean(env.geminiApiKey);

const fmt = (t: Track) =>
  JSON.stringify({
    title: t.title,
    artists: t.artists,
    album: t.album,
    duration_s: t.durationMs ? Math.round(t.durationMs / 1000) : undefined,
    isrc: t.isrc,
    explicit: t.explicit,
  });

const SYSTEM = `You match songs between music streaming catalogs (Spotify, Apple Music).
For each case, decide which candidate is the SAME RECORDING as the source track, or -1 if none is.

Rules:
- Same recording means same performance. A remaster of the same recording is acceptable but note it.
- Live, acoustic, remix, sped-up, slowed, karaoke, cover/tribute, instrumental and demo versions are DIFFERENT recordings unless the source is the same kind of version.
- A version with an extra or missing featured artist is usually a different version (e.g. "Levitating" vs "Levitating (feat. DaBaby)").
- Platforms format names differently: "feat." in the title vs in the artist list, "A & B" vs ["A","B"], " - Remastered 2011" vs "(2011 Remaster)", soundtrack subtitles. These are NOT differences.
- Clean vs explicit is the same song but note it; prefer the candidate whose explicitness matches.
- Duration within ~3 seconds is a strong signal of the same recording; >15 seconds apart usually is not.
- confidence is 0..1: how sure you are your choice is right (for -1, how sure you are none match).
- differences: short human-readable notes such as "Remastered version", "Clean version", "Live version". Empty if identical.
- reason: one short sentence.`;

/** Ask Gemini to adjudicate uncertain matches, several per request. Returns [] if AI is disabled or fails. */
export async function adjudicate(cases: AiCase[]): Promise<AiVerdict[]> {
  if (!cases.length || !env.geminiApiKey) return [];

  const prompt = cases
    .map(
      (c) =>
        `Case ${c.key}\nSource: ${fmt(c.source)}\nCandidates:\n${c.candidates.map((x, i) => `  [${i}] ${fmt(x)}`).join("\n")}`,
    )
    .join("\n\n");

  try {
    const res = await generate({
      contents: prompt,
      config: {
        systemInstruction: SYSTEM,
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              key: { type: Type.INTEGER },
              choice: { type: Type.INTEGER },
              confidence: { type: Type.NUMBER },
              differences: { type: Type.ARRAY, items: { type: Type.STRING } },
              reason: { type: Type.STRING },
            },
            required: ["key", "choice", "confidence", "differences", "reason"],
          },
        },
      },
    });
    const parsed = JSON.parse(res.text ?? "[]") as AiVerdict[];
    const byKey = new Map(cases.map((c) => [c.key, c]));
    return parsed.filter((v) => {
      const c = byKey.get(v.key);
      return c && Number.isInteger(v.choice) && v.choice >= -1 && v.choice < c.candidates.length;
    });
  } catch (err) {
    console.error("[gemini] adjudication failed:", err);
    return [];
  }
}

export interface QueryCase {
  key: number;
  source: Track;
}

export interface QuerySuggestion {
  key: number;
  queries: { title: string; artist: string }[];
}

const SUGGEST = `You help find songs that a music catalog search could not find.
For each case you get a song as it appears on one service (often a messy YouTube video title) and the service to search.
Suggest up to 2 better searches, each a clean song title and its main artist, most likely first.

Rules:
- Remove video noise: "Official Video", "Lyrics", "Audio", "HD", "4K", "Full Song", channel names, label names, hashtags, emoji, years.
- Fix the artist when the listed one is a channel, label or uploader (e.g. "T-Series", "Topic", "VEVO") and the real artist is in the title.
- If the title is in a non-Latin script, give the common Latin-script title too, and the other way round.
- Keep the version words that matter: Live, Remix, Acoustic, Slowed, a featured artist.
- Never invent a different song. If you can't tell what the song is, return no queries for that case.`;

/** Ask Gemini for cleaner searches for songs the catalog search missed, several per request. [] if AI is off or fails. */
export async function suggestSearches(cases: QueryCase[], destination: string): Promise<QuerySuggestion[]> {
  if (!cases.length || !env.geminiApiKey) return [];
  const prompt =
    `Service to search: ${destination}\n\n` + cases.map((c) => `Case ${c.key}\nSong: ${fmt(c.source)}`).join("\n\n");
  try {
    const res = await generate({
      contents: prompt,
      config: {
        systemInstruction: SUGGEST,
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              key: { type: Type.INTEGER },
              queries: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: { title: { type: Type.STRING }, artist: { type: Type.STRING } },
                  required: ["title", "artist"],
                },
              },
            },
            required: ["key", "queries"],
          },
        },
      },
    });
    const parsed = JSON.parse(res.text ?? "[]") as QuerySuggestion[];
    const keys = new Set(cases.map((c) => c.key));
    return parsed
      .filter((s) => keys.has(s.key) && Array.isArray(s.queries))
      .map((s) => ({ key: s.key, queries: s.queries.filter((q) => q?.title?.trim()).slice(0, 2) }));
  } catch (err) {
    console.error("[gemini] search suggestions failed:", err);
    return [];
  }
}

export interface ReplacementIdea {
  key: number;
  songs: { title: string; artist: string; why: string }[];
}

const REPLACE = `A listener is moving music to another streaming service, and some songs are not available there.
For each missing song, suggest up to 3 real, well-known songs a fan of it would accept instead, most fitting first:
another version of the same song (a different recording, a live or acoustic version, a cover by a known artist) when one
likely exists, otherwise a closely related song by the same artist, otherwise a very similar song by a similar artist.

Rules:
- Only real songs that are widely released on major streaming services. Never invent titles.
- Never suggest the exact same recording that was already searched for.
- why: a few words a listener understands, e.g. "Acoustic version", "Same artist, same album", "Similar 2000s Hindi pop".`;

/** Ask Gemini for similar songs to offer instead of ones the destination doesn't have. [] if AI is off or fails. */
export async function suggestReplacements(cases: QueryCase[], destination: string): Promise<ReplacementIdea[]> {
  if (!cases.length || !env.geminiApiKey) return [];
  const prompt =
    `Destination service: ${destination}\n\n` + cases.map((c) => `Case ${c.key}\nMissing song: ${fmt(c.source)}`).join("\n\n");
  try {
    const res = await generate({
      contents: prompt,
      config: {
        systemInstruction: REPLACE,
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              key: { type: Type.INTEGER },
              songs: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: { title: { type: Type.STRING }, artist: { type: Type.STRING }, why: { type: Type.STRING } },
                  required: ["title", "artist", "why"],
                },
              },
            },
            required: ["key", "songs"],
          },
        },
      },
    });
    const parsed = JSON.parse(res.text ?? "[]") as ReplacementIdea[];
    const keys = new Set(cases.map((c) => c.key));
    return parsed
      .filter((r) => keys.has(r.key) && Array.isArray(r.songs))
      .map((r) => ({ key: r.key, songs: r.songs.filter((x) => x?.title?.trim() && x?.artist?.trim()).slice(0, 3) }));
  } catch (err) {
    console.error("[gemini] replacement suggestions failed:", err);
    return [];
  }
}
