"use client";
import { useEffect, useMemo, useState } from "react";
import type { MatchResult, Platform, Track, TransferSource, TransferStatus } from "@/lib/types";
import { api } from "./api";
import { serviceName } from "./ConnectButton";
import { ServiceLogo } from "./ServiceLogo";
import { Cover, TrackRow } from "./TrackRow";

export interface TransferData {
  id: string;
  source: TransferSource;
  sourceName?: string;
  destination: Platform;
  mode: "playlist" | "library";
  via?: "user" | "house";
  status: TransferStatus;
  error?: string;
  total: number;
  processed: number;
  results: MatchResult[];
  destUrl?: string;
  timings?: Record<string, number>;
}

const STATUS_LABEL: Record<TransferStatus, string> = {
  queued: "Waiting to start",
  reading: "Reading the songs",
  matching: "Matching songs",
  writing: "Making the playlist",
  done: "Done",
  failed: "Stopped",
};

const METHOD_LABEL: Record<MatchResult["method"], string> = {
  cache: "Known match",
  isrc: "ISRC",
  metadata: "Metadata",
  ai: "Gemini",
  manual: "You picked",
  none: "No match",
};

/** Flags already arrive in sentence case ("Unofficial upload"); only the first letter is made sure of. */
const flagText = (f: string) => f.charAt(0).toUpperCase() + f.slice(1);

/** A figure that swaps in place when its value changes (remounted by key, opacity and transform only). */
function Figure({ value, label, big = false }: { value: number; label: string; big?: boolean }) {
  return (
    <div className={`stat${big ? " stat--big" : ""}`}>
      <span className="stat__n" aria-hidden="true">
        <span key={value} className="stat__v">
          {value}
        </span>
      </span>
      <span className="stat__label">
        <span className="visually-hidden">{value} </span>
        {label}
      </span>
    </div>
  );
}

function ReviewItem({
  r,
  destination,
  onDecide,
}: {
  r: MatchResult;
  destination: Platform;
  onDecide: (track: Track | null, replacement?: boolean) => Promise<void>;
}) {
  // Only preselect a suggestion when it's plausibly right; for "not found" make the user choose.
  const [choice, setChoice] = useState<number>(r.status === "uncertain" && r.candidates.length ? 0 : -1);
  const [query, setQuery] = useState(`${r.source.title} ${r.source.artists[0] ?? ""}`);
  const [results, setResults] = useState<Track[] | null>(null);
  const [busy, setBusy] = useState(false);
  const options = results ?? r.candidates;
  const searchId = `search-${r.index}`;

  const decide = async (t: Track | null, replacement = false) => {
    setBusy(true);
    try {
      await onDecide(t, replacement);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="review__item">
      <div className="review__source">
        <div className="review__flags">
          <span className="pill pill--accent">{r.status === "uncertain" ? "Not sure" : "Not found"}</span>
          {r.flags.map((f) => (
            <span key={f} className="pill">
              {flagText(f)}
            </span>
          ))}
        </div>
        <TrackRow track={r.source} />
        {r.aiReason && <p className="label">Gemini: {r.aiReason}</p>}
      </div>

      <div className="review__pick">
        {r.status === "unavailable" && r.replacements?.length ? (
          <div className="replace">
            <p className="label">Not on {serviceName(destination)}. Gemini suggests a similar song instead:</p>
            <ul className="replace__list">
              {r.replacements.map((x) => (
                <li key={x.ids[destination] ?? x.title} className="replace__row">
                  <Cover src={x.artworkUrl} title={x.title} />
                  <span className="track__main">
                    <span className="track__title">{x.title}</span>
                    <span className="track__artist">{x.artists.join(", ")}</span>
                    <span className="replace__why">{x.why}</span>
                  </span>
                  <button type="button" disabled={busy} onClick={() => decide(x, true)} className="btn">
                    Add instead
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <fieldset className="choices">
          <legend className="label">
            {results ? "Search results" : options.length ? `Closest on ${serviceName(destination)}` : `Nothing close on ${serviceName(destination)}`}
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
          <button className="btn">Search</button>
        </form>

        <div className="review__actions">
          <button disabled={busy || choice < 0} onClick={() => decide(options[choice])} className="btn btn--primary">
            {busy ? "Adding…" : "Add this song"}
          </button>
          <button disabled={busy} onClick={() => decide(null)} className="btn btn--quiet">
            Skip
          </button>
        </div>
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

  const resolve = async (decisions: { index: number; track: Track | null; replacement?: boolean }[]) => {
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
        Loading…
      </p>
    );
  }

  const share = t.total ? t.processed / t.total : t.status === "done" ? 1 : 0;
  const running = t.status !== "done" && t.status !== "failed";
  const dest = serviceName(t.destination);
  const added = groups.matched.filter((r) => r.added).length;

  return (
    <div className="transfer">
      <section className="move-head">
        <h1 className="move-title move-title--content">{t.sourceName ?? "Getting ready…"}</h1>
        <p className="sub route-line">
          <span>{t.source.type === "universal" ? "From a shared link" : `From ${serviceName(t.source.platform)}`} to</span>
          <span className="dest">
            <ServiceLogo platform={t.destination} size={20} />
            {dest}
          </span>
        </p>
      </section>

      <section className="run" aria-label="Progress">
        <div className="figures">
          <Figure value={groups.matched.length} label="Matched" big />
          <Figure value={groups.uncertain.length} label="To review" />
          <Figure value={groups.unavailable.length} label={`Not on ${dest}`} />
        </div>
        <div className="run__meter">
          <div className="run__status">
            <span role="status">
              {STATUS_LABEL[t.status]}
              {running ? "…" : ""}
            </span>
            <span className="run__count">
              {t.processed} of {t.total || "?"}
            </span>
          </div>
          <div
            className={`progress${t.status === "failed" ? " progress--failed" : ""}${running && !t.total ? " progress--waiting" : ""}`}
            role="progressbar"
            aria-label="Songs processed"
            aria-valuenow={Math.round(share * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="progress__bar" style={{ transform: `scaleX(${share})` }} />
          </div>
        </div>
        {t.status === "failed" && (
          <div className="run__foot">
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
              className="btn btn--primary btn--lg"
            >
              {retrying ? "Starting…" : "Try again"}
            </button>
          </div>
        )}
        {t.status === "done" && (
          <div className="run__foot">
            <p>
              {t.via === "house"
                ? `Your Spotify playlist is ready with ${added} songs. Open it and tap the plus to save it to your library.`
                : t.mode === "library"
                  ? `Saved ${added} songs to your ${dest} library.`
                  : `Playlist made on ${dest} with ${added} songs.`}
              {t.timings?.totalMs ? <span className="label"> Took {(t.timings.totalMs / 1000).toFixed(1)}s.</span> : null}
            </p>
            {t.destUrl && (
              <a href={t.destUrl} target="_blank" rel="noreferrer" className="btn btn--primary btn--lg">
                <ServiceLogo platform={t.destination} size={20} />
                Open in {dest}
              </a>
            )}
          </div>
        )}
      </section>

      {t.results.length > 0 && (
        <section className="results">
          <div className="results__head">
            <div className="tabs" role="tablist" aria-label="Results">
              {(
                [
                  ["review", `Needs review (${groups.review.length})`],
                  ["matched", `Matched (${groups.matched.length})`],
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
                {bulkBusy ? "Adding…" : groups.uncertain.length === 1 ? "Accept suggestion" : `Accept all ${groups.uncertain.length}`}
              </button>
            )}
          </div>

          {tab === "review" ? (
            groups.review.length === 0 ? (
              <p className="results__empty">{running ? "Songs that need a look will show up here." : "Nothing left to review."}</p>
            ) : t.status !== "done" ? (
              <p className="results__empty">
                {t.status === "failed"
                  ? "Fix the problem above and try again to review these."
                  : `${groups.review.length} ${groups.review.length === 1 ? "song needs" : "songs need"} a look once matching finishes.`}
              </p>
            ) : (
              <ul className="review rows" role="list">
                {groups.review.map((r) => (
                  <ReviewItem key={r.index} r={r} destination={t.destination} onDecide={(track, replacement) => resolve([{ index: r.index, track, replacement }])} />
                ))}
              </ul>
            )
          ) : (
            <div className="tracks rows">
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
