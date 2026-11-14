import { describe, expect, it } from "vitest";
import type { Track } from "../types";
import { parseTitle, splitArtists } from "./normalize";
import { AUTO_ACCEPT, rankCandidates, scoreCandidate } from "./score";

const t = (title: string, artists: string[], extra: Partial<Track> = {}): Track => ({ title, artists, ids: {}, ...extra });

describe("parseTitle", () => {
  it("strips remaster suffixes and tags them", () => {
    const p = parseTitle("Bohemian Rhapsody - Remastered 2011");
    expect(p.base).toBe("bohemian rhapsody");
    expect([...p.tags]).toEqual(["remaster"]);
  });

  it("pulls featured artists out of brackets", () => {
    const p = parseTitle("Peaches (feat. Daniel Caesar & Giveon)");
    expect(p.base).toBe("peaches");
    expect(p.featured).toEqual(["daniel caesar", "giveon"]);
  });

  it("does not treat a title word as a version tag", () => {
    expect([...parseTitle("Live Forever").tags]).toEqual([]);
    expect([...parseTitle("Dreams - Live").tags]).toEqual(["live"]);
  });

  it("treats soundtrack subtitles as noise", () => {
    expect(parseTitle("Sunflower - Spider-Man: Into the Spider-Verse").base).toBe("sunflower");
    expect(parseTitle("Sunflower (Spider-Man: Into the Spider-Verse)").base).toBe("sunflower");
  });

  it("splits artist strings", () => {
    expect(splitArtists("Post Malone & Swae Lee")).toEqual(["Post Malone", "Swae Lee"]);
  });
});

describe("scoreCandidate", () => {
  it("auto-accepts remaster naming differences with the same ISRC", () => {
    const s = scoreCandidate(
      t("Bohemian Rhapsody - Remastered 2011", ["Queen"], { isrc: "GBUM71029604", durationMs: 354320 }),
      t("Bohemian Rhapsody", ["Queen"], { isrc: "GBUM71029604", durationMs: 354947, album: "A Night at the Opera (2011 Remaster)" }),
    );
    expect(s.score).toBeGreaterThanOrEqual(AUTO_ACCEPT);
  });

  it("auto-accepts feat. in title vs. in artist list", () => {
    const s = scoreCandidate(
      t("Peaches (feat. Daniel Caesar & Giveon)", ["Justin Bieber", "Daniel Caesar", "Giveon"], { durationMs: 198082, album: "Justice" }),
      t("Peaches (feat. Daniel Caesar & Giveon)", ["Justin Bieber"], { durationMs: 198082, album: "Justice" }),
    );
    expect(s.score).toBeGreaterThanOrEqual(AUTO_ACCEPT);
    expect(s.flags).toEqual([]);
  });

  it("auto-accepts 'A & B' vs ['A', 'B']", () => {
    const s = scoreCandidate(
      t("Sunflower - Spider-Man: Into the Spider-Verse", ["Post Malone", "Swae Lee"], { durationMs: 158040 }),
      t("Sunflower (Spider-Man: Into the Spider-Verse)", ["Post Malone & Swae Lee"], { durationMs: 158040 }),
    );
    expect(s.score).toBeGreaterThanOrEqual(AUTO_ACCEPT);
  });

  it("rejects a live version of a studio track", () => {
    const src = t("Dreams", ["Fleetwood Mac"], { durationMs: 257800, album: "Rumours" });
    const ranked = rankCandidates(src, [
      t("Dreams (Live)", ["Fleetwood Mac"], { durationMs: 263000, album: "The Dance", ids: { apple: "live" } }),
      t("Dreams (2004 Remaster)", ["Fleetwood Mac"], { durationMs: 257920, album: "Rumours (Super Deluxe)", ids: { apple: "rem" } }),
    ]);
    expect(ranked[0].ids.apple).toBe("rem");
    expect(ranked[1].score).toBeLessThan(0.6);
    expect(ranked[1].breakdown.flags).toContain("Live version");
  });

  it("picks the right artist for a shared title", () => {
    const ranked = rankCandidates(t("Hurt", ["Johnny Cash"], { durationMs: 216706 }), [
      t("Hurt", ["Nine Inch Nails"], { durationMs: 373000, ids: { apple: "nin" } }),
      t("Hurt", ["Johnny Cash"], { durationMs: 216706, ids: { apple: "cash" } }),
    ]);
    expect(ranked[0].ids.apple).toBe("cash");
    expect(ranked[1].score).toBeLessThan(0.6);
  });

  it("flags clean vs explicit without rejecting it", () => {
    const s = scoreCandidate(
      t("HUMBLE.", ["Kendrick Lamar"], { explicit: true, durationMs: 177000, isrc: "USUM71703861" }),
      t("HUMBLE.", ["Kendrick Lamar"], { explicit: false, durationMs: 177000, isrc: "USUM71703866" }),
    );
    expect(s.flags.some((f) => f.startsWith("Clean version"))).toBe(true);
    expect(s.score).toBeGreaterThan(0.8);
    expect(s.score).toBeLessThan(AUTO_ACCEPT); // goes to review instead of being swapped silently
  });

  it("prefers the version with the same featured artist", () => {
    const ranked = rankCandidates(t("Levitating (feat. DaBaby)", ["Dua Lipa", "DaBaby"], { durationMs: 203807 }), [
      t("Levitating", ["Dua Lipa"], { durationMs: 203064, ids: { apple: "solo" } }),
      t("Levitating (feat. DaBaby)", ["Dua Lipa"], { durationMs: 203807, ids: { apple: "feat" } }),
    ]);
    expect(ranked[0].ids.apple).toBe("feat");
    expect(ranked[1].score).toBeLessThan(AUTO_ACCEPT);
  });
});

describe("youtube uploads", () => {
  it("ranks the official upload above an identical lyric re-upload", () => {
    const src = t("Blinding Lights", ["The Weeknd"], { durationMs: 200040, album: "After Hours" });
    const ranked = rankCandidates(src, [
      t("Blinding Lights", ["The Weeknd"], { durationMs: 200000, ids: { youtube: "lyrics" }, official: false }),
      t("Blinding Lights", ["The Weeknd"], { durationMs: 201000, album: "After Hours", ids: { youtube: "topic" }, official: true }),
    ]);
    expect(ranked[0].ids.youtube).toBe("topic");
  });
});
