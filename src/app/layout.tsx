import type { Metadata } from "next";
import { Onest, Outfit } from "next/font/google";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import "./globals.css";

const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"], weight: ["300", "500"] });
const onest = Onest({ variable: "--font-onest", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "BridgeMyTunes: share music with anyone",
  description: "Paste a song, album or playlist link. Anyone can open it on YouTube Music, Apple Music or Spotify.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${outfit.variable} ${onest.variable}`}>
      <body>
        <div className="shell">
          <header className="topbar">
            <div className="wrap topbar__inner">
              <Link href="/" className="wordmark">
                bridgemytunes
              </Link>
              <Nav />
            </div>
          </header>
          <main className="main">
            <div className="wrap">{children}</div>
          </main>
          <footer className="footer">
            <div className="wrap footer__inner">
              <Link href="/privacy">privacy</Link>
              <Link href="/terms">terms</Link>
              <span className="footer__note">not affiliated with google, apple or spotify</span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
