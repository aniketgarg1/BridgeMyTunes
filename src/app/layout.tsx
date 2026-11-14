import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TuneBridge: share music with anyone",
  description:
    "One playlist link that works on Spotify and Apple Music. Switch platforms without rebuilding your library.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header>
          <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-4 text-sm">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="bridge-gradient inline-block h-2.5 w-6 rounded-full" aria-hidden />
              TuneBridge
            </Link>
            <div className="ml-auto flex items-center gap-1 sm:gap-4">
              <Link href="/switch" className="rounded-md px-2 py-1 text-muted hover:text-foreground">
                Switch
              </Link>
              <Link href="/transfers" className="rounded-md px-2 py-1 text-muted hover:text-foreground">
                Transfers
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">{children}</main>
        <footer className="flex justify-center gap-4 py-6 text-xs text-muted">
          <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link href="/terms" className="hover:text-foreground">Terms</Link>
        </footer>
      </body>
    </html>
  );
}
