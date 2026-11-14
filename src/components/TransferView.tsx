"use client";
import { useEffect, useMemo, useState } from "react";
import type { MatchResult, Platform, Track, TransferSource, TransferStatus } from "@/lib/types";
import { PLATFORM_BUTTON, PLATFORM_LABEL } from "@/lib/types";
import { api } from "./api";
import { PlatformDot } from "./ConnectButton";
import { TrackRow } from "./TrackRow";

export interface TransferData {
  id: string;
  source: TransferSource;
  sourceName?: string;
  destination: Platform;
  mode: "playlist" | "library";
  status: TransferStatus;
  error?: string;
  total: number;
  processed: number;
  results: MatchResult[];
  destUrl?: string;
  timings?: Record<string, number>;
}

const STATUS_LABEL: Record<TransferStatus, string> = {
  queued: "Queued",
  reading: "Reading your playlist",
  matching: "Matching songs",
  writing: "Creating the playlist",
  done: "Done",
  failed: "Failed",
};

const METHOD_LABEL: Record<MatchResult["method"], string> = {
  cache: "Known match",
  isrc: "ISRC",
  metadata: "Metadata",
  ai: "Gemini",
  manual: "You picked",
  none: "No match",
};

const Chip = ({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "warn" | "ok" | "accent" }) => {
  const cls = {
    muted: "border-border text-muted",
    warn: "border-warn/40 text-warn",
    ok: "border-ok/40 text-ok",
    accent: "border-accent/40 text-accent",
  }[tone];
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] ${cls}`}>{children}</span>;
};

function ReviewItem({
  r,
  destination,
  onDecide,
}: {
  r: MatchResult;
  destination: Platform;
  onDecide: (track: Track | null) => Promise<void>;
}) {
  // Only preselect a suggestion when it's plausibly right; for "not found" make the user choose.
  const [choice, setChoice] = useState<number>(r.status === "uncertain" && r.candidates.length ? 0 : -1);
  const [query, setQuery] = useState(`${r.source.title} ${r.source.artists[0] ?? ""}`);
  const [results, setResults] = useState<Track[] | null>(null);
  const [busy, setBusy] = useState(false);
  const options = results ?? r.candidates;

  const decide = async (t: Track | null) => {
    setBusy(true);
    try {
      await onDecide(t);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={r.status === "uncertain" ? "warn" : "muted"}>{r.status === "uncertain" ? "Not sure" : "Not found"}</Chip>
        {r.flags.map((f) => (
          <Chip key={f} tone="warn">
            {f}
          </Chip>
        ))}
      </div>
      <TrackRow track={r.source} />
      {r.aiReason && <p className="mb-2 text-xs text-muted">Gemini: {r.aiReason}</p>}

      <div className="mt-1 rounded-lg border border-border bg-background p-2">
        <p className="px-1 pb-1 text-xs text-muted">
          {results ? "Search results" : options.length ? `Closest on ${PLATFORM_LABEL[destination]}` : `Nothing close on ${PLATFORM_LABEL[destination]}`}
        </p>
        <ul>
          {options.map((c, i) => (
            <li key={`${Object.values(c.ids).join()}-${i}`}>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 hover:bg-surface">
                <input type="radio" name={`pick-${r.index}`} checked={choice === i} onChange={() => setChoice(i)} className="accent-[var(--accent)]" />
                <div className="min-w-0 flex-1">
                  <TrackRow
                    track={c}
                    right={"score" in c ? <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted">{Math.round((c as { score: number }).score * 100)}%</span> : null}
                  />
                </div>
              </label>
            </li>
          ))}
        </ul>
        <form
          className="mt-2 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const { tracks } = await api<{ tracks: Track[] }>(`/api/search?platform=${destination}&q=${encodeURIComponent(query)}`);
            setResults(tracks);
            setChoice(tracks.length ? 0 : -1);
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1 rounded-full border border-border bg-surface px-3 py-1.5 text-xs outline-none focus:border-accent"
            aria-label="Search for a replacement"
          />
          <button className="rounded-full border border-border px-3 py-1.5 text-xs">Search</button>
        </form>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button disabled={busy} onClick={() => decide(null)} className="rounded-full px-3.5 py-1.5 text-xs text-muted hover:text-foreground">
          Skip
        </button>
        <button
          disabled={busy || choice < 0}
          onClick={() => decide(options[choice])}
          className="rounded-full bg-foreground px-3.5 py-1.5 text-xs font-medium text-background disabled:opacity-40"
        >
          {busy ? "Adding…" : "Add this song"}
        </button>
      </div>
    </li>
  );
}

export function TransferView({ id }: { id: string }) {
  const [t, setT] = useState<TransferData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"review" | "matched">("review");
  const [bulkBusy, setBulkBusy] = useState(false);
  // Bumped by "Try again" to restart polling.
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const poll = async () => {
      try {
        const data = await api<TransferData>(`/api/transfers/${id}`);
        if (stopped) return;
        setT(data);
        if (data.status !== "done" && data.status !== "failed") timer = setTimeout(poll, 700);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load transfer");
      }
    };
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id, attempt]);

  const groups = useMemo(() => {
    const rs = t?.results ?? [];
    return {
      matched: rs.filter((r) => r.status === "matched"),
      review: rs.filter((r) => r.status !== "matched" && !r.skipped && !r.added),
      uncertain: rs.filter((r) => r.status === "uncertain" && !r.skipped && !r.added),
      unavailable: rs.filter((r) => r.status === "unavailable"),
    };
  }, [t]);

  const resolve = async (decisions: { index: number; track: Track | null }[]) => {
    const { results } = await api<{ results: MatchResult[] }>(`/api/transfers/${id}/resolve`, { json: { decisions } });
    setT((prev) => (prev ? { ...prev, results } : prev));
  };

  if (error) return <p className="py-20 text-center text-bad">{error}</p>;
  if (!t) return <p className="py-20 text-center text-muted">Loading…</p>;

  const pct = t.total ? Math.round((t.processed / t.total) * 100) : t.status === "done" ? 100 : 0;
  const running = t.status !== "done" && t.status !== "failed";
  const dest = PLATFORM_LABEL[t.destination];

  return (
    <div className="space-y-8">
      <section>
        <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted">
          {t.source.type !== "universal" && <PlatformDot platform={t.source.platform} />}
          {t.source.type === "universal" ? "Universal link" : PLATFORM_LABEL[t.source.platform]} → <PlatformDot platform={t.destination} /> {dest}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t.sourceName ?? "Preparing transfer…"}</h1>

        <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-baseline justify-between text-sm">
            <span className={t.status === "failed" ? "text-bad" : ""}>{STATUS_LABEL[t.status]}{running ? "…" : ""}</span>
            <span className="tabular-nums text-muted">
              {t.processed}/{t.total || "?"}
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className={`progress-bar h-full rounded-full ${t.status === "failed" ? "bg-bad" : "bridge-gradient"}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            {[
              ["Matched", groups.matched.length, "text-ok"],
              ["To review", groups.uncertain.length, "text-warn"],
              ["Not on " + dest, groups.unavailable.length, "text-muted"],
            ].map(([label, n, cls]) => (
              <div key={label as string} className="rounded-lg bg-background px-2 py-3">
                <p className={`text-2xl font-semibold tabular-nums ${cls}`}>{n}</p>
                <p className="text-xs text-muted">{label}</p>
              </div>
            ))}
          </div>
          {t.status === "failed" && (
            <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-bad">{t.error}</p>
              <button
                disabled={retrying}
                onClick={async () => {
                  setRetrying(true);
                  try {
                    await api(`/api/transfers/${id}/retry`, { method: "POST" });
                    setAttempt((a) => a + 1);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Couldn't retry");
                  } finally {
                    setRetrying(false);
                  }
                }}
                className="shrink-0 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
              >
                {retrying ? "Starting…" : "Try again"}
              </button>
            </div>
          )}
          {t.status === "done" && (
            <div className="mt-5 flex flex-col items-start justify-between gap-3 border-t border-border pt-4 sm:flex-row sm:items-center">
              <p className="text-sm">
                {t.mode === "library"
                  ? `Saved ${groups.matched.filter((r) => r.added).length} songs to your ${dest} library.`
                  : `Playlist created on ${dest} with ${groups.matched.filter((r) => r.added).length} songs.`}
                {t.timings?.totalMs ? <span className="text-muted"> Took {(t.timings.totalMs / 1000).toFixed(1)}s.</span> : null}
              </p>
              {t.destUrl && (
                <a href={t.destUrl} target="_blank" rel="noreferrer" className={`rounded-full px-4 py-2 text-sm font-medium ${PLATFORM_BUTTON[t.destination]}`}>
                  Open in {dest}
                </a>
              )}
            </div>
          )}
        </div>
      </section>

      {t.results.length > 0 && (
        <section>
          <div className="mb-4 flex items-center gap-1 border-b border-border">
            {(
              [
                ["review", `Needs review (${groups.review.length})`],
                ["matched", `Matched (${groups.matched.length})`],
              ] as const
            ).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-sm ${tab === k ? "border-b-2 border-foreground font-medium" : "text-muted"}`}>
                {label}
              </button>
            ))}
            {tab === "review" && t.status === "done" && groups.uncertain.length > 0 && (
              <button
                disabled={bulkBusy}
                onClick={async () => {
                  setBulkBusy(true);
                  try {
                    await resolve(groups.uncertain.filter((r) => r.match).map((r) => ({ index: r.index, track: r.match! })));
                  } finally {
                    setBulkBusy(false);
                  }
                }}
                className="ml-auto rounded-full border border-border px-3 py-1 text-xs hover:bg-surface disabled:opacity-50"
              >
                {bulkBusy ? "Adding…" : groups.uncertain.length === 1 ? "Accept suggestion" : `Accept all ${groups.uncertain.length} suggestions`}
              </button>
            )}
          </div>

          {tab === "review" ? (
            groups.review.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">{running ? "Songs that need a look will show up here." : "Nothing left to review."}</p>
            ) : t.status !== "done" ? (
              <p className="py-10 text-center text-sm text-muted">
                {t.status === "failed"
                  ? "Fix the problem above and try again to review these."
                  : `${groups.review.length} ${groups.review.length === 1 ? "song needs" : "songs need"} a look once matching finishes.`}
              </p>
            ) : (
              <ul className="space-y-3">
                {groups.review.map((r) => (
                  <ReviewItem key={r.index} r={r} destination={t.destination} onDecide={(track) => resolve([{ index: r.index, track }])} />
                ))}
              </ul>
            )
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border bg-surface px-4">
              {groups.matched.map((r) => (
                <li key={r.index} className="py-1">
                  <TrackRow
                    track={r.match ?? r.source}
                    index={r.index}
                    right={
                      <span className="flex shrink-0 flex-wrap justify-end gap-1">
                        {r.flags.slice(0, 2).map((f) => (
                          <Chip key={f} tone="warn">
                            {f}
                          </Chip>
                        ))}
                        <Chip tone={r.method === "ai" ? "accent" : r.method === "manual" ? "ok" : "muted"}>{METHOD_LABEL[r.method]}</Chip>
                      </span>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
