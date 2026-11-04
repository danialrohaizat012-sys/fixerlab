"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { DbState, Staff } from "./types";
import { createSeed, DB_VERSION } from "./seed";
import { ServiceError } from "./services";
import { uid } from "./format";

const KEY = "fixerlab-demo-db";

export type Toast = { id: string; kind: "success" | "error" | "info"; message: string };
export type RunResult<T> = { ok: true; value: T } | { ok: false; error: string };

interface StoreCtx {
  db: DbState;
  me: Staff;
  run: <T>(fn: (draft: DbState) => T, success?: string | ((v: T) => string)) => RunResult<T>;
  reset: () => void;
  toast: (message: string, kind?: Toast["kind"]) => void;
  toasts: Toast[];
  dismiss: (id: string) => void;
}

const Ctx = createContext<StoreCtx | null>(null);

function load(): DbState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DbState;
      if (parsed.version === DB_VERSION) return parsed;
    }
  } catch {
    /* storage unavailable or corrupt — fall back to a fresh seed */
  }
  return createSeed();
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DbState | null>(null);
  const ref = useRef<DbState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, kind: Toast["kind"] = "success") => {
    const id = uid("t_");
    setToasts((t) => [...t.slice(-3), { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 6000 : 3500);
  }, []);
  const dismiss = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const persist = useCallback(
    (next: DbState) => {
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        toast("Browser storage is full or unavailable — changes will be lost on reload. Try removing photos or resetting the demo.", "error");
      }
    },
    [toast],
  );

  useEffect(() => {
    const initial = load();
    ref.current = initial;
    setDb(initial);
    persist(initial);
    // Keep multiple tabs (e.g. cashier + technician) in sync.
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY && e.newValue) {
        try {
          const next = JSON.parse(e.newValue) as DbState;
          ref.current = next;
          setDb(next);
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [persist]);

  const run = useCallback(
    <T,>(fn: (draft: DbState) => T, success?: string | ((v: T) => string)): RunResult<T> => {
      if (!ref.current) return { ok: false, error: "Not ready" };
      const draft = structuredClone(ref.current);
      try {
        const value = fn(draft);
        ref.current = draft;
        setDb(draft);
        persist(draft);
        if (success) toast(typeof success === "function" ? success(value) : success, "success");
        return { ok: true, value };
      } catch (e) {
        const msg = e instanceof ServiceError ? e.message : `Unexpected error: ${(e as Error).message}`;
        toast(msg, "error");
        return { ok: false, error: msg };
      }
    },
    [persist, toast],
  );

  const reset = useCallback(() => {
    const fresh = createSeed();
    ref.current = fresh;
    setDb(fresh);
    persist(fresh);
    toast("Demo data reset to the original sample set.", "info");
  }, [persist, toast]);

  const value = useMemo<StoreCtx | null>(() => {
    if (!db) return null;
    const me = db.staff.find((s) => s.id === db.currentUserId) ?? db.staff[0];
    return { db, me, run, reset, toast, toasts, dismiss };
  }, [db, run, reset, toast, toasts, dismiss]);

  if (!value) {
    return (
      <div className="grid min-h-screen place-items-center text-ink-3">
        <div className="flex items-center gap-3 text-sm">
          <span className="size-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          Loading Fixerlab…
        </div>
      </div>
    );
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStore outside provider");
  return c;
}
