import "server-only";
import { randomBytes } from "node:crypto";
import type { ObjectId } from "mongodb";
import { collections, type UniversalPlaylistDoc } from "./db";
import { env } from "./env";
import { parseAppleUrl } from "./platforms/apple";
import { adapterFor, anonymousAppleAdapter, anonymousYouTubeAdapter, getConnection } from "./platforms/index";
import { parseYouTubeUrl } from "./platforms/youtube";
import type { MusicAdapter } from "./platforms/types";
import type { Platform, PlaylistSnapshot } from "./types";

/** Universal playlists: a snapshot of a source playlist behind a shareable /p/<slug> link. */

/** How stale a universal playlist may get before a view triggers a re-sync from its source. */
export const LIVE_SYNC_MS = 5 * 60_000;

export function parsePlaylistInput(input: string): { platform: Platform; id: string; storefront?: string } | null {
  const s = input.trim();
  const sp = s.match(/open\.spotify\.com\/(?:intl-\w+\/)?playlist\/([A-Za-z0-9]+)/) ?? s.match(/^spotify:playlist:([A-Za-z0-9]+)$/);
  if (sp) return { platform: "spotify", id: sp[1] };
  const am = parseAppleUrl(s);
  if (am) return { platform: "apple", ...am };
  const yt = parseYouTubeUrl(s);
  if (yt) return { platform: "youtube", ...yt };
  return null;
}

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

async function sourceAdapter(ownerId: ObjectId, platform: Platform, id: string, storefront?: string): Promise<MusicAdapter> {
  // Public Apple Music catalog playlists can be read with just the developer token.
  if (platform === "apple" && id.startsWith("pl.") && !(await getConnection(ownerId, "apple"))) {
    return anonymousAppleAdapter(storefront);
  }
  // Public/unlisted YouTube playlists can be read with the API key alone.
  if (platform === "youtube" && !(await getConnection(ownerId, "youtube"))) {
    return anonymousYouTubeAdapter();
  }
  return adapterFor(ownerId, platform);
}

export async function createUniversalPlaylist(ownerId: ObjectId, platform: Platform, id: string, storefront?: string) {
  const adapter = await sourceAdapter(ownerId, platform, id, storefront);
  const snap = await adapter.getPlaylist(id);
  const { playlists } = await collections();
  const doc: UniversalPlaylistDoc = {
    slug: slugify(snap.name),
    ownerId,
    source: { platform, id, url: snap.url, catalog: (platform === "apple" && id.startsWith("pl.")) || platform === "youtube" },
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
  if (!force && Date.now() - doc.syncedAt.getTime() < LIVE_SYNC_MS) return doc;
  try {
    const adapter = await sourceAdapter(doc.ownerId, doc.source.platform, doc.source.id);
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
