import { describe, expect, it } from "vitest";
import { parseYouTubeUrl, videoToTrack } from "./youtube-parse";

const video = (snippet: Record<string, unknown>, duration = "PT3M20S", id = "abc123") => ({
  id,
  snippet,
  contentDetails: { duration },
});

describe("parseYouTubeUrl", () => {
  it("reads YouTube Music and YouTube playlist links", () => {
    expect(parseYouTubeUrl("https://music.youtube.com/playlist?list=PLx1&si=abc")).toEqual({ id: "PLx1" });
    expect(parseYouTubeUrl("https://www.youtube.com/playlist?list=PLx2")).toEqual({ id: "PLx2" });
    expect(parseYouTubeUrl("https://www.youtube.com/watch?v=v1&list=PLx3")).toEqual({ id: "PLx3" });
    expect(parseYouTubeUrl("https://open.spotify.com/playlist/abc")).toBeNull();
  });
});

describe("videoToTrack", () => {
  it("uses the clean credits of auto-generated Topic uploads", () => {
    const t = videoToTrack(
      video({
        title: "Blinding Lights",
        channelTitle: "The Weeknd - Topic",
        description: "Provided to YouTube by Universal Music Group\n\nBlinding Lights · The Weeknd\n\nAfter Hours\n\n℗ 2020 The Weeknd XO, Inc.",
      }),
    )!;
    expect(t).toMatchObject({ title: "Blinding Lights", artists: ["The Weeknd"], album: "After Hours", durationMs: 200000 });
    expect(t.ids.youtube).toBe("abc123");
  });

  it("splits 'Artist - Song (Official Video)' titles", () => {
    const t = videoToTrack(video({ title: "Dua Lipa - Levitating (Official Music Video)", channelTitle: "Dua Lipa" }, "PT4M3S"))!;
    expect(t).toMatchObject({ title: "Levitating", artists: ["Dua Lipa"], durationMs: 243000 });
  });

  it("falls back to the channel name and strips VEVO", () => {
    const t = videoToTrack(video({ title: "Mr. Brightside", channelTitle: "TheKillersVEVO" }))!;
    expect(t.artists).toEqual(["TheKillers"]);
  });

  it("keeps version tags that matter for matching", () => {
    expect(videoToTrack(video({ title: "Dreams (Live)", channelTitle: "Fleetwood Mac - Topic" }))!.title).toBe("Dreams (Live)");
  });

  it("skips deleted and private videos", () => {
    expect(videoToTrack(video({ title: "Deleted video" }))).toBeNull();
    expect(videoToTrack(video({ title: "Private video" }))).toBeNull();
  });
});
