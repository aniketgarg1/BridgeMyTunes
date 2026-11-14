"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, useMe, useUrlError } from "@/components/api";
import { ConnectButton, PlatformDot } from "@/components/ConnectButton";
import { PLATFORM_LABEL, PLATFORMS, type Platform, type PlaylistSummary } from "@/lib/types";

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
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Switch platforms</h1>
      </div>

      {error && <p className="rounded-lg border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">{error}</p>}

      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-3">
        {[from, to].map((p, i) => (
          <div key={p} className={`flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 ${i === 1 ? "col-start-3" : ""}`}>
            <p className="text-xs uppercase tracking-wider text-muted">{i === 0 ? "From" : "To"}</p>
            <p className="flex items-center gap-2 font-medium">
              <PlatformDot platform={p} /> {PLATFORM_LABEL[p]}
            </p>
            <ConnectButton platform={p} connected={Boolean(me?.connections[p])} onConnected={refresh} className="w-full" />
          </div>
        ))}
        <button
          onClick={() => {
            setFrom(to);
            setSelected(new Set());
          }}
          aria-label="Swap direction"
          className="col-start-2 row-start-1 self-center rounded-full border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-2"
        >
          ⇄
        </button>
      </div>

      {fromOk && (
        <div className="rounded-2xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-medium">Choose what to move</p>
            {playlists && (
              <button
                className="text-xs text-muted hover:text-foreground"
                onClick={() => setSelected(selected.size === readable.length + 1 ? new Set() : new Set([LIKED, ...readable.map((p) => p.id)]))}
              >
                {selected.size === readable.length + 1 ? "Clear" : "Select all"}
              </button>
            )}
          </div>
          {!playlists ? (
            <p className="px-4 py-8 text-center text-sm text-muted">Loading your library…</p>
          ) : (
            <ul className="max-h-[420px] divide-y divide-border overflow-y-auto">
              <li>
                <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-surface-2">
                  <input type="checkbox" checked={selected.has(LIKED)} onChange={() => toggle(LIKED)} className="accent-[var(--accent)]" />
                  <div className="bridge-gradient h-10 w-10 rounded" />
                  <div>
                    <p className="text-sm">{from === "apple" ? "Library songs" : "Liked songs"}</p>
                  </div>
                </label>
              </li>
              {playlists.map((p) => (
                <li key={p.id}>
                  <label className={`flex items-center gap-3 px-4 py-3 ${p.readable ? "cursor-pointer hover:bg-surface-2" : "opacity-50"}`}>
                    <input type="checkbox" disabled={!p.readable} checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="accent-[var(--accent)]" />
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt="" className="h-10 w-10 rounded bg-surface-2 object-cover" />
                    ) : (
                      <div className="h-10 w-10 rounded bg-surface-2" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm">{p.name}</p>
                      <p className="truncate text-xs text-muted">
                        {p.readable ? (p.trackCount !== undefined ? `${p.trackCount} songs` : "") : "Not yours, can't be read"}
                      </p>
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col gap-2 border-t border-border p-4 sm:flex-row sm:justify-end">
            <button
              disabled={!toOk || busy || !playlists}
              onClick={() => run([LIKED, ...readable.map((p) => p.id)])}
              className="rounded-full border border-border px-5 py-2.5 text-sm font-medium hover:bg-surface-2 disabled:opacity-40"
            >
              Transfer everything
            </button>
            <button
              disabled={!toOk || busy || selected.size === 0}
              onClick={() => run([...selected])}
              className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background disabled:opacity-40"
            >
              {busy ? "Starting…" : `Transfer ${selected.size || ""} selected`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
