import { addDays, parseISO } from "date-fns";
import type { DB, Expense, InventoryItem, Task, TaskStatus } from "@/types";
import { uid } from "@/lib/utils";
import { toISODate, todayISO } from "@/lib/formatting";
import { isBlocked } from "@/lib/calculations/tasks";
import { availableFor, held } from "@/lib/calculations/inventory";
import { allConflicts, stockConflicts } from "@/lib/calculations/conflicts";
import { invoiceStatus, invoiceBalance, billPaid } from "@/lib/calculations/finance";
import { mutate, useDB } from "@/stores/db";
import { logAudit, nextNumber, notify } from "./core";
import { fail, ok, type Result } from "./events";

/* ---------------- expenses ---------------- */
export function saveExpense(input: Partial<Expense> & Pick<Expense, "category" | "payee" | "amount" | "date" | "method">): string {
  let id = input.id ?? "";
  mutate((d) => {
    if (input.id) { const e = d.expenses.find((x) => x.id === input.id); if (e) Object.assign(e, input); }
    else {
      id = uid("ex");
      d.expenses.unshift({ status: "Pending", pettyCash: false, note: "", ...input, id, ref: nextNumber(d, "expense") } as Expense);
      logAudit(d, "Recorded", "Expense", id, `Expense ${input.category} recorded`, input.eventId);
    }
  });
  return id;
}
export function setExpenseStatus(id: string, status: Expense["status"]) {
  mutate((d) => {
    const e = d.expenses.find((x) => x.id === id); if (!e) return;
    e.status = status;
    logAudit(d, "Expense", "Expense", id, `Expense ${e.ref} marked ${status}`, e.eventId);
  });
}

/* ---------------- tasks ---------------- */
export function saveTask(input: Partial<Task> & Pick<Task, "title">): string {
  let id = input.id ?? "";
  mutate((d) => {
    if (input.id) {
      const t = d.tasks.find((x) => x.id === input.id);
      if (t) {
        const reassigned = input.assigneeId && input.assigneeId !== t.assigneeId;
        Object.assign(t, input);
        t.history.push({ at: new Date().toISOString(), text: "Task updated" });
        if (reassigned) notify(d, { type: "assignment", severity: "info", title: `Task reassigned: ${t.title}`, body: `Now assigned to ${d.users.find((u) => u.id === t.assigneeId)?.name}.`, link: "/tasks" });
      }
    } else {
      id = uid("t");
      const t: Task = { description: "", status: "To Do", priority: "Medium", assigneeId: d.currentUserId, dependsOn: [], checklist: [], comments: [], attachments: [], kind: "task", history: [{ at: new Date().toISOString(), text: "Task created" }], createdAt: new Date().toISOString(), ...input, id };
      d.tasks.unshift(t);
      logAudit(d, "Created", "Task", id, `Task "${t.title}" created`, t.eventId);
      notify(d, { type: "assignment", severity: "info", title: `New task: ${t.title}`, body: `Assigned to ${d.users.find((u) => u.id === t.assigneeId)?.name}${t.due ? `, due ${t.due}` : ""}.`, link: "/tasks", dedupeKey: `task-new:${id}` });
    }
  });
  return id;
}

export function setTaskStatus(id: string, status: TaskStatus): Result {
  let err = "";
  mutate((d) => {
    const t = d.tasks.find((x) => x.id === id); if (!t) { err = "Not found"; return; }
    if (t.status === status) return;
    if ((status === "Ongoing" || status === "Completed") && isBlocked(t, d.tasks as Task[])) {
      err = "Blocked by an unfinished dependency: " + t.dependsOn.map((dep) => d.tasks.find((x) => x.id === dep)?.title).filter(Boolean).join(", ");
      return;
    }
    const prev = t.status;
    t.status = status;
    t.history.push({ at: new Date().toISOString(), text: `Status ${prev} → ${status}` });
    if (status === "Completed") {
      logAudit(d, "Completed", "Task", id, `Task "${t.title}" completed`, t.eventId);
      notify(d, { type: "task", severity: "success", title: `Task completed: ${t.title}`, body: t.eventId ? `Event timeline updated.` : "Marked complete.", link: "/tasks", dedupeKey: `task-done:${id}:${t.history.length}` });
    }
  });
  return err ? fail(err) : ok(undefined);
}

export function addTaskComment(id: string, text: string) {
  mutate((d) => { d.tasks.find((t) => t.id === id)?.comments.push({ id: uid("cm"), userId: d.currentUserId, text, at: new Date().toISOString() }); });
}
export function toggleChecklist(taskId: string, itemId: string) {
  mutate((d) => { const it = d.tasks.find((t) => t.id === taskId)?.checklist.find((c) => c.id === itemId); if (it) it.done = !it.done; });
}
export function addChecklistItem(taskId: string, text: string) {
  mutate((d) => { d.tasks.find((t) => t.id === taskId)?.checklist.push({ id: uid("ck"), text, done: false }); });
}
export function addAttachment(taskId: string, name: string) {
  mutate((d) => { d.tasks.find((t) => t.id === taskId)?.attachments.push(name); });
}
export function deleteTask(id: string) {
  mutate((d) => { const t = d.tasks.find((x) => x.id === id); if (t) { t.status = "Archived"; logAudit(d, "Archived", "Task", id, `Task "${t.title}" archived`, t.eventId); } });
}

/* ---------------- inventory ---------------- */
export function saveInventoryItem(input: Partial<InventoryItem> & Pick<InventoryItem, "name">): string {
  let id = input.id ?? "";
  mutate((d) => {
    if (input.id) { const i = d.inventory.find((x) => x.id === input.id); if (i) Object.assign(i, input); }
    else {
      id = uid("in");
      d.inventory.unshift({ sku: `SKU-${d.inventory.length + 1}`, category: "General", unit: "pcs", total: 0, damaged: 0, unavailable: 0, reorderLevel: 0, location: "Main store", rental: false, rentalRate: 0, ...input, id } as InventoryItem);
      logAudit(d, "Created", "Inventory", id, `Item ${input.name} added`);
    }
  });
  return id;
}

export function adjustStock(itemId: string, delta: number, note: string) {
  mutate((d) => {
    const i = d.inventory.find((x) => x.id === itemId); if (!i) return;
    i.total = Math.max(0, i.total + delta);
    d.movements.unshift({ id: uid("sm"), itemId, type: delta >= 0 ? "Purchase" : "Adjustment", qty: Math.abs(delta), at: new Date().toISOString(), note, byUserId: d.currentUserId });
  });
}

/** Reserve stock for an event; refuses to over-book the same period. */
export function allocateStock(eventId: string, itemId: string, required: number, reserve: number): Result {
  let err = "";
  mutate((d) => {
    const ev = d.events.find((e) => e.id === eventId);
    const item = d.inventory.find((i) => i.id === itemId);
    if (!ev || !item) { err = "Event or item not found"; return; }
    const existing = d.allocations.find((a) => a.eventId === eventId && a.itemId === itemId);
    const avail = availableFor(d as unknown as DB, itemId, ev.startDate, ev.endDate, existing?.id);
    if (reserve > avail) { err = `Only ${avail} ${item.unit} of ${item.name} available for ${ev.startDate} to ${ev.endDate}. Reduce the reservation or free other bookings.`; return; }
    if (existing) {
      existing.required = required;
      const diff = reserve - existing.reserved;
      existing.reserved = reserve;
      if (diff) d.movements.unshift({ id: uid("sm"), itemId, eventId, type: diff > 0 ? "Reserve" : "Release", qty: Math.abs(diff), at: new Date().toISOString(), note: `Reservation updated for ${ev.ref}`, byUserId: d.currentUserId });
    } else {
      d.allocations.unshift({ id: uid("al"), eventId, itemId, required, reserved: reserve, dispatched: 0, returned: 0, damaged: 0, missing: 0, from: ev.startDate, to: ev.endDate });
      if (reserve) d.movements.unshift({ id: uid("sm"), itemId, eventId, type: "Reserve", qty: reserve, at: new Date().toISOString(), note: `Reserved for ${ev.ref}`, byUserId: d.currentUserId });
    }
    logAudit(d, "Allocated", "Inventory", itemId, `${reserve}/${required} ${item.name} reserved for ${ev.ref}`, eventId);
  });
  return err ? fail(err) : ok(undefined);
}

export function dispatchStock(allocId: string, qty: number): Result {
  let err = "";
  mutate((d) => {
    const a = d.allocations.find((x) => x.id === allocId); if (!a) { err = "Not found"; return; }
    if (qty <= 0 || qty > a.reserved - a.dispatched) { err = `You can dispatch at most ${a.reserved - a.dispatched} (reserved, not yet dispatched).`; return; }
    a.dispatched += qty;
    const item = d.inventory.find((i) => i.id === a.itemId)!;
    const ev = d.events.find((e) => e.id === a.eventId)!;
    d.movements.unshift({ id: uid("sm"), itemId: a.itemId, eventId: a.eventId, type: "Dispatch", qty, at: new Date().toISOString(), note: `Dispatched to ${ev.venue}`, byUserId: d.currentUserId });
    if (item.rental && item.rentalRate) {
      const days = Math.max(1, Math.round((parseISO(a.to).getTime() - parseISO(a.from).getTime()) / 86400000) + 1);
      d.expenses.unshift({ id: uid("ex"), ref: nextNumber(d, "expense"), eventId: a.eventId, category: "Equipment rental", payee: item.name, date: todayISO(), amount: item.rentalRate * qty * days, method: "Bank Transfer", status: "Pending", pettyCash: false, note: `Rental: ${qty} × ${days} day(s) (auto-created on dispatch)` });
    }
    logAudit(d, "Dispatched", "Inventory", a.itemId, `${qty} ${item.name} dispatched for ${ev.ref}`, a.eventId);
  });
  return err ? fail(err) : ok(undefined);
}

export function returnStock(allocId: string, qty: number): Result {
  let err = "";
  mutate((d) => {
    const a = d.allocations.find((x) => x.id === allocId); if (!a) { err = "Not found"; return; }
    const out = a.dispatched - a.returned - a.damaged - a.missing;
    if (qty <= 0 || qty > out) { err = `Only ${out} unit(s) are currently out for this event.`; return; }
    a.returned += qty;
    d.movements.unshift({ id: uid("sm"), itemId: a.itemId, eventId: a.eventId, type: "Return", qty, at: new Date().toISOString(), note: "Returned to store", byUserId: d.currentUserId });
  });
  return err ? fail(err) : ok(undefined);
}

export function recordLoss(allocId: string, qty: number, kind: "damaged" | "missing", note: string): Result {
  let err = "";
  mutate((d) => {
    const a = d.allocations.find((x) => x.id === allocId); if (!a) { err = "Not found"; return; }
    const out = a.dispatched - a.returned - a.damaged - a.missing;
    if (qty <= 0 || qty > out) { err = `Only ${out} unit(s) are currently out for this event.`; return; }
    const item = d.inventory.find((i) => i.id === a.itemId)!;
    if (kind === "damaged") { a.damaged += qty; item.damaged += qty; } else { a.missing += qty; item.total = Math.max(0, item.total - qty); }
    d.movements.unshift({ id: uid("sm"), itemId: a.itemId, eventId: a.eventId, type: kind === "damaged" ? "Damaged" : "Missing", qty, at: new Date().toISOString(), note, byUserId: d.currentUserId });
    notify(d, { type: "inventory", severity: "warning", title: `${qty} ${item.name} ${kind}`, body: note || "Recorded during return.", link: "/inventory" });
  });
  return err ? fail(err) : ok(undefined);
}

export function releaseAllocation(allocId: string) {
  mutate((d) => { const i = d.allocations.findIndex((a) => a.id === allocId && a.dispatched === 0); if (i >= 0) d.allocations.splice(i, 1); });
}
void held;

/* ---------------- notifications & simulated business events ---------------- */
export function markRead(id: string, read = true) {
  mutate((d) => { const n = d.notifications.find((x) => x.id === id); if (n) n.read = read; });
}
export function markAllRead() {
  mutate((d) => { d.notifications.forEach((n) => { n.read = true; }); });
}
export function clearNotifications() {
  mutate((d) => { d.notifications = []; });
}

/**
 * Deterministic alert engine (client-side simulation of the server alert/outbox worker).
 * Every alert uses a stable dedupe key so refreshing never duplicates it.
 */
export function syncAlerts() {
  mutate((d) => {
    const db = d as unknown as DB;
    const today = todayISO();
    const in3 = toISODate(addDays(new Date(), 3));
    const in7 = toISODate(addDays(new Date(), 7));
    const in5 = toISODate(addDays(new Date(), 5));
    for (const e of d.events) {
      if (["Cancelled", "Completed", "Enquiry"].includes(e.status)) continue;
      if (e.startDate >= today && e.startDate <= in7)
        notify(d, { type: "event", severity: "info", title: `Upcoming: ${e.title}`, body: `${e.ref} starts ${e.startDate} at ${e.venue}.`, link: `/events/${e.id}`, dedupeKey: `evt-soon:${e.id}` });
    }
    for (const t of d.tasks) {
      if (["Completed", "Cancelled", "Archived"].includes(t.status) || !t.due) continue;
      if (t.due < today) notify(d, { type: "task", severity: "critical", title: `Overdue task: ${t.title}`, body: `Was due ${t.due}. Assigned to ${d.users.find((u) => u.id === t.assigneeId)?.name}.`, link: "/tasks", dedupeKey: `task-overdue:${t.id}:${t.due}` });
      else if (t.due <= toISODate(addDays(new Date(), t.reminderDays ?? 1))) notify(d, { type: "task", severity: "warning", title: `Task due ${t.due === today ? "today" : "soon"}: ${t.title}`, body: `Due ${t.due}.`, link: "/tasks", dedupeKey: `task-soon:${t.id}:${t.due}` });
    }
    for (const i of d.invoices) {
      if (i.status !== "Issued" || i.type === "Credit Note") continue;
      const st = invoiceStatus(db, i);
      if (st === "Overdue") notify(d, { type: "payment", severity: "critical", title: `Payment overdue: ${i.ref}`, body: `${d.clients.find((c) => c.id === i.clientId)?.name} owes ${(invoiceBalance(db, i) / 100).toLocaleString("en-IN")} (due ${i.dueDate}).`, link: "/invoices", dedupeKey: `inv-overdue:${i.id}` });
      else if ((st === "Issued" || st === "Partially Paid") && i.dueDate <= in3) notify(d, { type: "payment", severity: "warning", title: `Payment due soon: ${i.ref}`, body: `Due ${i.dueDate}.`, link: "/invoices", dedupeKey: `inv-due:${i.id}` });
    }
    for (const b of d.bills) {
      if (b.status === "Approved" && billPaid(db, b.id) < b.amount && b.dueDate <= in5)
        notify(d, { type: "payment", severity: b.dueDate < today ? "critical" : "warning", title: `Vendor payment ${b.dueDate < today ? "overdue" : "due"}: ${b.vendorBillNo}`, body: `${d.vendors.find((v) => v.id === b.vendorId)?.name} — due ${b.dueDate}.`, link: `/events/${b.eventId}?tab=vendors`, dedupeKey: `bill-due:${b.id}` });
    }
    for (const q of d.quotations) {
      if (q.status === "Sent" && q.validUntil < today) {
        q.status = "Expired";
        notify(d, { type: "quotation", severity: "warning", title: `Quotation expired: ${q.ref}`, body: "Validity lapsed without a client decision. Revise to re-issue.", link: `/quotations/${q.id}`, dedupeKey: `q-exp:${q.id}:${q.version}` });
      } else if (q.status === "Sent" && q.validUntil <= in3) notify(d, { type: "quotation", severity: "warning", title: `Quotation expiring: ${q.ref}`, body: `Valid until ${q.validUntil}.`, link: `/quotations/${q.id}`, dedupeKey: `q-expiring:${q.id}:${q.version}` });
    }
    for (const a of d.assignments) {
      const ev = d.events.find((e) => e.id === a.eventId);
      if (!ev || ["Cancelled", "Completed"].includes(ev.status)) continue;
      if ((a.status === "Sent" || a.status === "Awaiting Confirmation") && ev.startDate <= toISODate(addDays(new Date(), 30)))
        notify(d, { type: "vendor", severity: "warning", title: `Vendor confirmation pending: ${d.vendors.find((v) => v.id === a.vendorId)?.name}`, body: `${a.ref} for ${ev.ref} is still ${a.status}.`, link: `/events/${ev.id}?tab=vendors`, dedupeKey: `vpend:${a.id}` });
    }
    for (const c of stockConflicts(db)) if (c.severity === "critical") notify(d, { type: "inventory", severity: "critical", title: "Inventory shortage", body: c.message, link: "/inventory", dedupeKey: `stock:${c.message}` });
    for (const i of d.inventory) {
      const avail = i.total - i.damaged - i.unavailable;
      if (avail <= i.reorderLevel && i.reorderLevel > 0) notify(d, { type: "inventory", severity: "warning", title: `Reorder alert: ${i.name}`, body: `${avail} usable units vs reorder level ${i.reorderLevel}.`, link: "/inventory", dedupeKey: `reorder:${i.id}:${avail}` });
    }
    for (const c of allConflicts(db).filter((x) => x.kind !== "stock")) notify(d, { type: "conflict", severity: c.severity === "critical" ? "critical" : "warning", title: "Event date / venue clash", body: c.message, link: c.eventId ? `/events/${c.eventId}` : "/calendar", dedupeKey: `clash:${c.message}` });
  });
}

/** Demo helper: emits a simulated business event so reviewers can see alerts arrive. */
export function simulateBusinessEvent(kind: "vendor-confirmed" | "client-approved" | "payment-received") {
  const db = useDB.getState();
  mutate((d) => {
    if (kind === "vendor-confirmed") {
      const a = db.assignments.find((x) => x.status === "Sent" || x.status === "Awaiting Confirmation");
      if (!a) { notify(d, { type: "system", severity: "info", title: "No pending vendor confirmations", body: "Nothing to simulate.", link: "/vendors" }); return; }
      const t = d.assignments.find((x) => x.id === a.id)!;
      t.status = "Confirmed";
      t.snapshots.push({ version: t.version, at: new Date().toISOString(), byUserId: d.currentUserId, status: "Confirmed", reason: "Vendor confirmed (simulated reply)", lines: JSON.parse(JSON.stringify(t.lines)), total: 0, quotedTotal: 0 });
      notify(d, { type: "vendor", severity: "success", title: `Vendor replied: ${d.vendors.find((v) => v.id === t.vendorId)?.name} confirmed`, body: `${t.ref} confirmed (simulated vendor response).`, link: `/events/${t.eventId}?tab=vendors` });
    } else if (kind === "client-approved") {
      const q = db.quotations.find((x) => x.status === "Sent");
      if (!q) { notify(d, { type: "system", severity: "info", title: "No sent quotations to approve", body: "Send a quotation first.", link: "/quotations" }); return; }
      const t = d.quotations.find((x) => x.id === q.id)!;
      t.status = "Approved"; t.decidedAt = new Date().toISOString();
      notify(d, { type: "quotation", severity: "success", title: `Client approved ${t.ref}`, body: "Simulated client response. Convert it to a booking.", link: `/quotations/${t.id}` });
    } else {
      notify(d, { type: "payment", severity: "success", title: "Payment received (simulated)", body: "A bank-feed event arrived. Allocate it to an invoice in Invoices.", link: "/invoices" });
    }
  });
}
