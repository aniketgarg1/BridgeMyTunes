import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service · BridgeMyTunes" };

export default function Terms() {
  return (
    <article className="prose">
      <h1>Terms of service</h1>
      <p className="label">last updated 14 November 2026</p>
      <p>
        BridgeMyTunes is a free tool for sharing playlists across YouTube Music and Apple Music. It&apos;s an early project
        and is provided as is, without warranties. Song matching is automatic and may sometimes pick a different version of a song.
      </p>
      <h2>Your use</h2>
      <ul>
        <li>Only share playlists you&apos;re allowed to share.</li>
        <li>You need your own YouTube or Apple Music account to add playlists to it. Apple Music requires a subscription.</li>
        <li>
          Using YouTube features means you also agree to the{" "}
          <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms of Service</a>.
        </li>
      </ul>
      <h2>Not affiliated</h2>
      <p>BridgeMyTunes isn&apos;t affiliated with or endorsed by Google, YouTube, Apple or Spotify.</p>
    </article>
  );
}
