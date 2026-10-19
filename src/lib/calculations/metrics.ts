import { addDays, format, parseISO, startOfMonth } from "date-fns";
import type { DB, EventRecord } from "@/types";
import { toISODate, todayISO } from "../formatting";
import { billPaid, eventFinancials, invoiceBalance, invoiceStatus } from "./finance";
import { isOverdue } from "./tasks";

export type RangeKey = "all" | "next30" | "next90" | "last90" | "year";
export const RANGES: { value: RangeKey; label: string }[] = [
  { value: "all", label: "All time" }, { value: "next30", label: "Next 30 days" }, { value: "next90", label: "Next 90 days" }, { value: "last90", label: "Last 90 days" }, { value: "year", label: "This year" },
];

export function rangeBounds(r: RangeKey): [string, string] | null {
  const now = new Date();
  switch (r) {
    case "next30": return [todayISO(), toISODate(addDays(now, 30))];
    case "next90": return [todayISO(), toISODate(addDays(now, 90))];
    case "last90": return [toISODate(addDays(now, -90)), todayISO()];
    case "year": return [`${now.getFullYear()}-01-01`, `${now.getFullYear()}-12-31`];
    default: return null;
  }
}

export function filterEvents(db: DB, range: RangeKey, typeId?: string): EventRecord[] {
  const b = rangeBounds(range);
  return db.events.filter((e) => (!typeId || e.typeId === typeId) && (!b || (e.startDate <= b[1] && e.endDate >= b[0])));
}

export function dashboardMetrics(db: DB, range: RangeKey, typeId?: string) {
  const events = filterEvents(db, range, typeId);
  const ids = new Set(events.map((e) => e.id));
  const today = todayISO();
  const fin = events.map((e) => ({ e, f: eventFinancials(db, e) }));
  const sum = (fn: (x: (typeof fin)[number]) => number) => fin.reduce((a, x) => a + fn(x), 0);
  const live = events.filter((e) => !["Cancelled", "Completed"].includes(e.status));
  const done = fin.filter((x) => x.e.status === "Completed" && x.f.invoiced > 0);
  const actual = done.reduce((a, x) => a + x.f.actualResult, 0);
  const doneInvoiced = done.reduce((a, x) => a + x.f.invoiced, 0);
  const tasks = db.tasks.filter((t) => !t.eventId || ids.has(t.eventId));
  return {
    events, fin,
    active: live.filter((e) => ["Confirmed", "In Progress"].includes(e.status)).length,
    upcoming: events.filter((e) => e.startDate >= today && !["Cancelled", "Completed"].includes(e.status)).length,
    planning: events.filter((e) => e.status === "Planning" || e.status === "Enquiry").length,
    completed: events.filter((e) => e.status === "Completed").length,
    pendingApprovals: db.quotations.filter((q) => ids.has(q.eventId) && (q.status === "Sent" || q.status === "Internal Review")).length,
    pendingVendors: db.assignments.filter((a) => ids.has(a.eventId) && (a.status === "Sent" || a.status === "Awaiting Confirmation")).length,
    receivables: db.invoices.filter((i) => ids.has(i.eventId)).reduce((a, i) => a + invoiceBalance(db, i) * (i.type === "Proforma" ? 0 : 1), 0),
    payables: sum((x) => x.f.vendorPayable),
    estRevenue: sum((x) => x.f.estimatedRevenue),
    estExpenses: sum((x) => x.f.vendorCommitted + x.f.expensesRecorded),
    actualProfit: actual,
    actualMargin: doneInvoiced ? (actual / doneInvoiced) * 100 : 0,
    dueToday: tasks.filter((t) => t.due === today && !["Completed", "Cancelled", "Archived"].includes(t.status)).length,
    overdue: tasks.filter(isOverdue).length,
  };
}

export function upcomingPayments(db: DB, days = 21) {
  const today = todayISO();
  const end = toISODate(addDays(new Date(), days));
  const out: { id: string; kind: "receivable" | "payable"; label: string; sub: string; due: string; amount: number; overdue: boolean; href: string }[] = [];
  for (const i of db.invoices) {
    if (i.status !== "Issued" || i.type === "Credit Note" || false) continue;
    const bal = invoiceBalance(db, i);
    if (bal > 0 && i.dueDate <= end) out.push({ id: i.id, kind: "receivable", label: `${i.ref} · ${db.clients.find((c) => c.id === i.clientId)?.name}`, sub: `${i.type} (${invoiceStatus(db, i)})`, due: i.dueDate, amount: bal, overdue: i.dueDate < today, href: "/invoices" });
  }
  for (const b of db.bills) {
    if (b.status !== "Approved") continue;
    const bal = b.amount - billPaid(db, b.id);
    if (bal > 0 && b.dueDate <= end) out.push({ id: b.id, kind: "payable", label: `${b.vendorBillNo} · ${db.vendors.find((v) => v.id === b.vendorId)?.name}`, sub: "Vendor bill", due: b.dueDate, amount: bal, overdue: b.dueDate < today, href: `/events/${b.eventId}?tab=vendors` });
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

export function monthlySeries(db: DB, events: EventRecord[]) {
  const map = new Map<string, { month: string; Revenue: number; Costs: number; sort: string }>();
  for (const e of events) {
    const d = startOfMonth(parseISO(e.startDate));
    const k = format(d, "yyyy-MM");
    const f = eventFinancials(db, e);
    const cur = map.get(k) ?? { month: format(d, "MMM yy"), Revenue: 0, Costs: 0, sort: k };
    cur.Revenue += f.estimatedRevenue; cur.Costs += f.vendorCommitted + f.expensesRecorded;
    map.set(k, cur);
  }
  return [...map.values()].sort((a, b) => a.sort.localeCompare(b.sort));
}
