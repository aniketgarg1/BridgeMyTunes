"use client";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PLATFORM_LABEL, type Platform } from "@/lib/types";
import { api } from "./api";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    MusicKit?: any;
  }
}

const MUSICKIT_SRC = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";

function loadMusicKit(): Promise<any> {
  if (window.MusicKit?.configure) return Promise.resolve(window.MusicKit);
  return new Promise((resolve, reject) => {
    document.addEventListener("musickitloaded", () => resolve(window.MusicKit), { once: true });
    if (!document.querySelector(`script[src="${MUSICKIT_SRC}"]`)) {
      const s = document.createElement("script");
      s.src = MUSICKIT_SRC;
      s.async = true;
      s.dataset.webComponents = "";
      s.onerror = () => reject(new Error("Couldn't load MusicKit"));
      document.head.appendChild(s);
    }
  });
}

async function connectApple() {
  const { developerToken, mock } = await api<{ developerToken?: string; mock?: boolean }>("/api/auth/apple/token");
  if (!mock) {
    const MusicKit = await loadMusicKit();
    await MusicKit.configure({ developerToken, app: { name: "TuneBridge", build: "0.1.0" } });
    const musicUserToken: string = await MusicKit.getInstance().authorize();
    if (!musicUserToken) throw new Error("Apple Music access was not granted");
    await api("/api/auth/apple/connect", { json: { musicUserToken } });
  } else {
    await api("/api/auth/apple/connect", { json: { mock: true } });
  }
}

export const PlatformDot = ({ platform, className = "" }: { platform: Platform; className?: string }) => (
  <span
    aria-hidden
    className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${platform === "spotify" ? "bg-spotify" : "bg-apple"} ${className}`}
  />
);

export function ConnectButton({
  platform,
  connected,
  returnTo,
  onConnected,
  label,
  className = "",
}: {
  platform: Platform;
  connected?: boolean;
  returnTo?: string;
  onConnected?: () => void;
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pathname = usePathname();
  const go = async () => {
    setError(null);
    setBusy(true);
    try {
      await connectApple();
      onConnected?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't connect Apple Music");
    } finally {
      setBusy(false);
    }
  };

  if (connected) {
    return (
      <span className={`inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-muted ${className}`}>
        <PlatformDot platform={platform} /> {PLATFORM_LABEL[platform]} connected
      </span>
    );
  }

  const base = `inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-60 ${
    platform === "spotify" ? "bg-spotify text-black hover:brightness-110" : "bg-apple text-white hover:brightness-110"
  }`;
  const cls = `${base} ${className}`;

  if (platform === "spotify") {
    // Full-page navigation: the API route redirects to Spotify's OAuth screen.
    return (
      <a href={`/api/auth/spotify/login?returnTo=${encodeURIComponent(returnTo ?? pathname)}`} className={cls}>
        {label ?? "Connect Spotify"}
      </a>
    );
  }

  return (
    <span className={`inline-flex flex-col gap-1 ${className}`}>
      <button
        onClick={go}
        disabled={busy}
        className={`${base} w-full`}
      >
        {busy ? "Connecting…" : (label ?? `Connect ${PLATFORM_LABEL[platform]}`)}
      </button>
      {error && <span className="text-xs text-bad">{error}</span>}
    </span>
  );
}
