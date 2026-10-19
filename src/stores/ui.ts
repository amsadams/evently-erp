"use client";
import { create } from "zustand";

export type CreateKind = "client" | "lead" | "task" | "expense" | "quotation" | "vendor" | "inventory" | "department";
interface UIState {
  sidebarCollapsed: boolean; moreOpen: boolean; commandOpen: boolean; notifOpen: boolean;
  dialog: { kind: CreateKind; id?: string; preset?: Record<string, unknown> } | null;
  setSidebar: (v: boolean) => void;
  set: (p: Partial<UIState>) => void;
}

let initialCollapsed = false;
try { initialCollapsed = typeof window !== "undefined" && localStorage.getItem("erp-sidebar") === "1"; } catch { /* storage unavailable */ }

export const useUI = create<UIState>((set) => ({
  sidebarCollapsed: initialCollapsed, moreOpen: false, commandOpen: false, notifOpen: false, dialog: null,
  setSidebar: (v) => { try { localStorage.setItem("erp-sidebar", v ? "1" : "0"); } catch { /* ignore */ } set({ sidebarCollapsed: v }); },
  set: (p) => set(p),
}));

export const openCreate = (kind: CreateKind, preset?: Record<string, unknown>) => useUI.setState({ dialog: { kind, preset } });
export const openEdit = (kind: CreateKind, id: string) => useUI.setState({ dialog: { kind, id } });
