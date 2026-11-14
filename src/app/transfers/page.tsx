"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { serviceName } from "@/components/ConnectButton";
import type { Platform, TransferSource, TransferStatus } from "@/lib/types";

interface Summary {
  id: string;
  sourceName?: string;
  source: TransferSource;
  destination: Platform;
  status: TransferStatus;
  total: number;
  processed: number;
  createdAt: string;
}

export default function TransfersPage() {
  const [list, setList] = useState<Summary[] | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const { transfers } = await api<{ transfers: Summary[] }>("/api/transfers").catch(() => ({ transfers: [] as Summary[] }));
      setList(transfers);
      if (transfers.some((t) => t.status !== "done" && t.status !== "failed")) timer = setTimeout(poll, 1000);
    };
    poll();
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="transfer">
      <h1 className="title">your transfers</h1>
      {!list ? (
        <p className="label" role="status">
          loading…
        </p>
      ) : list.length === 0 ? (
        <div className="empty">
          <p>Nothing moved yet. Open a shared link and add it to your app, or move your own playlists.</p>
          <Link href="/switch" className="btn btn--primary">
            move your music
          </Link>
        </div>
      ) : (
        <ul className="list" role="list">
          {list.map((t) => {
            const pct = t.total ? Math.round((t.processed / t.total) * 100) : 0;
            const from = t.source.type === "universal" ? "a shared link" : serviceName(t.source.platform);
            return (
              <li key={t.id}>
                <Link href={`/transfers/${t.id}`} className="list__row">
                  <span className="track__main">
                    <span className="list__name">{t.sourceName ?? "getting ready…"}</span>
                    <span className="track__artist">
                      from {from} to {serviceName(t.destination)}, {new Date(t.createdAt).toLocaleString()}
                    </span>
                  </span>
                  <span className={`pill${t.status === "done" ? " pill--accent" : ""}`}>
                    {t.status === "done" ? "done" : t.status === "failed" ? "stopped" : `${pct}%`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
