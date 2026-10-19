"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { produce, type Draft } from "immer";
import type { DB } from "@/types";
import { buildDemoDB } from "@/mock-data";

/**
 * Local demo "database". All UI reads go through hooks on this store and all writes go through
 * `src/services/*`. To connect a real backend, replace the service implementations — the UI is not
 * coupled to browser storage.
 */
export interface DBState extends DB {
  currentUserId: string;
  hydrated: boolean;
}

const STORAGE_KEY = "evently-erp-demo-v2";

const safeStorage = {
  getItem: (name: string) => { try { return localStorage.getItem(name); } catch { return null; } },
  setItem: (name: string, value: string) => { try { localStorage.setItem(name, value); } catch { /* quota or privacy mode */ } },
  removeItem: (name: string) => { try { localStorage.removeItem(name); } catch { /* ignore */ } },
};

const DB_KEYS: (keyof DB)[] = [
  "settings", "roles", "users", "departments", "eventTypes", "clients", "communications", "leads", "events", "vendors", "catalogue",
  "assignments", "bills", "quotations", "salesOrders", "invoices", "payments", "expenses", "tasks", "inventory", "allocations",
  "movements", "notifications", "audit", "documents",
];

export const useDB = create<DBState>()(
  persist(
    () => ({ ...buildDemoDB(), currentUserId: "u2", hydrated: false as boolean }),
    {
      name: STORAGE_KEY,
      version: 2,
      storage: createJSONStorage(() => safeStorage),
      skipHydration: true,
      partialize: (s) => {
        const out: Record<string, unknown> = { currentUserId: s.currentUserId };
        for (const k of DB_KEYS) out[k] = s[k];
        return out as unknown as DBState;
      },
      onRehydrateStorage: () => () => { useDB.setState({ hydrated: true }); },
    },
  ),
);

export function hydrateDB() {
  const p = useDB.persist;
  const res = p.rehydrate();
  Promise.resolve(res).finally(() => useDB.setState({ hydrated: true }));
}

export function snapshotDB(): DB {
  const s = useDB.getState();
  const out = {} as Record<string, unknown>;
  for (const k of DB_KEYS) out[k] = s[k];
  return out as unknown as DB;
}

/** Run an immer mutation against the database state. */
export function mutate(fn: (draft: Draft<DBState>) => void) {
  useDB.setState((s) => produce(s, fn));
}

export function resetDemoData() {
  useDB.setState({ ...buildDemoDB(), currentUserId: "u2" });
}
