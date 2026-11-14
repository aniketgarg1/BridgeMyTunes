import "server-only";
import type { ObjectId } from "mongodb";
import { collections, type ConnectionDoc } from "../db";
import { env } from "../env";
import { PLATFORM_LABEL, type Platform } from "../types";
import { AppleAdapter } from "./apple";
import { MockAdapter } from "./mock";
import { refreshSpotifyToken, SpotifyAdapter, spotifyAppToken } from "./spotify";
import { refreshGoogleToken, YouTubeAdapter } from "./youtube";
import type { MusicAdapter } from "./types";

export class NotConnectedError extends Error {
  constructor(public platform: Platform) {
    super(`Connect ${PLATFORM_LABEL[platform]} first.`);
  }
}

export async function getConnection(userId: ObjectId, platform: Platform) {
  const { connections } = await collections();
  return connections.findOne({ userId, platform });
}

export async function saveConnection(conn: Omit<ConnectionDoc, "_id" | "updatedAt">) {
  const { connections } = await collections();
  await connections.updateOne(
    { userId: conn.userId, platform: conn.platform },
    { $set: { ...conn, updatedAt: new Date() } },
    { upsert: true },
  );
}

/** Refresh an OAuth access token shortly before it expires (Spotify and Google both use refresh tokens). */
async function freshToken(conn: ConnectionDoc): Promise<string> {
  if (!conn.expiresAt || conn.expiresAt.getTime() - Date.now() > 60_000 || !conn.refreshToken) {
    return conn.accessToken;
  }
  const t = conn.platform === "youtube" ? await refreshGoogleToken(conn.refreshToken) : await refreshSpotifyToken(conn.refreshToken);
  const { connections } = await collections();
  await connections.updateOne(
    { _id: conn._id },
    {
      $set: {
        accessToken: t.access_token,
        refreshToken: t.refresh_token ?? conn.refreshToken,
        expiresAt: new Date(Date.now() + t.expires_in * 1000),
        updatedAt: new Date(),
      },
    },
  );
  return t.access_token;
}

/** Adapter acting as `userId` on `platform`. Throws NotConnectedError if they haven't connected it. */
export async function adapterFor(userId: ObjectId, platform: Platform): Promise<MusicAdapter> {
  const conn = await getConnection(userId, platform);
  if (!conn) throw new NotConnectedError(platform);
  if (env.mock) return new MockAdapter(platform);
  if (platform === "spotify") return new SpotifyAdapter(await freshToken(conn));
  if (platform === "youtube") return new YouTubeAdapter(await freshToken(conn));
  return new AppleAdapter(conn.accessToken, conn.storefront);
}

/** Spotify songs, albums and search work with the app's own token (no user, no tester list). */
export async function anonymousSpotifyAdapter(): Promise<MusicAdapter> {
  if (env.mock) return new MockAdapter("spotify");
  return new SpotifyAdapter(await spotifyAppToken());
}

/** Read-only adapter for a platform without anyone signed in. */
export async function anonymousAdapter(platform: Platform, storefront?: string): Promise<MusicAdapter> {
  if (platform === "spotify") return anonymousSpotifyAdapter();
  if (platform === "youtube") return anonymousYouTubeAdapter();
  return anonymousAppleAdapter(storefront);
}

/** Public YouTube playlists can be read with the API key alone. */
export function anonymousYouTubeAdapter(): MusicAdapter {
  if (env.mock) return new MockAdapter("youtube");
  return new YouTubeAdapter(null);
}

/** Apple catalog access needs only the developer token, so public Apple playlists can be read without a login. */
export function anonymousAppleAdapter(storefront?: string): MusicAdapter {
  if (env.mock) return new MockAdapter("apple");
  return new AppleAdapter(null, storefront);
}
