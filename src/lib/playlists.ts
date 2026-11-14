import "server-only";
import { randomBytes } from "node:crypto";
import type { ObjectId } from "mongodb";
import { collections, type SongLink, type UniversalPlaylistDoc } from "./db";
import { env } from "./env";
import type { MusicLink } from "./links";
import { matchTracks } from "./matching/matcher";
import {
  adapterFor,
  anonymousAdapter,
  anonymousAppleAdapter,
  anonymousSpotifyAdapter,
  anonymousYouTubeAdapter,
  getConnection,
} from "./platforms/index";
import type { MusicAdapter } from "./platforms/types";
import { ALL_PLATFORMS, PLATFORM_LABEL, type Platform, type PlaylistSnapshot, type Track } from "./types";

/** Share pages: a song, album or playlist behind one /p/<slug> link that works on every service. */

/** How stale a universal playlist may get before a view triggers a re-sync from its source. */
export const LIVE_SYNC_MS = 5 * 60_000;

function slugify(name: string) {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "playlist"}-${randomBytes(3).toString("hex")}`;
}

/** Who reads the source: public songs, albums and catalog playlists need no sign-in; private ones use the owner's account. */
async function readerFor(ownerId: ObjectId, platform: Platform, id: string, storefront?: string): Promise<MusicAdapter> {
  if (platform === "spotify") {
    if (id.startsWith("album:")) return anonymousSpotifyAdapter();
    if (!(await getConnection(ownerId, "spotify"))) {
      throw new Error(
        "Spotify only shares a playlist's songs with its owner. Open the playlist in the Spotify desktop app, press Cmd+A then Cmd+C, and paste the songs here.",
      );
    }
    return adapterFor(ownerId, "spotify");
  }
  if (platform === "apple") {
    const isPublic = id.startsWith("pl.") || id.startsWith("album:");
    if (isPublic && !(await getConnection(ownerId, "apple"))) return anonymousAppleAdapter(storefront);
    return adapterFor(ownerId, "apple");
  }
  // Public and unlisted YouTube playlists read with the API key; a signed-in owner can share private ones too.
  if (!(await getConnection(ownerId, "youtube"))) return anonymousYouTubeAdapter();
  return adapterFor(ownerId, "youtube");
}

/** Find the same song on every service, without anyone signed in. Each service is tried independently. */
async function resolveSongLinks(track: Track, source: Platform): Promise<Partial<Record<Platform, SongLink>>> {
  const entries = await Promise.all(
    ALL_PLATFORMS.map(async (p): Promise<[Platform, SongLink]> => {
      if (p === source) return [p, { status: "matched", url: track.url, title: track.title, artists: track.artists, confidence: 1 }];
      try {
        const [r] = await matchTracks([track], await anonymousAdapter(p));
        const m = r.status !== "unavailable" ? r.match : undefined;
        return [p, { status: r.status, url: m?.url, title: m?.title, artists: m?.artists, confidence: r.confidence }];
      } catch (err) {
        console.warn(`[song] ${p} lookup failed:`, (err as Error).message);
        return [p, { status: "unavailable" }];
      }
    }),
  );
  return Object.fromEntries(entries);
}

const MAX_PASTED_SONGS = 200;

/** Look up each pasted song with our own keys (no sign-in) and keep them as one shareable list. */
export async function createShareFromSongs(ownerId: ObjectId, links: MusicLink[], name?: string): Promise<UniversalPlaylistDoc> {
  const list = links.slice(0, MAX_PASTED_SONGS);
  const readers = new Map<string, MusicAdapter>();
  const reader = async (l: MusicLink) => {
    const key = `${l.platform}:${l.storefront ?? ""}`;
    if (!readers.has(key)) readers.set(key, await anonymousAdapter(l.platform, l.storefront));
    return readers.get(key)!;
  };
  const tracks: (Track | null)[] = new Array(list.length).fill(null);
  let next = 0;
  // Spotify removed its batch lookup, so songs are fetched one at a time, a few in parallel.
  await Promise.all(
    Array.from({ length: Math.min(4, list.length) }, async () => {
      while (next < list.length) {
        const i = next++;
        try {
          tracks[i] = await (await reader(list[i])).getTrack(list[i].id);
        } catch (err) {
          console.warn(`[songs] ${list[i].platform}:${list[i].id} lookup failed:`, (err as Error).message);
        }
      }
    }),
  );
  const found = tracks.filter((t): t is Track => t !== null);
  if (!found.length) throw new Error("None of those songs could be found. Check the links and try again.");
  const platforms = new Set(list.map((l) => l.platform));
  const source = list[0].platform;
  const title = name?.trim().slice(0, 100) || (platforms.size === 1 ? `Songs from ${PLATFORM_LABEL[source]}` : "Shared songs");
  const doc: UniversalPlaylistDoc = {
    slug: slugify(title),
    ownerId,
    kind: "collection",
    source: { platform: source, id: "songs", catalog: true },
    name: title,
    imageUrl: found.find((t) => t.artworkUrl)?.artworkUrl,
    tracks: found,
    createdAt: new Date(),
    syncedAt: new Date(),
  };
  const { playlists } = await collections();
  await playlists.insertOne(doc);
  return doc;
}

/** Create a share page from any pasted link: a song, an album or a playlist. */
export async function createShare(ownerId: ObjectId, link: MusicLink): Promise<UniversalPlaylistDoc> {
  const { playlists } = await collections();
  if (link.kind === "song") {
    const reader = await anonymousAdapter(link.platform, link.storefront);
    const track = await reader.getTrack(link.id);
    if (!track) throw new Error(`That ${PLATFORM_LABEL[link.platform]} song wasn't found.`);
    const doc: UniversalPlaylistDoc = {
      slug: slugify(`${track.title} ${track.artists[0] ?? ""}`),
      ownerId,
      kind: "song",
      source: { platform: link.platform, id: link.id, url: track.url, catalog: true, storefront: link.storefront },
      name: track.title,
      ownerName: track.artists.join(", "),
      imageUrl: track.artworkUrl,
      tracks: [track],
      links: await resolveSongLinks(track, link.platform),
      createdAt: new Date(),
      syncedAt: new Date(),
    };
    await playlists.insertOne(doc);
    return doc;
  }
  return createUniversalPlaylist(ownerId, link.platform, link.id, link.storefront);
}

export async function createUniversalPlaylist(ownerId: ObjectId, platform: Platform, id: string, storefront?: string) {
  const adapter = await readerFor(ownerId, platform, id, storefront);
  const snap = await adapter.getPlaylist(id);
  const { playlists } = await collections();
  const doc: UniversalPlaylistDoc = {
    slug: slugify(snap.name),
    ownerId,
    kind: "collection",
    source: { platform, id, url: snap.url, catalog: platform !== "spotify" || id.startsWith("album:"), storefront },
    ...fields(snap),
    createdAt: new Date(),
    syncedAt: new Date(),
  };
  await playlists.insertOne(doc);
  return doc;
}

const fields = (s: PlaylistSnapshot) => ({
  name: s.name,
  description: s.description,
  imageUrl: s.imageUrl ?? s.tracks.find((t) => t.artworkUrl)?.artworkUrl,
  ownerName: s.ownerName,
  tracks: s.tracks,
});

/**
 * Live universal playlist: re-read the source with the *owner's* connection so viewers always see the
 * latest version. Fails soft (keeps the last snapshot) if the owner disconnected.
 */
export async function syncUniversalPlaylist(doc: UniversalPlaylistDoc, force = false): Promise<UniversalPlaylistDoc> {
  if (doc.kind === "song" || doc.source.id === "songs") return doc; // songs and pasted lists don't change
  if (!force && Date.now() - doc.syncedAt.getTime() < LIVE_SYNC_MS) return doc;
  try {
    const adapter = await readerFor(doc.ownerId, doc.source.platform, doc.source.id, doc.source.storefront);
    const snap = await adapter.getPlaylist(doc.source.id);
    const update = { ...fields(snap), syncedAt: new Date() };
    const { playlists } = await collections();
    await playlists.updateOne({ slug: doc.slug }, { $set: update });
    return { ...doc, ...update };
  } catch (err) {
    console.warn(`[playlists] live sync failed for ${doc.slug}:`, (err as Error).message);
    return doc;
  }
}

export async function getUniversalPlaylist(slug: string) {
  const { playlists } = await collections();
  return playlists.findOne({ slug });
}

export const shareUrl = (slug: string) => `${env.appUrl}/p/${slug}`;

/** Public view of a universal playlist (no owner ids). */
export function publicPlaylist(doc: UniversalPlaylistDoc, viewerId: ObjectId | null) {
  return {
    slug: doc.slug,
    kind: doc.kind ?? "collection",
    links: doc.links ?? {},
    name: doc.name,
    description: doc.description,
    imageUrl: doc.imageUrl,
    ownerName: doc.ownerName,
    source: { platform: doc.source.platform, url: doc.source.url },
    tracks: doc.tracks,
    syncedAt: doc.syncedAt.toISOString(),
    isOwner: Boolean(viewerId && viewerId.equals(doc.ownerId)),
    shareUrl: shareUrl(doc.slug),
  };
}
export type PublicPlaylist = ReturnType<typeof publicPlaylist>;
