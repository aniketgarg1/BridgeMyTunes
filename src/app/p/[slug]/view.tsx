"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, useMe, useUrlError } from "@/components/api";
import { ConnectButton, PlatformDot } from "@/components/ConnectButton";
import { TrackRow } from "@/components/TrackRow";
import type { PublicPlaylist } from "@/lib/playlists";
import { PLATFORM_BUTTON, PLATFORM_LABEL, PLATFORMS, type Platform } from "@/lib/types";

export function UniversalPlaylistView({
  slug,
  initialError,
  justCreated,
  autoAdd,
}: {
  slug: string;
  initialError: string | null;
  justCreated: boolean;
  /** Set after an OAuth round-trip (?add=<platform>) so the transfer continues automatically. */
  autoAdd: Platform | null;
}) {
  const router = useRouter();
  const { me, refresh: refreshMe } = useMe();
  const [error, setError] = useUrlError(initialError);
  const [pl, setPl] = useState<PublicPlaylist | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [starting, setStarting] = useState<Platform | null>(null);
  const [copied, setCopied] = useState(false);
  const autoStarted = useRef(false);

  useEffect(() => {
    api<PublicPlaylist>(`/api/playlists/${slug}`)
      .then(setPl)
      .catch(() => setNotFound(true));
  }, [slug]);

  const start = useCallback(
    async (destination: Platform) => {
      setStarting(destination);
      setError(null);
      try {
        const { ids } = await api<{ ids: string[] }>("/api/transfers", {
          json: { destination, sources: [{ type: "universal", slug }] },
        });
        router.push(`/transfers/${ids[0]}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't start");
        setStarting(null);
      }
    },
    [router, slug, setError],
  );

  const autoStarting = Boolean(autoAdd && me?.connections[autoAdd]);
  useEffect(() => {
    if (!autoAdd || !me?.connections[autoAdd] || autoStarted.current) return;
    autoStarted.current = true;
    api<{ ids: string[] }>("/api/transfers", { json: { destination: autoAdd, sources: [{ type: "universal", slug }] } })
      .then(({ ids }) => router.push(`/transfers/${ids[0]}`))
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't start"));
  }, [autoAdd, me, router, slug, setError]);

  if (notFound) return <p className="py-20 text-center text-muted">Link not found</p>;
  if (!pl) return null;

  const minutes = Math.round(pl.tracks.reduce((a, t) => a + (t.durationMs ?? 0), 0) / 60000);

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <section className="flex flex-col items-center gap-5 text-center">
        {pl.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pl.imageUrl} alt="" className="h-56 w-56 rounded-2xl bg-surface-2 object-cover shadow-2xl" />
        ) : (
          <div className="bridge-gradient h-56 w-56 rounded-2xl opacity-80 shadow-2xl" />
        )}
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{pl.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {pl.ownerName ? `${pl.ownerName} · ` : ""}
            {pl.tracks.length} songs{minutes ? ` · ${minutes} min` : ""}
          </p>
        </div>

        <div className="flex w-full max-w-xs flex-col gap-2">
          {!PLATFORMS.includes(pl.source.platform) && pl.source.url && (
            <a href={pl.source.url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm hover:bg-surface">
              <PlatformDot platform={pl.source.platform} /> Open in {PLATFORM_LABEL[pl.source.platform]}
            </a>
          )}
          {PLATFORMS.map((p) => {
            const label = PLATFORM_LABEL[p];
            if (p === pl.source.platform && pl.source.url) {
              return (
                <a key={p} href={pl.source.url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm hover:bg-surface">
                  <PlatformDot platform={p} /> Open in {label}
                </a>
              );
            }
            if (me?.connections[p]) {
              return (
                <button
                  key={p}
                  disabled={starting !== null || autoStarting}
                  onClick={() => start(p)}
                  className={`rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-60 ${PLATFORM_BUTTON[p]}`}
                >
                  {starting === p || (autoStarting && autoAdd === p) ? "Adding…" : `Add to ${label}`}
                </button>
              );
            }
            return (
              <ConnectButton
                key={p}
                platform={p}
                label={`Add to ${label}`}
                returnTo={`/p/${slug}?add=${p}`}
                className="w-full"
                onConnected={async () => {
                  await refreshMe();
                  start(p);
                }}
              />
            );
          })}
        </div>
        {error && <p className="text-sm text-bad">{error}</p>}

        {(pl.isOwner || justCreated) && (
          <div className="flex w-full max-w-md items-center gap-2 rounded-full border border-border bg-surface p-1.5 pl-4">
            <span className="min-w-0 flex-1 truncate text-left font-mono text-xs text-muted">{pl.shareUrl.replace(/^https?:\/\//, "")}</span>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(pl.shareUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background"
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        )}
      </section>

      <section className="divide-y divide-border">
        {pl.tracks.map((t, i) => (
          <TrackRow key={`${i}-${t.title}`} track={t} index={i} />
        ))}
      </section>
    </div>
  );
}
