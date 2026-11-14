import type { Track } from "@/lib/types";

export const fmtDuration = (ms?: number) =>
  ms ? `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}` : "";

export function Cover({ src, title, className = "thumb" }: { src?: string; title: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (src) return <img src={src} alt="" className={className} />;
  return (
    <div className={`${className} cover--blank`} aria-hidden="true">
      {title.trim().charAt(0)}
    </div>
  );
}

/** One song as a row: number, cover, title over artist, album, length. `side` replaces the length (chips, a score). */
export function TrackRow({ track, index, side }: { track: Track; index?: number; side?: React.ReactNode }) {
  // --i drives the one-time stagger on the shared page; it is capped there so long lists don't wait.
  const style = index !== undefined ? ({ "--i": index } as React.CSSProperties) : undefined;
  return (
    <div className="track" style={style}>
      <span className="track__n">{index !== undefined ? index + 1 : ""}</span>
      <Cover src={track.artworkUrl} title={track.title} />
      <div className="track__main">
        <span className="track__title">
          {track.title}
          {track.explicit && <span className="pill pill--tiny">Explicit</span>}
        </span>
        <span className="track__artist">{track.artists.join(", ")}</span>
      </div>
      <span className="track__album">{track.album ?? ""}</span>
      {side ?? <span className="track__time">{fmtDuration(track.durationMs)}</span>}
    </div>
  );
}
