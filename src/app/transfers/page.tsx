"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { PlatformDot } from "@/components/ConnectButton";
import { PLATFORM_LABEL, type Platform, type TransferSource, type TransferStatus } from "@/lib/types";

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
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Your transfers</h1>
      {!list ? (
        <p className="text-muted">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-muted">
          Nothing yet. <Link href="/switch" className="text-accent hover:underline">Start a transfer</Link> or open a universal link.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
          {list.map((t) => {
            const pct = t.total ? Math.round((t.processed / t.total) * 100) : 0;
            return (
              <li key={t.id}>
                <Link href={`/transfers/${t.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-surface-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{t.sourceName ?? "Preparing…"}</p>
                    <p className="flex items-center gap-1.5 text-xs text-muted">
                      {t.source.type === "universal" ? "Universal link" : PLATFORM_LABEL[t.source.platform]} →{" "}
                      <PlatformDot platform={t.destination} /> {PLATFORM_LABEL[t.destination]} · {new Date(t.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs ${t.status === "failed" ? "text-bad" : t.status === "done" ? "text-ok" : "text-muted"}`}>
                    {t.status === "done" ? "Done" : t.status === "failed" ? "Failed" : `${pct}%`}
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
