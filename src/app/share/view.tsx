"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, useMe, useUrlError } from "@/components/api";
import { ConnectButton, serviceName } from "@/components/ConnectButton";
import { ServiceLogo } from "@/components/ServiceLogo";
import { Cover } from "@/components/TrackRow";
import { parseSongLinks } from "@/lib/links";
import { ALL_PLATFORMS, PLATFORMS, type Platform, type PlaylistSummary } from "@/lib/types";

export function ShareView({ initialError }: { initialError: string | null }) {
  const router = useRouter();
  const { me, refresh } = useMe();
  const [error, setError] = useUrlError(initialError);
  const [platform, setPlatform] = useState<Platform>(PLATFORMS[0]);
  const [loaded, setLoaded] = useState<{ platform: Platform; list: PlaylistSummary[] } | null>(null);
  const [link, setLink] = useState("");
  const [listName, setListName] = useState("");
  // A Spotify desktop copy (Cmd+A, Cmd+C) or any list of song links becomes one shared list.
  const songCount = parseSongLinks(link).length;
  const [busy, setBusy] = useState<string | null>(null);

  const connected = Boolean(me?.connections[platform]);
  const playlists = loaded?.platform === platform ? loaded.list : null;

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    api<{ playlists: PlaylistSummary[] }>(`/api/library/playlists?platform=${platform}`)
      .then((r) => !cancelled && setLoaded({ platform, list: r.playlists }))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [platform, connected, setError]);

  const create = async (body: object, key: string) => {
    setBusy(key);
    setError(null);
    try {
      const { slug } = await api<{ slug: string }>("/api/playlists", { json: body });
      router.push(`/p/${slug}?created=1`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't create the link");
      setBusy(null);
    }
  };

  return (
    <div className="home">
      <section className="hero" aria-labelledby="home-title">
        <div className="hero__in">
          <h1 id="home-title">One link. Every app.</h1>
          <form
            className="paste"
            onSubmit={(e) => {
              e.preventDefault();
              if (link.trim()) create(songCount > 1 ? { url: link, name: listName } : { url: link.trim() }, "url");
            }}
          >
            <label htmlFor="music-link" className="visually-hidden">
              Paste a link
            </label>
            <div className="paste__bar">
              <input
                id="music-link"
                name="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="Paste a song or playlist link"
                autoComplete="off"
                spellCheck={false}
                className="paste__input"
              />
              <button disabled={!link.trim() || busy !== null} className="btn btn--primary paste__go">
                {busy === "url" ? "Making your link…" : "Make link"}
              </button>
            </div>
            {songCount > 1 ? (
              <div className="paste__list">
                <span className="paste__count">{songCount} songs found</span>
                <label htmlFor="list-name" className="visually-hidden">
                  Name this list
                </label>
                <input
                  id="list-name"
                  name="name"
                  value={listName}
                  onChange={(e) => setListName(e.target.value)}
                  placeholder="Name it (optional)"
                  autoComplete="off"
                  className="paste__name"
                />
              </div>
            ) : null}
          </form>
          {error && (
            <p className="paste__error" role="alert">
              {error}
            </p>
          )}
          <ul className="apps" aria-label="Opens in" role="list">
            {ALL_PLATFORMS.map((p) => (
              <li key={p} className="apps__item">
                <span className="apps__logo">
                  <ServiceLogo platform={p} size={20} />
                </span>
                {serviceName(p)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="library" aria-labelledby="library-title">
        <div className="library__head">
          <h2 id="library-title">Your library</h2>
          <div className="tabs" role="tablist" aria-label="Service">
            {PLATFORMS.map((p) => (
              <button key={p} role="tab" aria-selected={platform === p} onClick={() => setPlatform(p)} className="tab">
                <ServiceLogo platform={p} size={16} />
                {serviceName(p)}
              </button>
            ))}
          </div>
        </div>

        {!me ? (
          <p className="label" role="status">
            Loading…
          </p>
        ) : !connected ? (
          <div className="empty">
            <p>Connect {serviceName(platform)} to see your playlists here.</p>
            <ConnectButton platform={platform} onConnected={refresh} primary label={`Connect ${serviceName(platform)}`} />
          </div>
        ) : !playlists ? (
          <p className="label" role="status">
            Loading your library…
          </p>
        ) : playlists.length === 0 ? (
          <div className="empty">
            <p>No playlists on {serviceName(platform)} yet. Paste a link above instead.</p>
          </div>
        ) : (
          <ul className="shelf" role="list">
            {playlists.map((p, i) => (
              <li key={p.id} className="shelf__item" style={{ "--i": Math.min(i, 11) } as CSSProperties}>
                <button
                  disabled={!p.readable || busy !== null}
                  onClick={() => create({ platform, playlistId: p.id }, p.id)}
                  title={p.readable ? `Share ${p.name}` : "This playlist can't be read"}
                  className="tile"
                >
                  <span className="tile__art">
                    <Cover src={p.imageUrl} title={p.name} className="cover" />
                  </span>
                  <span className="tile__name">{busy === p.id ? "Making your link…" : p.name}</span>
                  {p.trackCount !== undefined && <span className="label">{p.trackCount} songs</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
