"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, useMe, useUrlError } from "@/components/api";
import { ConnectButton, serviceName } from "@/components/ConnectButton";
import { ServiceLogo } from "@/components/ServiceLogo";
import { Cover } from "@/components/TrackRow";
import { parseMusicLink, parseSongLinks } from "@/lib/links";
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
  const songs = parseSongLinks(link);
  const songCount = songs.length;
  const single = parseMusicLink(link.trim());
  // Which app the pasted link is from: its logo lights up under the bar and sits inside the field.
  const detected = new Set<Platform>(songCount > 1 ? songs.map((x) => x.platform) : single ? [single.platform] : []);
  const only = detected.size === 1 ? [...detected][0] : null;
  const inputRef = useRef<HTMLInputElement>(null);
  const [nudge, setNudge] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  // Empty "Make link" points at the field instead of doing nothing.
  const pointAtField = () => {
    inputRef.current?.focus();
    setNudge((n) => n + 1);
  };
  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) setLink(text.trim());
      inputRef.current?.focus();
    } catch {
      // The browser said no (or has no clipboard access): the field is focused, so Cmd+V works.
      pointAtField();
    }
  };

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
              if (!link.trim()) return pointAtField();
              create(songCount > 1 ? { url: link, name: listName } : { url: link.trim() }, "url");
            }}
          >
            <label htmlFor="music-link" className="visually-hidden">
              Paste a link
            </label>
            <div className="paste__bar" data-nudge={nudge ? (nudge % 2 ? "a" : "b") : undefined}>
              <div className="paste__field">
                <span className="paste__icon" aria-hidden="true">
                  {only ? (
                    <ServiceLogo key={only} platform={only} size={22} />
                  ) : (
                    <svg key="link" viewBox="0 0 24 24" width="22" height="22" className="paste__glyph">
                      <path d="M10.6 13.4a1 1 0 0 1 0-1.4l3.5-3.5a1 1 0 1 1 1.4 1.4L12 13.4a1 1 0 0 1-1.4 0zm-3.2 6.4a4.5 4.5 0 0 1-3.2-7.7l2.5-2.5a1 1 0 0 1 1.4 1.4l-2.5 2.5a2.5 2.5 0 0 0 3.5 3.5l2.5-2.5a1 1 0 0 1 1.4 1.4l-2.5 2.5a4.5 4.5 0 0 1-3.1 1.4zm8.4-6.1a1 1 0 0 1-.7-1.7l2.5-2.5a2.5 2.5 0 0 0-3.5-3.5l-2.5 2.5a1 1 0 0 1-1.4-1.4l2.5-2.5a4.5 4.5 0 0 1 6.3 6.3l-2.5 2.5a1 1 0 0 1-.7.3z" />
                    </svg>
                  )}
                </span>
                <input
                  ref={inputRef}
                  id="music-link"
                  name="url"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="Paste a song or playlist link"
                  autoComplete="off"
                  spellCheck={false}
                  className="paste__input"
                />
                {!link && (
                  <button type="button" className="paste__clip" onClick={pasteFromClipboard}>
                    Paste
                  </button>
                )}
              </div>
              <button disabled={busy !== null} className="btn btn--primary paste__go">
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
          <ul className="apps" aria-label="Opens in" role="list" data-detect={detected.size ? "" : undefined}>
            {ALL_PLATFORMS.map((p) => (
              <li key={p} className="apps__item" data-on={detected.has(p) ? "" : undefined}>
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
