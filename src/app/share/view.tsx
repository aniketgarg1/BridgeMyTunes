"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, useMe, useUrlError } from "@/components/api";
import { ConnectButton, PlatformDot } from "@/components/ConnectButton";
import { PLATFORM_LABEL, PLATFORMS, type Platform, type PlaylistSummary } from "@/lib/types";

export function ShareView({ initialError }: { initialError: string | null }) {
  const router = useRouter();
  const { me, refresh } = useMe();
  const [error, setError] = useUrlError(initialError);
  const [platform, setPlatform] = useState<Platform>("spotify");
  const [loaded, setLoaded] = useState<{ platform: Platform; list: PlaylistSummary[] } | null>(null);
  const [link, setLink] = useState("");
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
    <div className="mx-auto max-w-xl space-y-12 pt-8">
      <section className="space-y-5 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Share a playlist</h1>
        <p className="text-muted">One link. Opens on Spotify and Apple Music.</p>
        <form
          className="flex items-center gap-2 rounded-full border border-border bg-surface p-1.5 focus-within:border-accent"
          onSubmit={(e) => {
            e.preventDefault();
            if (link.trim()) create({ url: link.trim() }, "url");
          }}
        >
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Paste a playlist link"
            aria-label="Playlist link"
            className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted"
          />
          <button
            disabled={!link.trim() || busy !== null}
            className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-30"
          >
            {busy === "url" ? "…" : "Share"}
          </button>
        </form>
        {error && <p className="text-sm text-bad">{error}</p>}
      </section>

      <section className="space-y-4">
        <div className="flex justify-center">
          <div className="inline-flex rounded-full border border-border bg-surface p-1">
            {PLATFORMS.map((p) => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm ${platform === p ? "bg-surface-2 font-medium" : "text-muted"}`}
              >
                <PlatformDot platform={p} /> {PLATFORM_LABEL[p]}
              </button>
            ))}
          </div>
        </div>

        {!me ? null : !connected ? (
          <div className="flex justify-center py-6">
            <ConnectButton platform={platform} onConnected={refresh} />
          </div>
        ) : !playlists ? (
          <p className="py-6 text-center text-sm text-muted">Loading…</p>
        ) : playlists.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No playlists</p>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {playlists.map((p) => (
              <li key={p.id}>
                <button
                  disabled={!p.readable || busy !== null}
                  onClick={() => create({ platform, playlistId: p.id }, p.id)}
                  title={p.readable ? `Share ${p.name}` : "Spotify only shares playlists you own"}
                  className="group w-full text-left disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt="" className="aspect-square w-full rounded-xl bg-surface-2 object-cover transition group-hover:brightness-110 group-enabled:group-hover:scale-[1.02]" />
                  ) : (
                    <div className="bridge-gradient aspect-square w-full rounded-xl opacity-60 transition group-enabled:group-hover:opacity-80" />
                  )}
                  <p className="mt-2 truncate text-sm">{busy === p.id ? "Creating link…" : p.name}</p>
                  {p.trackCount !== undefined && <p className="text-xs text-muted">{p.trackCount} songs</p>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
