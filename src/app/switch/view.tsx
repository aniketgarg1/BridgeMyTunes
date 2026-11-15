"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, useMe, useUrlError } from "@/components/api";
import { AppSwitch } from "@/components/AppSwitch";
import { ConnectButton, serviceName } from "@/components/ConnectButton";
import { ServiceLogo } from "@/components/ServiceLogo";
import { Cover } from "@/components/TrackRow";
import { parseCollectionLinks, parseSongLinks } from "@/lib/links";
import type { Platform, PlaylistSummary } from "@/lib/types";

const LIKED = "__liked__";
/** Every app can be either end. Spotify sign-in only works for testers on the developer app's allowlist. */
const APPS: Platform[] = ["youtube", "apple", "spotify"];
/** Where "all your saved songs" end up on each destination, in that app's own words. */
const SAVED_TO: Record<Platform, string> = {
  youtube: "Each song is liked, so it lands in Liked music on YouTube Music",
  apple: "Each song is added to your Apple Music library",
  spotify: "Each song is added to Liked Songs on Spotify",
};

/**
 * The two ends trade places when the route is swapped: each end is measured before React moves it,
 * then animated from its old spot to its new one (FLIP, transform only). Skipped for reduced motion.
 */
function useTradePlaces(order: string) {
  const ends = useRef(new Map<string, HTMLElement>());
  const before = useRef(new Map<string, DOMRect>());
  const first = useRef(true);
  const measure = () => {
    before.current = new Map([...ends.current].map(([k, el]) => [k, el.getBoundingClientRect()]));
  };
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    ends.current.forEach((el, k) => {
      const was = before.current.get(k);
      if (!was) return;
      const now = el.getBoundingClientRect();
      const dx = was.left - now.left;
      const dy = was.top - now.top;
      if (!dx && !dy) return;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
        duration: 460,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      });
    });
  }, [order]);
  const ref = (k: string) => (el: HTMLElement | null) => {
    if (el) ends.current.set(k, el);
    else ends.current.delete(k);
  };
  return { ref, measure };
}

export function SwitchView({ initialError }: { initialError: string | null }) {
  const router = useRouter();
  const { me, refresh } = useMe();
  const [error, setError] = useUrlError(initialError);
  const [route, setRoute] = useState<{ from: Platform; to: Platform }>({ from: "youtube", to: "apple" });
  const { from, to } = route;
  const trade = useTradePlaces(`${from}>${to}`);
  const pickFrom = (p: Platform) => {
    if (p === from) return;
    trade.measure();
    setError(null);
    // Picking the current destination as the source flips the route.
    setRoute({ from: p, to: p === to ? from : to });
    setSelected(new Set());
  };
  const pickTo = (p: Platform) => {
    if (p === to) return;
    trade.measure();
    setError(null);
    setRoute({ from, to: p });
  };
  const [loaded, setLoaded] = useState<{ platform: Platform; list: PlaylistSummary[] } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState(0);

  const fromOk = Boolean(me?.connections[from]);
  // Spotify works without a sign-in: the house account makes a public playlist and links to it.
  const viaHouse = to === "spotify" && !me?.connections.spotify && Boolean(me?.spotifyHouse);
  const toOk = Boolean(me?.connections[to]) || viaHouse;

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
  const allSelected = selected.size === readable.length + 1;
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

  // Not signed in to the source app (Spotify sign-in is invite-only): paste public links instead.
  // Any number of playlist and album links, plus song links (a Spotify desktop copy of Liked Songs) as one list.
  // Each is read the same way a shared link is, then they all move together.
  const [pasted, setPasted] = useState("");
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null);
  const [skipped, setSkipped] = useState<{ url: string; why: string }[]>([]);
  const pastedLists = parseCollectionLinks(pasted).filter((x) => x.link.platform === from);
  const pastedSongs = parseSongLinks(pasted).filter((x) => x.platform === from);
  const pastedCount = pastedLists.length + (pastedSongs.length ? 1 : 0);
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

  const movePasted = async () => {
    if (!pastedCount) return setError(`No ${serviceName(from)} playlist, album or song links in there.`);
    if (!toOk) return setError(`Connect ${serviceName(to)} first.`);
    setBusy(true);
    setError(null);
    setSkipped([]);
    // One job per playlist or album, and one for all the loose songs together.
    const jobs: { url: string; name?: string }[] = pastedLists.map((x) => ({ url: x.url }));
    if (pastedSongs.length) jobs.push({ url: pasted, name: `${from === "apple" ? "Library" : "Liked"} songs from ${serviceName(from)}` });
    const slugs: string[] = [];
    const failed: { url: string; why: string }[] = [];
    let done = 0;
    setReading({ done, total: jobs.length });
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(3, jobs.length) }, async () => {
        while (next < jobs.length) {
          const job = jobs[next++];
          try {
            const { slug } = await api<{ slug: string }>("/api/playlists", { json: job });
            slugs.push(slug);
          } catch (e) {
            failed.push({ url: job.name ?? job.url, why: e instanceof Error ? e.message : "Couldn't read it" });
          }
          setReading({ done: ++done, total: jobs.length });
        }
      }),
    );
    setReading(null);
    try {
      const ids: string[] = [];
      for (let i = 0; i < slugs.length; i += 50) {
        const sources = slugs.slice(i, i + 50).map((slug) => ({ type: "universal", slug }));
        ids.push(...(await api<{ ids: string[] }>("/api/transfers", { json: { destination: to, sources } })).ids);
      }
      if (failed.length) {
        // Stay here so the skipped links can be seen; the rest are already moving.
        setSkipped(failed);
        setBusy(false);
        if (ids.length) setPasted("");
        return;
      }
      router.push(ids.length === 1 ? `/transfers/${ids[0]}` : "/transfers");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the transfer");
      setBusy(false);
    }
  };

  const swap = () => {
    trade.measure();
    setTurns((n) => n + 1);
    setRoute({ from: to, to: from });
    setSelected(new Set());
  };

  return (
    <div className="switch">
      <section className="move-head">
        <h1 className="move-title">Move your music</h1>
        <p className="sub">Copy playlists and liked songs from one app to the other. Nothing is removed from where it is now.</p>
      </section>

      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}

      <section className="route" aria-label="Route">
        {[from, to].map((p, i) => (
          <div key={p} ref={trade.ref(p)} className={`route__end ${i === 0 ? "route__end--from" : "route__end--to"}`}>
            <span className="route__label">{i === 0 ? "From" : "To"}</span>
            <span className="route__name">
              <ServiceLogo platform={p} size={48} />
              <span>{serviceName(p)}</span>
            </span>
            <AppSwitch
              options={i === 0 ? APPS : APPS.filter((a) => a !== from)}
              value={p}
              onChange={i === 0 ? pickFrom : pickTo}
              label={i === 0 ? "Move from" : "Move to"}
              disabled={busy}
            />
            {me ? (
              i === 1 && viaHouse ? (
                <span className="label route__note">No sign-in needed. You get a public Spotify playlist link.</span>
              ) : (
                <ConnectButton
                  platform={p}
                  connected={Boolean(me.connections[p])}
                  onConnected={refresh}
                  label={p === "spotify" ? "Connect Spotify (testers)" : undefined}
                />
              )
            ) : (
              <span className="route__wait label">Checking…</span>
            )}
          </div>
        ))}
        <button type="button" onClick={swap} aria-label={`Swap: move from ${serviceName(to)} to ${serviceName(from)}`} className="btn route__swap">
          <span className="route__arrows" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" style={{ transform: `rotate(${turns * 180}deg)` }}>
              <path d="M16 3l5 5-5 5-1.4-1.4L17.2 9H4V7h13.2l-2.6-2.6zM8 11l1.4 1.4L6.8 15H20v2H6.8l2.6 2.6L8 21l-5-5z" />
            </svg>
          </span>
          <span>Swap</span>
        </button>
      </section>

      {me && !fromOk && (
        <section className="pick" aria-labelledby="paste-title">
          <h2 id="paste-title">Paste {serviceName(from)} links</h2>
          <form
            className="move-paste"
            onSubmit={(e) => {
              e.preventDefault();
              movePasted();
            }}
          >
            <label htmlFor="move-link" className="visually-hidden">
              {serviceName(from)} playlist, album or song links
            </label>
            <textarea
              id="move-link"
              value={pasted}
              onChange={(e) => {
                setPasted(e.target.value);
                if (error) setError(null);
              }}
              placeholder={`One or more ${serviceName(from)} playlist links`}
              autoComplete="off"
              spellCheck={false}
              rows={4}
              className="field move-paste__box"
            />
            <div className="move-paste__foot">
              <span className="label" aria-live="polite">
                {reading
                  ? `Reading ${reading.done} of ${reading.total}…`
                  : pastedCount
                    ? [pastedLists.length ? plural(pastedLists.length, "playlist") : "", pastedSongs.length ? plural(pastedSongs.length, "song") : ""]
                        .filter(Boolean)
                        .join(" and ")
                    : from === "spotify"
                      ? "Public playlists, up to 100 songs each. For liked songs, select them all in the Spotify app, copy and paste here."
                      : "Public playlists only."}
              </span>
              <button disabled={busy || !pastedCount} className="btn btn--primary btn--lg">
                <ServiceLogo platform={to} size={20} />
                {busy ? "Starting…" : `Move to ${serviceName(to)}`}
              </button>
            </div>
          </form>
          {skipped.length > 0 && (
            <div className="notice notice--quiet" role="status">
              <p>
                The rest are moving (<Link href="/transfers">see transfers</Link>). These were skipped:
              </p>
              <ul className="move-paste__skipped">
                {skipped.map((x) => (
                  <li key={x.url}>
                    <span className="move-paste__url">{x.url}</span> {x.why}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {fromOk && (
        <section className="pick" aria-labelledby="pick-title">
          <div className="pick__head">
            <h2 id="pick-title">Choose what to move</h2>
            {playlists && (
              <button
                type="button"
                className="btn btn--quiet"
                onClick={() => setSelected(allSelected ? new Set() : new Set([LIKED, ...readable.map((p) => p.id)]))}
              >
                {allSelected ? "Clear" : "Select all"}
              </button>
            )}
          </div>
          {!playlists ? (
            <p className="label" role="status">
              Loading your library…
            </p>
          ) : (
            <ul className="picker rows" role="list">
              <li>
                <label className="picker__row">
                  <input type="checkbox" checked={selected.has(LIKED)} onChange={() => toggle(LIKED)} className="check" />
                  <span className="thumb thumb--icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="20" height="20">
                      <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.1 0 3.6 1.2 4.2 2.4h2c.6-1.2 2.1-2.4 4.2-2.4 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z" />
                    </svg>
                  </span>
                  <span className="track__main">
                    <span className="track__title">{from === "apple" ? "All library songs" : "All liked songs"}</span>
                    <span className="track__artist">{viaHouse ? "They become one public Spotify playlist" : SAVED_TO[to]}</span>
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
                        {p.readable ? (p.trackCount !== undefined ? `${p.trackCount} songs` : "Playlist") : "Not yours, can't be read"}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="picker__actions">
            <button
              type="button"
              disabled={!toOk || busy || selected.size === 0}
              onClick={() => run([...selected])}
              className="btn btn--primary btn--lg"
            >
              {busy ? "Starting…" : selected.size ? `Move ${selected.size} to ${serviceName(to)}` : "Move selected"}
            </button>
            <button type="button" disabled={!toOk || busy || !playlists} onClick={() => run([LIKED, ...readable.map((p) => p.id)])} className="btn btn--quiet">
              Move everything
            </button>
            {!toOk && me && <span className="label">Connect {serviceName(to)} first.</span>}
          </div>
        </section>
      )}
    </div>
  );
}
