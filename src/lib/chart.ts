import "server-only";

/** A song from Apple Music's public top songs chart: what the home page floats around the paste bar. */
export interface ChartSong {
  name: string;
  artist: string;
  url: string;
  art: string;
}

const FEED = "https://rss.marketingtools.apple.com/api/v2/us/music/most-played/30/songs.json";

/** Today's chart, one song per album cover, refreshed once a day. An empty list if Apple can't be reached. */
export async function chartSongs(limit = 10): Promise<ChartSong[]> {
  try {
    const res = await fetch(FEED, { next: { revalidate: 86400 } });
    if (!res.ok) return [];
    const data = (await res.json()) as { feed?: { results?: { name: string; artistName: string; url: string; artworkUrl100: string }[] } };
    const seen = new Set<string>();
    const out: ChartSong[] = [];
    for (const r of data.feed?.results ?? []) {
      const art = r.artworkUrl100?.replace(/\/\d+x\d+bb\./, "/300x300bb.");
      if (!art || !r.url || seen.has(art)) continue;
      seen.add(art);
      out.push({ name: r.name, artist: r.artistName, url: r.url, art });
      if (out.length === limit) break;
    }
    return out;
  } catch {
    return [];
  }
}
