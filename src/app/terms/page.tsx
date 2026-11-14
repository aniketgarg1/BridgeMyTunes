import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service · BridgeMyTunes" };

export default function Terms() {
  return (
    <article className="mx-auto max-w-2xl space-y-6 text-sm leading-relaxed text-muted [&_h1]:text-foreground [&_h2]:text-foreground">
      <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
      <p>Last updated: 14 November 2026</p>
      <p>
        BridgeMyTunes is a free tool for sharing playlists across YouTube Music and Apple Music. It&apos;s an early project
        and is provided as is, without warranties. Song matching is automatic and may sometimes pick a different version of a song.
      </p>
      <h2 className="text-lg font-semibold">Your use</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Only share playlists you&apos;re allowed to share.</li>
        <li>You need your own YouTube or Apple Music account to add playlists to it. Apple Music requires a subscription.</li>
        <li>
          Using YouTube features means you also agree to the{" "}
          <a className="text-accent underline" href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms of Service</a>.
        </li>
      </ul>
      <h2 className="text-lg font-semibold">Not affiliated</h2>
      <p>BridgeMyTunes isn&apos;t affiliated with or endorsed by Google, YouTube, Apple or Spotify.</p>
      <h2 className="text-lg font-semibold">Contact</h2>
      <p>contactoriginlabs@gmail.com</p>
    </article>
  );
}
