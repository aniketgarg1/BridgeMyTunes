"use client";
import { useEffect, useMemo, useState } from "react";
import type { MatchResult, Platform, Track, TransferSource, TransferStatus } from "@/lib/types";
import { api } from "./api";
import { serviceName } from "./ConnectButton";
import { Cover, TrackRow } from "./TrackRow";

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
  queued: "waiting to start",
  reading: "reading the songs",
  matching: "matching songs",
  writing: "making the playlist",
  done: "done",
  failed: "stopped",
};

const METHOD_LABEL: Record<MatchResult["method"], string> = {
  cache: "known match",
  isrc: "isrc",
  metadata: "metadata",
  ai: "gemini",
  manual: "you picked",
  none: "no match",
};

const flagText = (f: string) => f.toLowerCase();

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
  const searchId = `search-${r.index}`;

  const decide = async (t: Track | null) => {
    setBusy(true);
    try {
      await onDecide(t);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="review__item">
      <div className="review__flags">
        <span className="pill pill--accent">{r.status === "uncertain" ? "not sure" : "not found"}</span>
        {r.flags.map((f) => (
          <span key={f} className="pill">
            {flagText(f)}
          </span>
        ))}
      </div>
      <TrackRow track={r.source} />
      {r.aiReason && <p className="label">Gemini: {r.aiReason}</p>}

      <fieldset className="choices">
        <legend className="label">
          {results ? "search results" : options.length ? `closest on ${serviceName(destination)}` : `nothing close on ${serviceName(destination)}`}
        </legend>
        {options.map((c, i) => (
          <label key={`${Object.values(c.ids).join()}-${i}`} className="choice">
            <input type="radio" name={`pick-${r.index}`} checked={choice === i} onChange={() => setChoice(i)} className="check" />
            <Cover src={c.artworkUrl} title={c.title} />
            <span className="track__main">
              <span className="track__title">{c.title}</span>
              <span className="track__artist">{c.artists.join(", ")}</span>
            </span>
            <span className="track__time">{"score" in c ? `${Math.round((c as { score: number }).score * 100)}%` : ""}</span>
          </label>
        ))}
      </fieldset>

      <form
        className="review__search"
        onSubmit={async (e) => {
          e.preventDefault();
          const { tracks } = await api<{ tracks: Track[] }>(`/api/search?platform=${destination}&q=${encodeURIComponent(query)}`);
          setResults(tracks);
          setChoice(tracks.length ? 0 : -1);
        }}
      >
        <label htmlFor={searchId} className="visually-hidden">
          Search for a replacement
        </label>
        <input id={searchId} value={query} onChange={(e) => setQuery(e.target.value)} className="field" aria-label="Search for a replacement" />
        <button className="btn">search</button>
      </form>

      <div className="review__actions">
        <button disabled={busy} onClick={() => decide(null)} className="btn btn--quiet">
          skip
        </button>
        <button disabled={busy || choice < 0} onClick={() => decide(options[choice])} className="btn btn--primary">
          {busy ? "adding…" : "add this song"}
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

  if (error) {
    return (
      <p className="notice" role="alert">
        {error}
      </p>
    );
  }
  if (!t) {
    return (
      <p className="label" role="status">
        loading…
      </p>
    );
  }

  const share = t.total ? t.processed / t.total : t.status === "done" ? 1 : 0;
  const running = t.status !== "done" && t.status !== "failed";
  const dest = serviceName(t.destination);
  const added = groups.matched.filter((r) => r.added).length;

  return (
    <div className="transfer">
      <section className="transfer__head">
        <h1 className="title title--content">{t.sourceName ?? "getting ready…"}</h1>
        <p className="sub">
          {t.source.type === "universal" ? "From a shared link" : `From ${serviceName(t.source.platform)}`} to {dest}
        </p>
      </section>

      <section className="panel" aria-label="Progress">
        <div className="library__head">
          <span className="label" role="status">
            {STATUS_LABEL[t.status]}
            {running ? "…" : ""}
          </span>
          <span className="track__time">
            {t.processed} of {t.total || "?"}
          </span>
        </div>
        <div className={`progress${t.status === "failed" ? " progress--failed" : ""}`} role="progressbar" aria-valuenow={Math.round(share * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress__bar" style={{ transform: `scaleX(${share})` }} />
        </div>
        <div className="figures">
          <div>
            <span className="figure">{groups.matched.length}</span>
            <span className="label">matched</span>
          </div>
          <div>
            <span className="figure">{groups.uncertain.length}</span>
            <span className="label">to review</span>
          </div>
          <div>
            <span className="figure">{groups.unavailable.length}</span>
            <span className="label">not on {dest}</span>
          </div>
        </div>
        {t.status === "failed" && (
          <div className="panel__foot">
            <p className="notice" role="alert">
              {t.error}
            </p>
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
              className="btn btn--primary"
            >
              {retrying ? "starting…" : "try again"}
            </button>
          </div>
        )}
        {t.status === "done" && (
          <div className="panel__foot">
            <p>
              {t.mode === "library" ? `Saved ${added} songs to your ${dest} library.` : `Playlist made on ${dest} with ${added} songs.`}
              {t.timings?.totalMs ? <span className="label"> Took {(t.timings.totalMs / 1000).toFixed(1)}s.</span> : null}
            </p>
            {t.destUrl && (
              <a href={t.destUrl} target="_blank" rel="noreferrer" className="btn btn--primary">
                open in {dest}
              </a>
            )}
          </div>
        )}
      </section>

      {t.results.length > 0 && (
        <section className="review">
          <div className="library__head">
            <div className="tabs" role="tablist" aria-label="Results">
              {(
                [
                  ["review", `needs review (${groups.review.length})`],
                  ["matched", `matched (${groups.matched.length})`],
                ] as const
              ).map(([k, label]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className="tab">
                  {label}
                </button>
              ))}
            </div>
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
                className="btn"
              >
                {bulkBusy ? "adding…" : groups.uncertain.length === 1 ? "accept suggestion" : `accept all ${groups.uncertain.length}`}
              </button>
            )}
          </div>

          {tab === "review" ? (
            groups.review.length === 0 ? (
              <p className="empty">{running ? "Songs that need a look will show up here." : "Nothing left to review."}</p>
            ) : t.status !== "done" ? (
              <p className="empty">
                {t.status === "failed"
                  ? "Fix the problem above and try again to review these."
                  : `${groups.review.length} ${groups.review.length === 1 ? "song needs" : "songs need"} a look once matching finishes.`}
              </p>
            ) : (
              <ul className="review" role="list">
                {groups.review.map((r) => (
                  <ReviewItem key={r.index} r={r} destination={t.destination} onDecide={(track) => resolve([{ index: r.index, track }])} />
                ))}
              </ul>
            )
          ) : (
            <div className="tracks">
              {groups.matched.map((r) => (
                <TrackRow
                  key={r.index}
                  track={r.match ?? r.source}
                  index={r.index}
                  side={
                    <span className="track__side">
                      {r.flags.slice(0, 1).map((f) => (
                        <span key={f} className="pill">
                          {flagText(f)}
                        </span>
                      ))}
                      <span className={`pill${r.method === "ai" || r.method === "manual" ? " pill--accent" : ""}`}>{METHOD_LABEL[r.method]}</span>
                    </span>
                  }
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
