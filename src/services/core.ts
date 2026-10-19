import type { Draft } from "immer";
import type { AppNotification, DB, NotificationType, Severity } from "@/types";
import { uid } from "@/lib/utils";
import { useDB, type DBState } from "@/stores/db";

export type D = Draft<DBState>;

/** Allocate the next document number for a series (simulates a server-side transactional sequence). */
export function nextNumber(d: D | DB, key: string): string {
  const rule = d.settings.numbering.find((n) => n.key === key);
  if (!rule) return `${key.toUpperCase()}-${Date.now()}`;
  const n = rule.next;
  rule.next += 1;
  return `${rule.prefix}${String(n).padStart(rule.padding, "0")}`;
}

export function currentUserId() {
  return useDB.getState().currentUserId;
}

export function logAudit(d: D, action: string, entity: string, entityId: string, summary: string, eventId?: string) {
  d.audit.unshift({ id: uid("au"), at: new Date().toISOString(), userId: d.currentUserId, action, entity, entityId, eventId, summary });
  if (d.audit.length > 400) d.audit.length = 400;
}

export interface NotifyInput { type: NotificationType; severity: Severity; title: string; body: string; link?: string; dedupeKey?: string }

/** Create a notification once per dedupe key (idempotent). */
export function notify(d: D, n: NotifyInput) {
  if (!d.settings.notificationPrefs[n.type]) return;
  if (n.dedupeKey && d.notifications.some((x) => x.dedupeKey === n.dedupeKey)) return;
  const item: AppNotification = { id: uid("n"), at: new Date().toISOString(), read: false, ...n };
  d.notifications.unshift(item);
  if (d.notifications.length > 200) d.notifications.length = 200;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("erp:notification", { detail: item }));
}

export const findEvent = (d: DB, id?: string) => d.events.find((e) => e.id === id);
export const eventLabel = (d: DB, id?: string) => {
  const e = findEvent(d, id);
  return e ? `${e.ref} · ${e.title}` : "—";
};
