import type { Metadata } from "next";
import { getUniversalPlaylist } from "@/lib/playlists";
import { UniversalPlaylistView } from "./view";

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const doc = await getUniversalPlaylist(slug).catch(() => null);
  if (!doc) return { title: "Playlist · TuneBridge" };
  const description = `${doc.tracks.length} songs${doc.ownerName ? ` from ${doc.ownerName}` : ""}. Open it on Spotify or Apple Music.`;
  return {
    title: `${doc.name} · TuneBridge`,
    description,
    openGraph: { title: doc.name, description, images: doc.imageUrl ? [doc.imageUrl] : undefined },
  };
}

export default async function Page({ params, searchParams }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const { error, created, add } = await searchParams;
  return (
    <UniversalPlaylistView
      slug={slug}
      initialError={typeof error === "string" ? error : null}
      justCreated={created !== undefined}
      autoAdd={add === "spotify" || add === "apple" || add === "youtube" ? add : null}
    />
  );
}
