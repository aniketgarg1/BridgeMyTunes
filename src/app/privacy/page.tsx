import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy · BridgeMyTunes" };

const CONTACT = "contactoriginlabs@gmail.com";

export default function Privacy() {
  return (
    <article className="mx-auto max-w-2xl space-y-6 text-sm leading-relaxed text-muted [&_h1]:text-foreground [&_h2]:text-foreground">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p>Last updated: 14 November 2026</p>
      <p>
        BridgeMyTunes (&quot;we&quot;) turns a music playlist into one link that can be added to YouTube Music or Apple Music.
        This page explains what we collect and why.
      </p>

      <h2 className="text-lg font-semibold">What we collect</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>An anonymous session cookie so the site remembers which services you connected. We don&apos;t ask for your name or email.</li>
        <li>Access tokens from YouTube (Google) and Apple Music when you choose to connect them. You approve this on Google&apos;s or Apple&apos;s own sign-in screen. We never see your password.</li>
        <li>Song details of playlists you share or transfer (titles, artists, albums, durations, track IDs) and the results of matching them.</li>
      </ul>

      <h2 className="text-lg font-semibold">How we use it</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>To read a playlist you give us and show it on its share page.</li>
        <li>To create a playlist in your YouTube Music or Apple Music account, only when you click to add it.</li>
        <li>To remember song matches so future transfers are faster.</li>
      </ul>
      <p>We don&apos;t sell your data, show ads, or share it with anyone except the music services you connect.</p>

      <h2 className="text-lg font-semibold">Google and YouTube</h2>
      <p>
        BridgeMyTunes uses YouTube API Services. By using it you agree to the{" "}
        <a className="text-accent underline" href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms of Service</a>, and Google&apos;s use of data is covered by the{" "}
        <a className="text-accent underline" href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a>.
      </p>
      <p>
        BridgeMyTunes&apos; use and transfer of information received from Google APIs adheres to the{" "}
        <a className="text-accent underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.
      </p>
      <p>
        You can remove our access to your YouTube account at any time at{" "}
        <a className="text-accent underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">myaccount.google.com/permissions</a>.
        Apple Music access can be removed in your Apple ID settings.
      </p>

      <h2 className="text-lg font-semibold">Storage and deletion</h2>
      <p>
        Data is stored in MongoDB Atlas and the site runs on Vercel. Email {CONTACT} to have your data deleted; we&apos;ll remove it within 30 days.
        Shared playlist pages stay online until you ask us to remove them.
      </p>

      <h2 className="text-lg font-semibold">Contact</h2>
      <p>{CONTACT}</p>
    </article>
  );
}
