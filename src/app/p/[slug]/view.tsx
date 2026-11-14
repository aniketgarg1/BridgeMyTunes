"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, useMe, useUrlError } from "@/components/api";
import { ConnectButton, serviceName } from "@/components/ConnectButton";
import { Cover, fmtDuration, TrackRow } from "@/components/TrackRow";
import type { PublicPlaylist } from "@/lib/playlists";
import { ALL_PLATFORMS, PLATFORMS, type Platform } from "@/lib/types";

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

  if (notFound) {
    return (
      <div className="empty">
        <h1 className="title">this link doesn&apos;t exist</h1>
        <p>It may have been mistyped. Ask whoever sent it for a fresh one.</p>
      </div>
    );
  }
  if (!pl) {
    return (
      <p className="label" role="status">
        loading…
      </p>
    );
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(pl.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't copy. Select the link and copy it yourself.");
    }
  };

  const copyRow = (pl.isOwner || justCreated) && (
    <div className="copy">
      <label htmlFor="share-url" className="visually-hidden">
        Share link
      </label>
      <input id="share-url" readOnly value={pl.shareUrl} onFocus={(e) => e.target.select()} className="field field--mono" />
      <button onClick={copyLink} className="btn btn--primary">
        {copied ? "copied" : "copy link"}
      </button>
    </div>
  );

  const errorRow = error && (
    <p className="notice" role="alert">
      {error}
    </p>
  );

  if (pl.kind === "song") {
    const track = pl.tracks[0];
    const order = [pl.source.platform, ...ALL_PLATFORMS.filter((p) => p !== pl.source.platform)];
    // Fill the door for the service the viewer already uses; with none connected, all three stay outlined.
    const mine = order.find((p) => p !== pl.source.platform && me?.connections[p]);
    return (
      <div className="share">
        <Cover src={pl.imageUrl} title={pl.name} className="cover" />
        <div className="share__head">
          <h1 className="title title--content title--share">{pl.name}</h1>
          <div className="share__meta">
            <span>{pl.ownerName}</span>
            {track?.album && <span>{track.album}</span>}
            {track?.durationMs ? <span>{fmtDuration(track.durationMs)}</span> : null}
          </div>
          {copyRow}
          {errorRow}
          <div className="ledger" aria-label="Where this song plays">
            {order.map((p) => {
              const found = pl.links[p];
              const ok = found?.url && (found.status === "matched" || (found.status === "uncertain" && (found.confidence ?? 0) >= 0.6));
              return (
                <div key={p} className="ledger__row">
                  <span className="ledger__service">{serviceName(p)}</span>
                  <span className="ledger__found">
                    {ok ? (
                      <>
                        <span>{found!.title}</span>
                        <span className="label">
                          {p === pl.source.platform ? "the original" : found!.status === "matched" ? "same recording" : "closest match"}
                        </span>
                      </>
                    ) : (
                      <span className="label">not found on {serviceName(p)}</span>
                    )}
                  </span>
                  {ok ? (
                    <a href={found!.url} target="_blank" rel="noreferrer" className={`btn${p === mine ? " btn--primary" : ""}`}>
                      open
                    </a>
                  ) : (
                    <span />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const minutes = Math.round(pl.tracks.reduce((a, t) => a + (t.durationMs ?? 0), 0) / 60000);
  // Spotify is offered when the visitor signed in to it, or when the house account can make the playlist for them.
  const destinations = [...PLATFORMS, ...(me?.spotifyHouse || me?.connections.spotify ? (["spotify"] as Platform[]) : [])].filter(
    (p) => p !== pl.source.platform,
  );
  // An album repeats one album name on every row; only a playlist gets the album column.
  const oneAlbum = new Set(pl.tracks.map((t) => t.album)).size <= 1;

  return (
    <div>
      <div className="share">
        <Cover src={pl.imageUrl} title={pl.name} className="cover" />
        <div className="share__head">
          <h1 className="title title--content title--share">{pl.name}</h1>
          <div className="share__meta">
            {pl.ownerName && <span>{pl.ownerName}</span>}
            <span>{pl.partial ? `first ${pl.tracks.length} songs` : `${pl.tracks.length} songs`}</span>
            {minutes > 0 && <span>{minutes} min</span>}
          </div>
          <div className="share__actions">
            {destinations.map((p, i) => {
              const label = `add to ${serviceName(p)}`;
              if (me?.connections[p] || (p === "spotify" && me?.spotifyHouse)) {
                return (
                  <button key={p} disabled={starting !== null || autoStarting} onClick={() => start(p)} className={`btn btn--lg${i === 0 ? " btn--primary" : ""}`}>
                    {starting === p || (autoStarting && autoAdd === p) ? "adding…" : label}
                  </button>
                );
              }
              return (
                <ConnectButton
                  key={p}
                  platform={p}
                  label={label}
                  primary={i === 0}
                  returnTo={`/p/${slug}?add=${p}`}
                  onConnected={async () => {
                    await refreshMe();
                    start(p);
                  }}
                />
              );
            })}
            {pl.source.url && (
              <a href={pl.source.url} target="_blank" rel="noreferrer" className="btn btn--quiet btn--lg">
                open in {serviceName(pl.source.platform)}
              </a>
            )}
          </div>
          {copyRow}
          {errorRow}
        </div>
      </div>

      <div className={`tracks${oneAlbum ? " tracks--album" : ""}`}>
        {pl.tracks.map((t, i) => (
          <TrackRow key={`${i}-${t.title}`} track={t} index={i} />
        ))}
      </div>
    </div>
  );
}
