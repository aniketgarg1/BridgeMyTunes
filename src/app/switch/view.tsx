"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, useMe, useUrlError } from "@/components/api";
import { ConnectButton, serviceName } from "@/components/ConnectButton";
import { Cover } from "@/components/TrackRow";
import { PLATFORMS, type Platform, type PlaylistSummary } from "@/lib/types";

const LIKED = "__liked__";

export function SwitchView({ initialError }: { initialError: string | null }) {
  const router = useRouter();
  const { me, refresh } = useMe();
  const [error, setError] = useUrlError(initialError);
  const [from, setFrom] = useState<Platform>(PLATFORMS[0]);
  const to: Platform = PLATFORMS.find((p) => p !== from) ?? PLATFORMS[1];
  const [loaded, setLoaded] = useState<{ platform: Platform; list: PlaylistSummary[] } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const fromOk = Boolean(me?.connections[from]);
  const toOk = Boolean(me?.connections[to]);

  useEffect(() => {
    if (!fromOk) return;
    let cancelled = false;
    api<{ playlists: PlaylistSummary[] }>(`/api/library/playlists?platform=${from}`)
      .then((r) => !cancelled && setLoaded({ platform: from, list: r.playlists }))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [from, fromOk, setError]);

  const playlists = loaded?.platform === from ? loaded.list : null;
  const readable = playlists?.filter((p) => p.readable) ?? [];
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const run = async (ids: string[]) => {
    setBusy(true);
    setError(null);
    try {
      const sources = ids.map((id) => (id === LIKED ? { type: "liked", platform: from } : { type: "playlist", platform: from, id }));
      const res = await api<{ ids: string[] }>("/api/transfers", { json: { destination: to, sources } });
      router.push(res.ids.length === 1 ? `/transfers/${res.ids[0]}` : "/transfers");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the transfer");
      setBusy(false);
    }
  };

  return (
    <div className="switch">
      <section className="transfer__head">
        <h1 className="title">move your music</h1>
        <p className="sub">Copy playlists and liked songs from one service to the other. Nothing is removed from where they are now.</p>
      </section>

      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}

      <div className="route">
        {[from, to].map((p, i) => (
          <div key={p} className={`route__end ${i === 0 ? "route__end--from" : "route__end--to"}`}>
            <span className="label">{i === 0 ? "from" : "to"}</span>
            <span className="route__name">{serviceName(p)}</span>
            <ConnectButton platform={p} connected={Boolean(me?.connections[p])} onConnected={refresh} />
          </div>
        ))}
        <button
          onClick={() => {
            setFrom(to);
            setSelected(new Set());
          }}
          aria-label="Swap direction"
          className="btn route__swap"
        >
          swap
        </button>
      </div>

      {fromOk && (
        <section className="panel" aria-labelledby="pick-title">
          <div className="library__head">
            <h2 id="pick-title">choose what to move</h2>
            {playlists && (
              <button
                className="btn btn--quiet"
                onClick={() => setSelected(selected.size === readable.length + 1 ? new Set() : new Set([LIKED, ...readable.map((p) => p.id)]))}
              >
                {selected.size === readable.length + 1 ? "clear" : "select all"}
              </button>
            )}
          </div>
          {!playlists ? (
            <p className="label" role="status">
              loading your library…
            </p>
          ) : (
            <ul className="picker" role="list">
              <li>
                <label className="picker__row">
                  <input type="checkbox" checked={selected.has(LIKED)} onChange={() => toggle(LIKED)} className="check" />
                  <Cover title="liked" />
                  <span className="track__main">
                    <span className="track__title">{from === "apple" ? "Library songs" : "Liked songs"}</span>
                    <span className="track__artist">saved to your {serviceName(to)} library</span>
                  </span>
                </label>
              </li>
              {playlists.map((p) => (
                <li key={p.id}>
                  <label className="picker__row" aria-disabled={!p.readable}>
                    <input type="checkbox" disabled={!p.readable} checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="check" />
                    <Cover src={p.imageUrl} title={p.name} />
                    <span className="track__main">
                      <span className="track__title">{p.name}</span>
                      <span className="track__artist">
                        {p.readable ? (p.trackCount !== undefined ? `${p.trackCount} songs` : "playlist") : "not yours, can't be read"}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="picker__actions">
            <button disabled={!toOk || busy || !playlists} onClick={() => run([LIKED, ...readable.map((p) => p.id)])} className="btn">
              move everything
            </button>
            <button disabled={!toOk || busy || selected.size === 0} onClick={() => run([...selected])} className="btn btn--primary">
              {busy ? "starting…" : selected.size ? `move ${selected.size} selected` : "move selected"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
