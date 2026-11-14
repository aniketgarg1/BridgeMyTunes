import type { Track } from "@/lib/types";

export const fmtDuration = (ms?: number) =>
  ms ? `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}` : "";

export function TrackRow({ track, index, right }: { track: Track; index?: number; right?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3 py-2">
      {index !== undefined && <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted">{index + 1}</span>}
      {track.artworkUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={track.artworkUrl} alt="" className="h-10 w-10 shrink-0 rounded bg-surface-2 object-cover" />
      ) : (
        <div className="h-10 w-10 shrink-0 rounded bg-surface-2" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          {track.title}
          {track.explicit && (
            <span className="ml-1.5 rounded-sm bg-surface-2 px-1 py-px align-middle text-[10px] font-semibold text-muted">E</span>
          )}
        </p>
        <p className="truncate text-xs text-muted">
          {track.artists.join(", ")}
          {track.album ? ` · ${track.album}` : ""}
        </p>
      </div>
      <span className="hidden shrink-0 text-xs tabular-nums text-muted sm:block">{fmtDuration(track.durationMs)}</span>
      {right}
    </div>
  );
}
