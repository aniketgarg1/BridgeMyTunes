export type Platform = "spotify" | "apple";

export const PLATFORMS: Platform[] = ["spotify", "apple"];

export const PLATFORM_LABEL: Record<Platform, string> = {
  spotify: "Spotify",
  apple: "Apple Music",
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
