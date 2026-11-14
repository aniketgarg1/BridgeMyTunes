"use client";
import { useCallback, useEffect, useState } from "react";
import type { Platform } from "@/lib/types";

export class ApiError extends Error {
  constructor(message: string, public needsConnect?: Platform) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(path, {
    ...init,
    method: init?.method ?? (init?.json !== undefined ? "POST" : "GET"),
    headers: init?.json !== undefined ? { "Content-Type": "application/json" } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, data.needsConnect);
  return data as T;
}

export interface Me {
  mock: boolean;
  connections: Partial<Record<Platform, { displayName?: string; storefront?: string }>>;
}

export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  const refresh = useCallback(() => api<Me>("/api/me").then(setMe).catch(() => setMe({ mock: false, connections: {} })), []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { me, refresh };
}

/** Error passed via ?error= by the OAuth callback; the page reads it server-side and passes it in. */
export function useUrlError(initial: string | null = null) {
  const [error, setError] = useState<string | null>(initial);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("error")) {
      url.searchParams.delete("error");
      window.history.replaceState(null, "", url);
    }
  }, []);
  return [error, setError] as const;
}
