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
  client ??= new GoogleGenAI({ apiKey: env.geminiApiKey });

  const prompt = cases
    .map(
      (c) =>
        `Case ${c.key}\nSource: ${fmt(c.source)}\nCandidates:\n${c.candidates.map((x, i) => `  [${i}] ${fmt(x)}`).join("\n")}`,
    )
    .join("\n\n");

  try {
    const res = await client.models.generateContent({
      model: env.geminiModel,
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
