import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About · BridgeMyTunes",
  description: "What BridgeMyTunes is and how it helps you share and move music between Spotify, Apple Music and YouTube Music.",
};

export default function About() {
  return (
    <article className="prose">
      <h1>About BridgeMyTunes</h1>
      <p className="label">One link. Every app.</p>
      <p>
        Your music shouldn&apos;t be stuck in one app. BridgeMyTunes moves songs, albums and playlists between Spotify, Apple
        Music and YouTube Music, for yourself or for a friend who uses a different app. It finds the right version of every
        song automatically.
      </p>

      <h2>For your friends</h2>
      <p>
        Found a playlist you want to share, but your friend uses another app? <Link href="/">Paste the link</Link> and send them
        the BridgeMyTunes link instead. They pick the app they use and the music opens there. A single song opens straight
        away; a playlist is added to their app in one tap. Nobody has to search for songs one by one.
      </p>

      <h2>For yourself</h2>
      <p>
        Switching from one music app to another? <Link href="/switch">Switch apps</Link> copies your playlists and liked songs
        to the new app, so you don&apos;t start over. Nothing is removed from the app you&apos;re leaving.
      </p>

      <h2>How it works</h2>
      <ul>
        <li>Paste a song, album or playlist link from Spotify, Apple Music or YouTube Music.</li>
        <li>BridgeMyTunes looks up every song on the other apps. It matches the exact recording first (its ISRC code), then the title, artist, album and length.</li>
        <li>For close calls, Google Gemini checks whether it&apos;s really the same recording and not a live, remix or sped-up version. It also finds songs a normal search misses and suggests similar songs when one isn&apos;t available.</li>
        <li>Anything still unsure waits for you to review, so nothing is swapped without you knowing.</li>
      </ul>

      <h2>Free and private</h2>
      <p>
        BridgeMyTunes is free to use. You only sign in to an app when you want music added to it, on that app&apos;s own sign-in
        screen, and we never see your password. See the <Link href="/privacy">privacy policy</Link> for what we keep and why.
      </p>

      <h2>Not affiliated</h2>
      <p>BridgeMyTunes isn&apos;t affiliated with or endorsed by Spotify, Apple or Google.</p>
    </article>
  );
}
