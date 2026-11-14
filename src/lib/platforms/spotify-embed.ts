import "server-only";
import type { PlaylistSnapshot, PlaylistSummary, Track } from "../types";
import { SpotifyAdapter, spotifyAppToken } from "./spotify";
import { embedNotFound, parseSpotifyEmbed } from "./spotify-embed-parse";
import type { MusicAdapter } from "./types";

/*
 * Reads any public Spotify playlist without a sign-in: the song list comes from Spotify's public embed
 * player page (unofficial, can change or be blocked), then each song is looked up through the official
 * Web API with the app's own token for its ISRC, album and artwork. Off switch: SPOTIFY_EMBED_DISABLED=1.
 */

export const PASTE_TIP =
  "Open the playlist in the Spotify desktop app, press Cmd+A then Cmd+C, and paste the songs here instead.";

export const embedEnabled = () => process.env.SPOTIFY_EMBED_DISABLED !== "1";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export class SpotifyEmbedReader implements MusicAdapter {
  platform = "spotify" as const;

  async getPlaylist(id: string): Promise<PlaylistSnapshot> {
    const res = await fetch(`https://open.spotify.com/embed/playlist/${encodeURIComponent(id)}`, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
      cache: "no-store",
    });
    const html = res.ok ? await res.text() : "";
    const page = html ? parseSpotifyEmbed(html) : null;
    if (res.status === 404 || embedNotFound(html)) throw new Error(`That Spotify playlist is private, so only its owner can see the songs. Ask them to make it public (playlist menu, Make public), or ${PASTE_TIP[0].toLowerCase()}${PASTE_TIP.slice(1)}`);
    if (!page || !page.tracks.length) throw new Error(`Spotify didn't share that playlist's songs. ${PASTE_TIP}`);

    // Fill in ISRC, album and artwork with the official API (one song per call; batch lookup was removed).
    const api = new SpotifyAdapter(await spotifyAppToken());
    const tracks: Track[] = [...page.tracks];
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, tracks.length) }, async () => {
        while (next < tracks.length) {
          const i = next++;
          try {
            const full = await api.getTrack(tracks[i].ids.spotify!);
            if (full) tracks[i] = full;
          } catch {
            // keep the embed's title, artists and length; matching still works without the ISRC
          }
        }
      }),
    );
    return {
      platform: "spotify",
      id,
      name: page.name,
      ownerName: page.ownerName,
      imageUrl: page.imageUrl,
      url: `https://open.spotify.com/playlist/${id}`,
      tracks,
      // The embed lists at most 100 songs; at exactly 100 the playlist may be longer.
      partial: page.tracks.length >= 100,
    };
  }

  private unsupported(): never {
    throw new Error("Only reading a public playlist is supported without a Spotify sign-in.");
  }
  listPlaylists(): Promise<PlaylistSummary[]> {
    return this.unsupported();
  }
  getLikedTracks(): Promise<Track[]> {
    return this.unsupported();
  }
  getTrack(): Promise<Track | null> {
    return this.unsupported();
  }
  lookupByIsrc(): Promise<Map<string, Track[]>> {
    return this.unsupported();
  }
  search(): Promise<Track[]> {
    return this.unsupported();
  }
  searchText(): Promise<Track[]> {
    return this.unsupported();
  }
  createPlaylist(): Promise<{ id: string; url?: string }> {
    return this.unsupported();
  }
  addToPlaylist(): Promise<void> {
    return this.unsupported();
  }
  saveToLibrary(): Promise<void> {
    return this.unsupported();
  }
}
