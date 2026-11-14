import "server-only";
import { MongoClient, type Db, type ObjectId } from "mongodb";
import { env } from "./env";
import type {
  MatchResult,
  Platform,
  PlaylistSnapshot,
  Track,
  TransferSource,
  TransferStatus,
} from "./types";

export interface UserDoc {
  _id: ObjectId;
  sessionHash: string;
  createdAt: Date;
}

export interface ConnectionDoc {
  _id?: ObjectId;
  userId: ObjectId;
  platform: Platform;
  externalUserId?: string;
  displayName?: string;
  /** Spotify access token, or Apple Music user token. */
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  /** Apple Music storefront, e.g. "us". */
  storefront?: string;
  updatedAt: Date;
}

export interface UniversalPlaylistDoc {
  _id?: ObjectId;
  slug: string;
  ownerId: ObjectId;
  source: { platform: Platform; id: string; url?: string; catalog?: boolean; storefront?: string };
  /** "song" pages link to the track on every service; anything else is a playlist or album. */
  kind?: "song" | "collection";
  /** The house account's public Spotify copy of this link, shared by everyone who adds it to Spotify. */
  houseSpotify?: { id: string; url?: string };
  /** For songs: where the same recording lives on each service. */
  links?: Partial<Record<Platform, SongLink>>;
  name: string;
  description?: string;
  imageUrl?: string;
  ownerName?: string;
  tracks: Track[];
  createdAt: Date;
  syncedAt: Date;
}

export interface SongLink {
  status: "matched" | "uncertain" | "unavailable";
  url?: string;
  title?: string;
  artists?: string[];
  confidence?: number;
}

export interface TransferDoc {
  _id?: ObjectId;
  userId: ObjectId;
  source: TransferSource;
  sourceName?: string;
  destination: Platform;
  /** "house": the playlist is made in BridgeMyTunes' own Spotify account, for someone not signed in to Spotify. */
  via?: "user" | "house";
  /** "playlist" creates a playlist; "library" saves songs to the destination library (liked songs). */
  mode: "playlist" | "library";
  status: TransferStatus;
  error?: string;
  total: number;
  processed: number;
  results: MatchResult[];
  destPlaylistId?: string;
  destUrl?: string;
  createdAt: Date;
  updatedAt: Date;
  finishedAt?: Date;
  timings?: Record<string, number>;
}

/** Cache of confirmed cross-platform matches, keyed by source id and by ISRC. */
export interface MappingDoc {
  _id?: ObjectId;
  key: string;
  destination: Platform;
  track: Track;
  method: string;
  confidence: number;
  updatedAt: Date;
}

export interface EventDoc {
  type: string;
  at: Date;
  transferId?: string;
  props: Record<string, unknown>;
}

const globalForMongo = globalThis as unknown as {
  _mongo?: Promise<{ client: MongoClient; db: Db }>;
};

async function connect() {
  const client = new MongoClient(env.mongoUri, { appName: "tunebridge" });
  await client.connect();
  const db = client.db(env.mongoDb);
  await Promise.all([
    db.collection("users").createIndex({ sessionHash: 1 }, { unique: true }),
    db.collection("connections").createIndex({ userId: 1, platform: 1 }, { unique: true }),
    db.collection("playlists").createIndex({ slug: 1 }, { unique: true }),
    db.collection("playlists").createIndex({ ownerId: 1, createdAt: -1 }),
    db.collection("transfers").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("mappings").createIndex({ key: 1, destination: 1 }, { unique: true }),
    db.collection("events").createIndex({ at: -1 }),
  ]);
  return { client, db };
}

export async function getDb(): Promise<Db> {
  if (!globalForMongo._mongo) {
    globalForMongo._mongo = connect().catch((err) => {
      globalForMongo._mongo = undefined;
      throw err;
    });
  }
  return (await globalForMongo._mongo).db;
}

export async function collections() {
  const db = await getDb();
  return {
    users: db.collection<UserDoc>("users"),
    connections: db.collection<ConnectionDoc>("connections"),
    playlists: db.collection<UniversalPlaylistDoc>("playlists"),
    transfers: db.collection<TransferDoc>("transfers"),
    mappings: db.collection<MappingDoc>("mappings"),
    events: db.collection<EventDoc>("events"),
  };
}

export type { PlaylistSnapshot };
