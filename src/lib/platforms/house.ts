import "server-only";
import { getDb } from "../db";
import { env } from "../env";
import { MockAdapter } from "./mock";
import { refreshSpotifyToken, SpotifyAdapter } from "./spotify";

/*
 * The "house" Spotify account: one Spotify account owned by BridgeMyTunes that creates public playlists
 * for people who aren't signed in to Spotify. Spotify's Development Mode only lets 5 allowlisted users
 * sign in to the app, so instead the house account builds the playlist and the visitor saves it from
 * Spotify with one tap. Playlists are made from song names (YouTube Music / Apple Music metadata),
 * so no Spotify data leaves Spotify.
 *
 * Set up once: sign in to Spotify on the site as the house account, then open
 * /api/admin/spotify-house?key=<ADMIN_KEY>. That moves the sign-in from the browser session to here.
 */

export interface HouseDoc {
  _id: "spotify_house";
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  spotifyUserId?: string;
  displayName?: string;
  updatedAt: Date;
}

async function settings() {
  return (await getDb()).collection<HouseDoc>("settings");
}

export async function houseAvailable(): Promise<boolean> {
  if (env.mock) return true;
  if (process.env.SPOTIFY_HOUSE_DISABLED === "1") return false;
  return Boolean(await (await settings()).findOne({ _id: "spotify_house" }, { projection: { _id: 1 } }));
}

export async function saveHouse(conn: { accessToken: string; refreshToken?: string; expiresAt?: Date; spotifyUserId?: string; displayName?: string }) {
  if (!conn.refreshToken) throw new Error("That Spotify sign-in has no refresh token; sign in again.");
  await (await settings()).updateOne(
    { _id: "spotify_house" },
    {
      $set: {
        accessToken: conn.accessToken,
        refreshToken: conn.refreshToken,
        expiresAt: conn.expiresAt ?? new Date(0),
        spotifyUserId: conn.spotifyUserId,
        displayName: conn.displayName,
        updatedAt: new Date(),
      },
    },
    { upsert: true },
  );
}

/** A Spotify adapter acting as the house account, with its token refreshed when needed. */
export async function houseSpotify(): Promise<SpotifyAdapter | MockAdapter> {
  if (env.mock) return new MockAdapter("spotify");
  const col = await settings();
  const doc = await col.findOne({ _id: "spotify_house" });
  if (!doc) throw new Error("Adding to Spotify without signing in isn't set up yet.");
  let token = doc.accessToken;
  if (doc.expiresAt.getTime() - Date.now() < 60_000) {
    const t = await refreshSpotifyToken(doc.refreshToken);
    token = t.access_token;
    await col.updateOne(
      { _id: "spotify_house" },
      { $set: { accessToken: t.access_token, refreshToken: t.refresh_token ?? doc.refreshToken, expiresAt: new Date(Date.now() + t.expires_in * 1000), updatedAt: new Date() } },
    );
  }
  return new SpotifyAdapter(token, { publicPlaylists: true });
}
