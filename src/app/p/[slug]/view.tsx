"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, useMe, useUrlError } from "@/components/api";
import { AppSwitch } from "@/components/AppSwitch";
import { ConnectButton, serviceName } from "@/components/ConnectButton";
import { ServiceLogo } from "@/components/ServiceLogo";
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
  // The app the visitor picked in the switch; until they pick, a sensible default is derived below.
  const [picked, setPicked] = useState<Platform | null>(null);
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
      <div className="share-empty">
        <h1 className="title">This link doesn&apos;t exist</h1>
        <p className="share__meta">It may have been mistyped. Ask whoever sent it for a fresh one.</p>
      </div>
    );
  }
  if (!pl) {
    return (
      <p className="label" role="status">
        Loading…
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
      <button onClick={copyLink} className="btn btn--primary btn--lg">
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );

  const errorRow = error && (
    <p className="notice" role="alert">
      {error}
    </p>
  );

  const art = (
    <div className="share__art">
      <Cover src={pl.imageUrl} title={pl.name} className="cover" />
    </div>
  );

  if (pl.kind === "song") {
    const track = pl.tracks[0];
    const order = [pl.source.platform, ...ALL_PLATFORMS.filter((p) => p !== pl.source.platform)];
    // Fill the door for the service the viewer already uses; with none connected, all three stay quiet.
    const mine = order.find((p) => p !== pl.source.platform && me?.connections[p]);
    const meta = [pl.ownerName && `By ${pl.ownerName}`, track?.album, track?.durationMs ? fmtDuration(track.durationMs) : null].filter(Boolean);
    return (
      <div className="share">
        {art}
        <div className="share__head">
          <h1 className="title title--content title--share">{pl.name}</h1>
          {meta.length > 0 && <p className="share__meta">{meta.join(". ")}.</p>}
          {copyRow}
          {errorRow}
          <div className="ledger" aria-label="Where this song plays">
            {order.map((p) => {
              const found = pl.links[p];
              const ok = found?.url && (found.status === "matched" || (found.status === "uncertain" && (found.confidence ?? 0) >= 0.6));
              return (
                <div key={p} className={`ledger__row${p === mine ? " ledger__row--mine" : ""}`}>
                  <span className="ledger__service">
                    <ServiceLogo platform={p} size={24} />
                    {serviceName(p)}
                  </span>
                  <span className="ledger__found">
                    {ok ? (
                      <>
                        <span className="ledger__title">{found!.title}</span>
                        <span className="label">
                          {p === pl.source.platform ? "The original" : found!.status === "matched" ? "Same recording" : "Closest match"}
                        </span>
                      </>
                    ) : (
                      <span className="label">Not found on {serviceName(p)}</span>
                    )}
                  </span>
                  {ok ? (
                    <a
                      href={found!.url}
                      target="_blank"
                      rel="noreferrer"
                      className={`btn ledger__open${p === mine ? " btn--primary" : ""}`}
                      aria-label={`Open in ${serviceName(p)}`}
                    >
                      Open
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
  // Default: the app an OAuth round-trip came back for, then one the visitor is already connected to, then the first.
  const fallback =
    (autoAdd && destinations.includes(autoAdd) ? autoAdd : null) ?? destinations.find((p) => me?.connections[p]) ?? destinations[0];
  const app = picked && destinations.includes(picked) ? picked : fallback;
  const ready = Boolean(me?.connections[app] || (app === "spotify" && me?.spotifyHouse));
  const busy = starting !== null || autoStarting;
  const label = `Add to ${serviceName(app)}`;
  // An album repeats one album name on every row; only a playlist gets the album column.
  const oneAlbum = new Set(pl.tracks.map((t) => t.album)).size <= 1;
  const count = pl.partial ? `First ${pl.tracks.length} songs` : `${pl.tracks.length} songs`;
  const meta = [pl.ownerName && `By ${pl.ownerName}`, minutes > 0 ? `${count}, ${minutes} min` : count].filter(Boolean);

  return (
    <div className="share">
      {art}
      <div className="share__head">
        <h1 className="title title--content title--share">{pl.name}</h1>
        <p className="share__meta">{meta.join(". ")}.</p>

        <div className="share__open">
          {/* With one app to add to there's nothing to choose, so the switch only shows for two or more. */}
          {destinations.length > 1 && (
            <>
              <p className="label" aria-hidden="true">
                Your app
              </p>
              <AppSwitch options={destinations} value={app} onChange={setPicked} label="Your app" disabled={busy} />
            </>
          )}
          <div className="share__go">
            <div key={app} className="share__action" data-app={app}>
              {ready ? (
                <button disabled={busy} onClick={() => start(app)} className="btn btn--primary btn--lg">
                  <ServiceLogo platform={app} size={20} />
                  {starting === app || (autoStarting && autoAdd === app) ? "Adding…" : label}
                </button>
              ) : (
                <span className="share__connect">
                  <ConnectButton
                    platform={app}
                    label={label}
                    primary
                    returnTo={`/p/${slug}?add=${app}`}
                    onConnected={async () => {
                      await refreshMe();
                      start(app);
                    }}
                  />
                </span>
              )}
            </div>
            {pl.source.url && (
              <a href={pl.source.url} target="_blank" rel="noreferrer" className="btn btn--quiet btn--lg share__source">
                <ServiceLogo platform={pl.source.platform} size={20} />
                Open in {serviceName(pl.source.platform)}
              </a>
            )}
          </div>
        </div>

        {copyRow}
        {errorRow}

        <div className={`tracks share__tracks${oneAlbum ? " tracks--album" : ""}`}>
          {pl.tracks.map((t, i) => (
            <TrackRow key={`${i}-${t.title}`} track={t} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
