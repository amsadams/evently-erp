import type { DB, EventRecord } from "@/types";
import { availableFor } from "./inventory";

export interface Conflict { kind: "venue" | "coordinator" | "vendor" | "stock"; severity: "warning" | "critical"; message: string; eventId?: string }

const ACTIVE = (e: EventRecord) => e.status !== "Cancelled" && e.status !== "Completed";
const overlap = (a: { startDate: string; endDate: string }, b: { startDate: string; endDate: string }) => a.startDate <= b.endDate && a.endDate >= b.startDate;

export function eventConflicts(
  db: DB,
  ev: { id?: string; venue: string; startDate: string; endDate: string; coordinatorId: string; status?: string },
): Conflict[] {
  const out: Conflict[] = [];
  const others = db.events.filter((e) => e.id !== ev.id && ACTIVE(e));
  const hard = ev.status === "Confirmed" || ev.status === "In Progress";
  for (const o of others) {
    if (!overlap(o, ev)) continue;
    if (ev.venue && o.venue.trim().toLowerCase() === ev.venue.trim().toLowerCase())
      out.push({ kind: "venue", severity: hard ? "critical" : "warning", eventId: o.id, message: `Venue "${o.venue}" is already booked for ${o.ref} (${o.title}) on overlapping dates.` });
    if (ev.coordinatorId && o.coordinatorId === ev.coordinatorId)
      out.push({ kind: "coordinator", severity: "warning", eventId: o.id, message: `Coordinator is also assigned to ${o.ref} (${o.title}) on overlapping dates.` });
  }
  return out;
}

export function vendorConflicts(db: DB, eventId: string, vendorId: string): Conflict[] {
  const ev = db.events.find((e) => e.id === eventId);
  const vendor = db.vendors.find((v) => v.id === vendorId);
  if (!ev || !vendor) return [];
  const out: Conflict[] = [];
  if (vendor.unavailableDates.some((d) => d >= ev.startDate && d <= ev.endDate))
    out.push({ kind: "vendor", severity: "critical", message: `${vendor.name} is marked unavailable on dates within this event.` });
  for (const a of db.assignments.filter((x) => x.vendorId === vendorId && x.eventId !== eventId && x.status !== "Cancelled")) {
    const o = db.events.find((e) => e.id === a.eventId);
    if (o && ACTIVE(o) && overlap(o, ev))
      out.push({ kind: "vendor", severity: "warning", eventId: o.id, message: `${vendor.name} is also assigned to ${o.ref} (${o.title}) on overlapping dates.` });
  }
  return out;
}

export function stockConflicts(db: DB, eventId?: string): Conflict[] {
  const out: Conflict[] = [];
  for (const a of db.allocations) {
    if (eventId && a.eventId !== eventId) continue;
    const ev = db.events.find((e) => e.id === a.eventId);
    if (!ev || !ACTIVE(ev)) continue;
    const item = db.inventory.find((i) => i.id === a.itemId);
    if (!item) continue;
    if (a.reserved < a.required)
      out.push({ kind: "stock", severity: "warning", eventId: a.eventId, message: `${ev.ref}: ${item.name} reserved ${a.reserved} of ${a.required} required.` });
    const avail = availableFor(db, a.itemId, a.from, a.to, a.id);
    if (a.reserved > avail)
      out.push({ kind: "stock", severity: "critical", eventId: a.eventId, message: `${ev.ref}: ${item.name} is double-booked (needs ${a.reserved}, only ${avail} free for these dates).` });
  }
  return out;
}

export function allConflicts(db: DB): Conflict[] {
  const out: Conflict[] = [];
  const seen = new Set<string>();
  for (const e of db.events.filter(ACTIVE)) {
    for (const c of eventConflicts(db, e)) {
      const key = [e.id, c.eventId].sort().join("|") + c.kind;
      if (!seen.has(key)) { seen.add(key); out.push({ ...c, eventId: e.id, message: `${e.ref} ↔ ${c.message}` }); }
    }
  }
  return [...out, ...stockConflicts(db)];
}
