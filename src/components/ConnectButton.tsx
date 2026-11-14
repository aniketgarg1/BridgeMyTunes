"use client";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PLATFORM_LABEL, type Platform } from "@/lib/types";
import { api } from "./api";
import { ServiceLogo } from "./ServiceLogo";

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
    await MusicKit.configure({ developerToken, app: { name: "BridgeMyTunes", build: "0.1.0" } });
    const music = MusicKit.getInstance();
    // Drop any cached login so the person can pick the Apple ID that has the subscription.
    if (music.isAuthorized) await music.unauthorize().catch(() => {});
    let musicUserToken: string | undefined;
    try {
      musicUserToken = await music.authorize();
    } catch {
      musicUserToken = undefined;
    }
    if (!musicUserToken) {
      throw new Error("Apple Music sign-in didn't finish. Use an Apple ID with an active Apple Music subscription, then try again.");
    }
    await api("/api/auth/apple/connect", { json: { musicUserToken } });
  } else {
    await api("/api/auth/apple/connect", { json: { mock: true } });
  }
}

/** The service's proper name for interface text ("YouTube Music"). */
export const serviceName = (p: Platform) => PLATFORM_LABEL[p];

export function ConnectButton({
  platform,
  connected,
  returnTo,
  onConnected,
  label,
  primary = false,
  block = false,
}: {
  platform: Platform;
  connected?: boolean;
  returnTo?: string;
  onConnected?: () => void;
  label?: string;
  primary?: boolean;
  block?: boolean;
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
      <span className="pill pill--accent connected">
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
          <path d="M6.2 11.6 2.6 8l1.1-1.1 2.5 2.5 6.1-6.1 1.1 1.1z" />
        </svg>
        {serviceName(platform)} connected
      </span>
    );
  }

  const cls = `btn connect__btn${primary ? " btn--primary" : ""}${block ? " btn--block" : ""}`;
  const text = label ?? `Connect ${serviceName(platform)}`;
  const logo = <ServiceLogo platform={platform} size={20} className="connect__logo" />;

  if (platform !== "apple") {
    // Full-page navigation: the API route redirects to Spotify's or Google's sign-in screen.
    return (
      <a href={`/api/auth/${platform}/login?returnTo=${encodeURIComponent(returnTo ?? pathname)}`} className={cls}>
        {logo}
        <span>{text}</span>
      </a>
    );
  }

  return (
    <span className="connect">
      <button onClick={go} disabled={busy} aria-busy={busy} className={cls}>
        {logo}
        <span>{busy ? "Connecting…" : text}</span>
      </button>
      {error && (
        <span className="notice" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
