export type Platform = "spotify" | "apple" | "youtube";

/** Every platform the backend understands. */
export const ALL_PLATFORMS: Platform[] = ["spotify", "apple", "youtube"];

/**
 * Platforms offered in the UI. Spotify is left out: in Development Mode it only works for 5 allowlisted
 * users, while YouTube Music and Apple Music work for anyone who signs in. Its code is kept for later.
 */
export const PLATFORMS: Platform[] = ["youtube", "apple"];

export const PLATFORM_LABEL: Record<Platform, string> = {
  spotify: "Spotify",
  apple: "Apple Music",
  youtube: "YouTube Music",
};

/** A platform-neutral track. `ids` holds the native id on each platform we know it for. */
export interface Track {
  title: string;
  /** Primary artist first. Apple Music gives one combined string, so it may be a single entry like "A & B". */
  artists: string[];
  album?: string;
  durationMs?: number;
  isrc?: string;
  explicit?: boolean;
  artworkUrl?: string;
  url?: string;
  ids: Partial<Record<Platform, string>>;
}

export interface PlaylistSummary {
  id: string;
  name: string;
  imageUrl?: string;
  trackCount?: number;
  /** True when this user can read the full track list (Spotify only returns items for owned/collaborative playlists). */
  readable: boolean;
  ownerName?: string;
}

export interface PlaylistSnapshot {
  platform: Platform;
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  ownerName?: string;
  url?: string;
  tracks: Track[];
  /** The source only showed part of the list (Spotify's public view stops at 100 songs). */
  partial?: boolean;
}

export type MatchStatus = "matched" | "uncertain" | "unavailable";
export type MatchMethod = "cache" | "isrc" | "metadata" | "ai" | "manual" | "none";

export interface ScoredCandidate extends Track {
  score: number;
}

export interface MatchResult {
  index: number;
  source: Track;
  status: MatchStatus;
  method: MatchMethod;
  confidence: number;
  match?: Track;
  candidates: ScoredCandidate[];
  /** Human-readable differences, e.g. "Live version", "Clean vs explicit". */
  flags: string[];
  aiReason?: string;
  /** Whether this track has been written to the destination. */
  added: boolean;
  /** User skipped this track during review. */
  skipped?: boolean;
}

export type TransferSource =
  | { type: "universal"; slug: string }
  | { type: "playlist"; platform: Platform; id: string }
  | { type: "liked"; platform: Platform };

export type TransferStatus = "queued" | "reading" | "matching" | "writing" | "done" | "failed";
