import { describe, expect, it } from "vitest";
import { parseMusicLink } from "./links";

describe("parseMusicLink", () => {
  it("reads songs on every service", () => {
    expect(parseMusicLink("https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b?si=x")).toEqual({ platform: "spotify", kind: "song", id: "0VjIjW4GlUZAMYd2vXMi3b" });
    expect(parseMusicLink("https://music.apple.com/us/song/blinding-lights/1499378613")).toEqual({ platform: "apple", kind: "song", id: "1499378613", storefront: "us" });
    expect(parseMusicLink("https://music.apple.com/in/album/after-hours/1499378108?i=1499378613")).toEqual({ platform: "apple", kind: "song", id: "1499378613", storefront: "in" });
    expect(parseMusicLink("https://music.youtube.com/watch?v=4NRXx6U8ABQ&si=abc")).toEqual({ platform: "youtube", kind: "song", id: "4NRXx6U8ABQ" });
    expect(parseMusicLink("https://www.youtube.com/watch?v=4NRXx6U8ABQ&list=PLx")).toEqual({ platform: "youtube", kind: "song", id: "4NRXx6U8ABQ" });
    expect(parseMusicLink("https://youtu.be/4NRXx6U8ABQ?t=10")).toEqual({ platform: "youtube", kind: "song", id: "4NRXx6U8ABQ" });
  });

  it("reads albums and playlists", () => {
    expect(parseMusicLink("https://open.spotify.com/intl-de/album/4yP0hdKOZPNshxUOjY0cZj")).toEqual({ platform: "spotify", kind: "collection", id: "album:4yP0hdKOZPNshxUOjY0cZj" });
    expect(parseMusicLink("https://open.spotify.com/playlist/5Cw4nLNbiLW8bwNkuxg2OC?si=1")).toEqual({ platform: "spotify", kind: "collection", id: "5Cw4nLNbiLW8bwNkuxg2OC" });
    expect(parseMusicLink("https://music.apple.com/us/album/after-hours/1499378108")).toEqual({ platform: "apple", kind: "collection", id: "album:1499378108", storefront: "us" });
    expect(parseMusicLink("https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb")).toEqual({ platform: "apple", kind: "collection", id: "pl.f4d106fed2bd41149aaacabb233eb5eb", storefront: "us" });
    expect(parseMusicLink("https://music.youtube.com/playlist?list=OLAK5uy_abc")).toEqual({ platform: "youtube", kind: "collection", id: "OLAK5uy_abc" });
  });

  it("rejects other links", () => {
    expect(parseMusicLink("https://example.com/song/1")).toBeNull();
    expect(parseMusicLink("not a link")).toBeNull();
  });
});
