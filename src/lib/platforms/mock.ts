import type { Platform, PlaylistSnapshot, PlaylistSummary, Track } from "../types";
import type { MusicAdapter, SearchQuery } from "./types";

/*
 * Fake Spotify + Apple Music catalogs (MOCK_MUSIC=1). The variants are deliberately messy so the
 * matcher has real work: remaster suffixes, "feat." naming, live and clean versions, missing songs.
 */

type Row = [title: string, artists: string[], album: string, durationMs: number, isrc?: string, explicit?: boolean];

const SPOTIFY: Row[] = [
  ["Blinding Lights", ["The Weeknd"], "After Hours", 200040, "USUG11904206"],
  ["Bohemian Rhapsody - Remastered 2011", ["Queen"], "A Night At The Opera (2011 Remaster)", 354320, "GBUM71029604"],
  ["Sunflower - Spider-Man: Into the Spider-Verse", ["Post Malone", "Swae Lee"], "Hollywood's Bleeding", 158040, "USUM71814888"],
  ["Peaches (feat. Daniel Caesar & Giveon)", ["Justin Bieber", "Daniel Caesar", "Giveon"], "Justice", 198082, undefined, true],
  ["Dreams", ["Fleetwood Mac"], "Rumours", 257800, "USWB10400049"],
  ["HUMBLE.", ["Kendrick Lamar"], "DAMN.", 177000, "USUM71703861", true],
  ["Paper Lanterns (Bedroom Demo)", ["The Quiet Harbors"], "Basement Tapes", 214000, "QZTB52600001"],
  ["Hurt", ["Johnny Cash"], "American IV: The Man Comes Around", 216706, "USUM70210632"],
  ["Mr. Brightside", ["The Killers"], "Hot Fuss", 222973, "USIR20400274"],
  ["Levitating (feat. DaBaby)", ["Dua Lipa", "DaBaby"], "Future Nostalgia", 203807, "GBAHT2000942"],
  ['"Heroes" - 2017 Remaster', ["David Bowie"], '"Heroes" (2017 Remaster)', 371000, "USJT11700005"],
  ["Despacito - Remix", ["Luis Fonsi", "Daddy Yankee", "Justin Bieber"], "Despacito Feat. Justin Bieber (Remix)", 228826, "USUM71703692"],
  // Destination-only variants that make search harder
  ["Hurt", ["Nine Inch Nails"], "The Downward Spiral", 373000, "USIR19400443", true],
  ["Dreams - Live", ["Fleetwood Mac"], "The Dance", 263000, "USWB19700911"],
  ["Levitating", ["Dua Lipa"], "Future Nostalgia", 203064, "GBAHT1901121"],
];

const APPLE: Row[] = [
  ["Blinding Lights", ["The Weeknd"], "After Hours", 200040, "USUG11904206"],
  ["Bohemian Rhapsody", ["Queen"], "A Night at the Opera (2011 Remaster)", 354947, "GBUM71029604"],
  ["Sunflower (Spider-Man: Into the Spider-Verse)", ["Post Malone & Swae Lee"], "Hollywood's Bleeding", 158040, "USUM71814888"],
  ["Peaches (feat. Daniel Caesar & Giveon)", ["Justin Bieber"], "Justice", 198082, "USUM72102636", true],
  ["Dreams (2004 Remaster)", ["Fleetwood Mac"], "Rumours (Super Deluxe)", 257920, "USWB10403301"],
  ["Dreams (Live)", ["Fleetwood Mac"], "The Dance", 263000, "USWB19700911"],
  ["HUMBLE.", ["Kendrick Lamar"], "DAMN.", 177000, "USUM71703866", false],
  ["Hurt", ["Nine Inch Nails"], "The Downward Spiral", 373000, "USIR19400443", true],
  ["Hurt", ["Johnny Cash"], "American IV - The Man Comes Around", 216706, "USUM70210632"],
  ["Mr. Brightside", ["The Killers"], "Hot Fuss", 222973, "USIR20400274"],
  ["Levitating", ["Dua Lipa"], "Future Nostalgia", 203064, "GBAHT1901121"],
  ["Levitating (feat. DaBaby)", ["Dua Lipa"], "Future Nostalgia (The Moonlight Edition)", 203807, undefined],
  ['"Heroes" (2017 Remaster)', ["David Bowie"], '"Heroes" (2017 Remaster)', 371000, "USJT11700005"],
  ["Despacito (feat. Justin Bieber) [Remix]", ["Luis Fonsi & Daddy Yankee"], "Despacito (feat. Justin Bieber) [Remix] - Single", 228826, undefined],
  ["Midnight City", ["M83"], "Hurry Up, We're Dreaming", 243960, "FR6V81141061"],
  ["Ocean Eyes", ["Billie Eilish"], "dont smile at me", 200379, "US23A1500056"],
  ["Electric Feel", ["MGMT"], "Oracular Spectacular", 229640, "USSM10704676"],
];

const SPOTIFY_ONLY_DEST: Row[] = [
  ["Midnight City", ["M83"], "Hurry Up, We're Dreaming", 243960, "FR6V81141061"],
  ["Ocean Eyes", ["Billie Eilish"], "dont smile at me", 200379, "US23A1500056"],
  ["Electric Feel", ["MGMT"], "Oracular Spectacular", 229640, "USSM10704676"],
];

function build(platform: Platform, rows: Row[], prefix: string): Track[] {
  return rows.map(([title, artists, album, durationMs, isrc, explicit], i) => ({
    title,
    artists,
    album,
    durationMs,
    isrc,
    explicit: explicit ?? false,
    artworkUrl: undefined,
    url: platform === "spotify" ? `https://open.spotify.com/track/${prefix}${i}` : `https://music.apple.com/us/song/${prefix}${i}`,
    ids: { [platform]: `${prefix}${i}` },
  }));
}

const CATALOG: Record<Platform, Track[]> = {
  spotify: build("spotify", [...SPOTIFY, ...SPOTIFY_ONLY_DEST], "sp"),
  apple: build("apple", APPLE, "am"),
};

const PLAYLISTS: Record<Platform, { id: string; name: string; description: string; trackIdx: number[] }[]> = {
  spotify: [
    { id: "mock-road-trip", name: "Road Trip 2026", description: "Windows down, volume up.", trackIdx: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
    { id: "mock-chill", name: "Sunday Reset", description: "Slow mornings.", trackIdx: [0, 4, 8] },
  ],
  apple: [
    { id: "p.mockLateNight", name: "Late Night Drive", description: "Neon and empty highways.", trackIdx: [14, 15, 16, 0, 9, 1, 12] },
  ],
};

const LIKED: Record<Platform, number[]> = { spotify: [0, 8, 2, 6], apple: [14, 15, 16, 0] };

const tokens = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

const store = globalThis as unknown as { _mockWrites?: Map<string, string[]> };
store._mockWrites ??= new Map();

export class MockAdapter implements MusicAdapter {
  constructor(public platform: Platform) {}

  private get catalog() {
    return CATALOG[this.platform];
  }

  async listPlaylists(): Promise<PlaylistSummary[]> {
    return PLAYLISTS[this.platform].map((p) => ({ id: p.id, name: p.name, trackCount: p.trackIdx.length, readable: true }));
  }

  async getPlaylist(id: string): Promise<PlaylistSnapshot> {
    const p = PLAYLISTS[this.platform].find((x) => x.id === id);
    if (!p) throw new Error("Demo mode can only open the sample playlists. Add real API keys to open your own.");
    return {
      platform: this.platform,
      id: p.id,
      name: p.name,
      description: p.description,
      ownerName: "Demo User",
      url: this.platform === "spotify" ? `https://open.spotify.com/playlist/${p.id}` : `https://music.apple.com/library/playlist/${p.id}`,
      tracks: p.trackIdx.map((i) => this.catalog[i]),
    };
  }

  async getLikedTracks() {
    return LIKED[this.platform].map((i) => this.catalog[i]);
  }

  async lookupByIsrc(isrcs: string[]) {
    const out = new Map<string, Track[]>();
    for (const isrc of isrcs) out.set(isrc, this.catalog.filter((t) => t.isrc === isrc));
    return out;
  }

  async search(q: SearchQuery) {
    return this.searchText(`${q.title} ${q.artist}`);
  }

  async searchText(text: string) {
    const q = new Set(tokens(text));
    return this.catalog
      .map((t) => ({ t, hits: tokens(`${t.title} ${t.artists.join(" ")}`).filter((w) => q.has(w)).length }))
      .filter((x) => x.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 10)
      .map((x) => x.t);
  }

  async createPlaylist(name: string, _description: string, trackIds: string[]) {
    const id = `mock-created-${Date.now().toString(36)}`;
    store._mockWrites!.set(id, [...trackIds]);
    const url = this.platform === "spotify" ? `https://open.spotify.com/playlist/${id}` : `https://music.apple.com/library/playlist/${id}`;
    return { id, url };
  }

  async addToPlaylist(playlistId: string, trackIds: string[]) {
    store._mockWrites!.set(playlistId, [...(store._mockWrites!.get(playlistId) ?? []), ...trackIds]);
  }

  async saveToLibrary(trackIds: string[]) {
    store._mockWrites!.set(`library-${this.platform}`, trackIds);
  }
}
