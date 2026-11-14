"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, useMe, useUrlError } from "@/components/api";
import { ConnectButton, serviceName } from "@/components/ConnectButton";
import { Cover } from "@/components/TrackRow";
import { parseSongLinks } from "@/lib/links";
import { PLATFORMS, type Platform, type PlaylistSummary } from "@/lib/types";

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
      <section className="drop" aria-labelledby="drop-title">
        <h1 id="drop-title">share music with anyone</h1>
        <p className="sub">
          Paste a song, album or playlist from YouTube Music, Apple Music or Spotify. Whoever opens your link plays it on their own app.
        </p>
        <form
          className="drop__form"
          onSubmit={(e) => {
            e.preventDefault();
            if (link.trim()) create(songCount > 1 ? { url: link, name: listName } : { url: link.trim() }, "url");
          }}
        >
          <label htmlFor="music-link" className="visually-hidden">
            Music link
          </label>
          <input
            id="music-link"
            name="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="paste a link"
            autoComplete="off"
            className="field field--lg"
          />
          <button disabled={!link.trim() || busy !== null} className="btn btn--primary btn--lg">
            {busy === "url" ? "making your link…" : "make a link"}
          </button>
        </form>
        {songCount > 1 ? (
          <div className="drop__list">
            <span className="drop__count">{songCount} songs found</span>
            <label htmlFor="list-name" className="visually-hidden">
              Name this list
            </label>
            <input
              id="list-name"
              name="name"
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              placeholder="name it (optional)"
              autoComplete="off"
              className="field"
            />
          </div>
        ) : null}
        {error && (
          <p className="drop__error" role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="library" aria-labelledby="library-title">
        <div className="library__head">
          <h2 id="library-title">or pick one of your playlists</h2>
          <div className="tabs" role="tablist" aria-label="Service">
            {PLATFORMS.map((p) => (
              <button key={p} role="tab" aria-selected={platform === p} onClick={() => setPlatform(p)} className="tab">
                {serviceName(p)}
              </button>
            ))}
          </div>
        </div>

        {!me ? (
          <p className="label" role="status">
            loading…
          </p>
        ) : !connected ? (
          <div className="empty">
            <p>Connect {serviceName(platform)} to see your playlists here.</p>
            <ConnectButton platform={platform} onConnected={refresh} />
          </div>
        ) : !playlists ? (
          <p className="label" role="status">
            loading your playlists…
          </p>
        ) : playlists.length === 0 ? (
          <div className="empty">
            <p>No playlists on {serviceName(platform)} yet. Paste a link above instead.</p>
          </div>
        ) : (
          <ul className="grid" role="list">
            {playlists.map((p) => (
              <li key={p.id}>
                <button
                  disabled={!p.readable || busy !== null}
                  onClick={() => create({ platform, playlistId: p.id }, p.id)}
                  title={p.readable ? `Share ${p.name}` : "This playlist can't be read"}
                  className="tile"
                >
                  <Cover src={p.imageUrl} title={p.name} className="cover" />
                  <span className="tile__name">{busy === p.id ? "making your link…" : p.name}</span>
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
