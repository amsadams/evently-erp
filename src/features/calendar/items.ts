import { addDays, parseISO } from "date-fns";
import type { DB } from "@/types";
import { eventConflicts } from "@/lib/calculations/conflicts";
import { billPaid, invoiceBalance } from "@/lib/calculations/finance";
import { toISODate } from "@/lib/formatting";

export type ItemKind = "event" | "function" | "meeting" | "vendor" | "staff" | "task" | "payment" | "milestone" | "reminder";
export const KIND_META: Record<ItemKind, { label: string; color: string }> = {
  event: { label: "Events", color: "#6D4AFF" }, function: { label: "Functions", color: "#9b82ff" }, meeting: { label: "Client meetings", color: "#2167C8" },
  vendor: { label: "Vendor appointments", color: "#0F9D8A" }, staff: { label: "Staff activities", color: "#4D7C0F" }, task: { label: "Task deadlines", color: "#D98A1F" },
  payment: { label: "Payment deadlines", color: "#C4364F" }, milestone: { label: "Milestones", color: "#A21CAF" }, reminder: { label: "Reminders", color: "#64748B" },
};

export interface CalItem {
  id: string; kind: ItemKind; title: string; sub?: string; start: string; end: string; href: string; eventId?: string; deptId?: string; coordinatorId?: string; vendorId?: string; conflict?: boolean; time?: string;
}

export function buildCalendarItems(db: DB): CalItem[] {
  const out: CalItem[] = [];
  for (const e of db.events) {
    if (e.status === "Cancelled") continue;
    const clash = eventConflicts(db, e).length > 0;
    out.push({ id: `e-${e.id}`, kind: "event", title: e.title, sub: `${e.ref} · ${e.venue}`, start: e.startDate, end: e.endDate, href: `/events/${e.id}`, eventId: e.id, coordinatorId: e.coordinatorId, conflict: clash, time: e.startTime });
    if (e.functions.length > 1) for (const f of e.functions) out.push({ id: `f-${f.id}`, kind: "function", title: f.name, sub: e.title, start: f.date, end: f.date, href: `/events/${e.id}?tab=functions`, eventId: e.id, coordinatorId: e.coordinatorId, time: f.startTime });
    for (const m of e.milestones) out.push({ id: `m-${m.id}`, kind: "milestone", title: m.title, sub: `${e.ref}${m.done ? " · done" : ""}`, start: m.date, end: m.date, href: `/events/${e.id}`, eventId: e.id, coordinatorId: e.coordinatorId });
  }
  for (const a of db.assignments) {
    const e = db.events.find((x) => x.id === a.eventId);
    if (!e || e.status === "Cancelled" || a.status === "Cancelled" || a.status === "Draft") continue;
    const d = toISODate(addDays(parseISO(e.startDate), -1));
    out.push({ id: `v-${a.id}`, kind: "vendor", title: `${db.vendors.find((v) => v.id === a.vendorId)?.name}: setup`, sub: `${e.ref} · ${a.setupTime || "setup"}`, start: d, end: d, href: `/events/${e.id}?tab=vendors`, eventId: e.id, vendorId: a.vendorId, deptId: a.departmentId, coordinatorId: e.coordinatorId });
  }
  for (const t of db.tasks) {
    if (["Archived", "Cancelled"].includes(t.status)) continue;
    const e = db.events.find((x) => x.id === t.eventId);
    if (t.kind === "meeting" && t.due) out.push({ id: `mt-${t.id}`, kind: "meeting", title: t.title, sub: db.users.find((u) => u.id === t.assigneeId)?.name, start: t.due, end: t.due, href: "/tasks", eventId: t.eventId, deptId: t.departmentId, coordinatorId: e?.coordinatorId ?? t.assigneeId });
    else if (t.due && (t.kind === "task" || t.kind === "followup")) out.push({ id: `t-${t.id}`, kind: "task", title: t.title, sub: `${t.status} · ${db.users.find((u) => u.id === t.assigneeId)?.name}`, start: t.due, end: t.due, href: "/tasks", eventId: t.eventId, deptId: t.departmentId, coordinatorId: e?.coordinatorId ?? t.assigneeId });
    if (t.due && t.status !== "Completed" && t.reminderDays) {
      const r = toISODate(addDays(parseISO(t.due), -t.reminderDays));
      out.push({ id: `r-${t.id}`, kind: "reminder", title: `Reminder: ${t.title}`, start: r, end: r, href: "/tasks", eventId: t.eventId, deptId: t.departmentId, coordinatorId: e?.coordinatorId ?? t.assigneeId });
    }
    if (t.kind === "task" && t.start && t.due && t.assigneeId) { /* staff activity spans start..due */
      out.push({ id: `s-${t.id}`, kind: "staff", title: t.title, sub: db.users.find((u) => u.id === t.assigneeId)?.name, start: t.start, end: t.due, href: "/tasks", eventId: t.eventId, deptId: t.departmentId, coordinatorId: e?.coordinatorId ?? t.assigneeId });
    }
  }
  for (const c of db.communications.filter((c) => c.followUpAt)) out.push({ id: `c-${c.id}`, kind: "meeting", title: `Follow-up: ${db.clients.find((x) => x.id === c.clientId)?.name}`, sub: c.summary.slice(0, 50), start: c.followUpAt!, end: c.followUpAt!, href: `/clients/${c.clientId}` });
  for (const i of db.invoices) {
    if (i.status === "Issued" && i.type !== "Credit Note" && invoiceBalance(db, i) > 0) { const e = db.events.find((x) => x.id === i.eventId); out.push({ id: `i-${i.id}`, kind: "payment", title: `Receive ${i.ref}`, sub: db.clients.find((c) => c.id === i.clientId)?.name, start: i.dueDate, end: i.dueDate, href: "/invoices", eventId: i.eventId, coordinatorId: e?.coordinatorId }); }
  }
  for (const b of db.bills) {
    if (b.status === "Approved" && billPaid(db, b.id) < b.amount) { const e = db.events.find((x) => x.id === b.eventId); out.push({ id: `b-${b.id}`, kind: "payment", title: `Pay ${b.vendorBillNo}`, sub: db.vendors.find((v) => v.id === b.vendorId)?.name, start: b.dueDate, end: b.dueDate, href: `/events/${b.eventId}?tab=vendors`, eventId: b.eventId, vendorId: b.vendorId, coordinatorId: e?.coordinatorId }); }
  }
  return out;
}
