import { describe, expect, it } from "vitest";
import { parseSpotifyEmbed } from "./spotify-embed-parse";

const page = (entity: unknown) =>
  `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { state: { data: { entity } } } } })}</script></body></html>`;

describe("parseSpotifyEmbed", () => {
  it("reads the name, cover and songs", () => {
    const p = parseSpotifyEmbed(
      page({
        id: "37i9dQZF1DXcBWIGoYBM5M",
        name: "Today’s Top Hits",
        subtitle: "Spotify",
        coverArt: { sources: [{ url: "https://i.scdn.co/image/x" }] },
        trackList: [
          { uri: "spotify:track:3h5T5JypYU7huFiVYhv1dr", title: "BbY WOW", subtitle: "KAROL G, Judeline, rusowsky", duration: 225834, isExplicit: false },
          { uri: "spotify:episode:abc", title: "A podcast", subtitle: "Someone" },
        ],
      }),
    )!;
    expect(p.name).toBe("Today’s Top Hits");
    expect(p.imageUrl).toBe("https://i.scdn.co/image/x");
    expect(p.tracks).toHaveLength(1);
    expect(p.tracks[0]).toMatchObject({ title: "BbY WOW", artists: ["KAROL G", "Judeline", "rusowsky"], durationMs: 225834, ids: { spotify: "3h5T5JypYU7huFiVYhv1dr" } });
  });

  it("returns null when the page has no data", () => {
    expect(parseSpotifyEmbed("<html></html>")).toBeNull();
    expect(parseSpotifyEmbed(page({ name: "no songs here" }))).toBeNull();
  });
});
