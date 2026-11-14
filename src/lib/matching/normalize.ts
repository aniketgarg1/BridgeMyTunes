/*
 * Title/artist normalisation. Pure functions, no I/O, so they are unit-tested directly.
 *
 * Version qualifiers ("Live", "2011 Remaster", "Radio Edit") are only read from the decorated parts
 * of a title — "(...)", "[...]" or after " - " — so a song literally called "Live Forever" is not a live version.
 */

export type VersionTag =
  | "live"
  | "remaster"
  | "acoustic"
  | "remix"
  | "radio edit"
  | "extended"
  | "instrumental"
  | "demo"
  | "sped up"
  | "slowed"
  | "karaoke"
  | "cover"
  | "mono"
  | "clean"
  | "unplugged"
  | "orchestral";

const TAG_PATTERNS: [VersionTag, RegExp][] = [
  ["live", /\blive\b|\bin concert\b|\blive at\b/],
  ["remaster", /\bremaster(ed)?\b|\bdeluxe\b.*\bremaster/],
  ["acoustic", /\bacoustic\b/],
  ["unplugged", /\bunplugged\b/],
  ["remix", /\bremix\b|\brmx\b|\bmix\b(?! ?tape)/],
  ["radio edit", /\bradio (edit|version|mix)\b|\bsingle (edit|version)\b/],
  ["extended", /\bextended\b/],
  ["instrumental", /\binstrumental\b/],
  ["demo", /\bdemo\b/],
  ["sped up", /\bsped up\b|\bspeed up\b|\bnightcore\b/],
  ["slowed", /\bslowed\b|\breverb\b/],
  ["karaoke", /\bkaraoke\b/],
  ["cover", /\bcover\b|\btribute\b|\bin the style of\b/],
  ["mono", /\bmono\b/],
  ["clean", /\bclean\b|\bedited\b|\bradio clean\b/],
  ["orchestral", /\borchestral\b|\bsymphon/],
];

/** Tags that make it a different recording/performance (strong penalty when only one side has them). */
export const MAJOR_TAGS: ReadonlySet<VersionTag> = new Set([
  "live",
  "acoustic",
  "unplugged",
  "remix",
  "instrumental",
  "demo",
  "sped up",
  "slowed",
  "karaoke",
  "cover",
  "extended",
  "orchestral",
]);

export const TAG_LABEL: Record<VersionTag, string> = {
  live: "Live version",
  remaster: "Remastered version",
  acoustic: "Acoustic version",
  unplugged: "Unplugged version",
  remix: "Remix",
  "radio edit": "Radio edit",
  extended: "Extended version",
  instrumental: "Instrumental",
  demo: "Demo",
  "sped up": "Sped-up version",
  slowed: "Slowed version",
  karaoke: "Karaoke version",
  cover: "Cover / tribute",
  mono: "Mono mix",
  clean: "Clean version",
  orchestral: "Orchestral version",
};

/** lowercase, strip accents, unify quotes/ampersands, drop punctuation, collapse whitespace */
export function basicNormalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”"]/g, "")
    .replace(/&/g, " and ")
    .replace(/\+/g, " and ")
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/'/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const FEAT_RE = /\b(?:feat\.?|ft\.?|featuring|with)\s+(.+)$/i;

export interface ParsedTitle {
  /** Title without qualifiers or featured artists, normalised. */
  base: string;
  tags: Set<VersionTag>;
  featured: string[];
}

export function parseTitle(raw: string): ParsedTitle {
  const tags = new Set<VersionTag>();
  const featured: string[] = [];
  const qualifiers: string[] = [];

  // 1) Pull out bracketed segments: "(feat. X)", "[Remix]", "(Live at Wembley)".
  let title = raw.replace(/[\(\[]([^\)\]]*)[\)\]]/g, (_m, inner: string) => {
    qualifiers.push(inner);
    return " ";
  });

  // 2) " - Remastered 2011", " - Live", " - Spider-Man: Into the Spider-Verse" (dash with spaces only).
  const dash = title.split(/\s+[-–—]\s+/);
  if (dash.length > 1) {
    title = dash[0];
    qualifiers.push(...dash.slice(1));
  }

  // 3) Un-bracketed "Song feat. Artist".
  const featInline = title.match(/\s(?:feat\.?|ft\.?|featuring)\s+(.+)$/i);
  if (featInline) {
    featured.push(...splitArtists(featInline[1]));
    title = title.slice(0, featInline.index);
  }

  for (const q of qualifiers) {
    const fm = q.match(FEAT_RE);
    if (fm && /^\s*(feat|ft|featuring|with)\b/i.test(q)) {
      featured.push(...splitArtists(fm[1]));
      continue;
    }
    const nq = basicNormalize(q);
    for (const [tag, re] of TAG_PATTERNS) if (re.test(nq)) tags.add(tag);
  }

  let base = basicNormalize(title);
  if (!base) base = basicNormalize(raw); // title was entirely bracketed, e.g. "(I Can't Get No) Satisfaction" edge cases
  return { base, tags, featured: featured.map(basicNormalize).filter(Boolean) };
}

/** "A, B & C" / "A x B" / "A feat. B" → ["A", "B", "C"]. Used for comparison only, never for display. */
export function splitArtists(s: string): string[] {
  return s
    .split(/\s*,\s*|\s+&\s+|\s+and\s+|\s+x\s+|\s+feat\.?\s+|\s+ft\.?\s+|\s+featuring\s+|\s+with\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function primaryArtist(artists: string[]): string {
  const first = artists[0] ?? "";
  return splitArtists(first)[0] ?? first;
}

export function normalizeAlbum(album: string | undefined): { base: string; tags: Set<VersionTag> } {
  if (!album) return { base: "", tags: new Set() };
  const p = parseTitle(album.replace(/\s+-\s+(single|ep)$/i, ""));
  return { base: p.base.replace(/\b(deluxe|edition|expanded|version|super|anniversary|bonus track)\b/g, "").replace(/\s+/g, " ").trim(), tags: p.tags };
}

function bigrams(s: string): string[] {
  const t = s.replace(/\s+/g, " ");
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}

/** Sørensen–Dice on character bigrams, 0..1 */
export function dice(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const A = bigrams(a);
  const counts = new Map<string, number>();
  for (const g of A) counts.set(g, (counts.get(g) ?? 0) + 1);
  let overlap = 0;
  const B = bigrams(b);
  for (const g of B) {
    const c = counts.get(g) ?? 0;
    if (c > 0) {
      overlap++;
      counts.set(g, c - 1);
    }
  }
  return (2 * overlap) / (A.length + B.length);
}

const words = (s: string) => s.split(" ").filter(Boolean);

/** Fraction of the smaller token set contained in the larger one, 0..1 */
export function tokenContainment(a: string, b: string): number {
  const A = new Set(words(a));
  const B = new Set(words(b));
  if (!A.size || !B.size) return 0;
  const [small, big] = A.size <= B.size ? [A, B] : [B, A];
  let hit = 0;
  for (const w of small) if (big.has(w)) hit++;
  return hit / small.size;
}

export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const containment = tokenContainment(a, b);
  // Containment alone over-rewards short titles ("Hurt" in "Hurt Me Soul"), so blend with dice.
  return Math.max(dice(a, b), containment * 0.6 + dice(a, b) * 0.4);
}
