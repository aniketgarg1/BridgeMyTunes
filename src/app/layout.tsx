import type { Metadata } from "next";
import { Radio_Canada, Radio_Canada_Big } from "next/font/google";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import "./globals.css";

const display = Radio_Canada_Big({ variable: "--font-rcbig", subsets: ["latin"], weight: ["400", "700"] });
const body = Radio_Canada({ variable: "--font-rc", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "BridgeMyTunes: share music with anyone",
  description: "Paste a song, album or playlist link. Anyone can open it on YouTube Music, Apple Music or Spotify.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <div className="shell">
          <header className="topbar">
            <div className="wrap topbar__inner">
              <Link href="/" className="wordmark">
                BridgeMyTunes
              </Link>
              <Nav />
            </div>
          </header>
          <main className="main">
            <div className="wrap">{children}</div>
          </main>
          <footer className="footer">
            <div className="wrap footer__inner">
              <span>BridgeMyTunes</span>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
