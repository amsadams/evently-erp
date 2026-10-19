import type { AgreementLine, AgreementStatus, AgreementSnapshot, Vendor, VendorAssignment, CatalogueItem, PayMethod, PayScheduleItem } from "@/types";
import { uid } from "@/lib/utils";
import { agreementQuotedTotal, agreementTotal } from "@/lib/calculations/quote";
import { vendorConflicts } from "@/lib/calculations/conflicts";
import { billPaid } from "@/lib/calculations/finance";
import { mutate } from "@/stores/db";
import { logAudit, nextNumber, notify } from "./core";
import { fail, ok, type Result } from "./events";
import { generatePODoc, generateRequirementDoc } from "./documents";
import type { DB } from "@/types";

export function saveVendor(input: Partial<Vendor> & Pick<Vendor, "name" | "categoryId">): string {
  let id = input.id ?? "";
  mutate((d) => {
    if (input.id) {
      const v = d.vendors.find((x) => x.id === input.id);
      if (v) { Object.assign(v, input); logAudit(d, "Updated", "Vendor", v.id, `Vendor ${v.name} updated`); }
    } else {
      id = uid("v");
      d.vendors.unshift({
        phone: "", email: "", city: "", serviceLocations: [], status: "Active", paymentTerms: "50% advance, balance on completion", departmentIds: [], services: [], contacts: [],
        bank: { holder: input.name, bankName: "", account: "", ifsc: "" }, documents: [], feedback: [], unavailableDates: [], createdAt: new Date().toISOString(), ...input, id,
      } as Vendor);
      logAudit(d, "Created", "Vendor", id, `Vendor ${input.name} added`);
    }
  });
  return id;
}

export function addVendorFeedback(vendorId: string, rating: number, comment: string, eventId?: string) {
  mutate((d) => { d.vendors.find((v) => v.id === vendorId)?.feedback.unshift({ id: uid("f"), rating, comment, eventId, at: new Date().toISOString(), byUserId: d.currentUserId }); });
}

export function saveCatalogueItem(item: Partial<CatalogueItem> & Pick<CatalogueItem, "name" | "scope" | "departmentId" | "unit" | "rate">) {
  mutate((d) => {
    if (item.id) { const c = d.catalogue.find((x) => x.id === item.id); if (c) Object.assign(c, item); }
    else d.catalogue.push({ taxRate: 18, active: true, ...item, id: uid("ci") } as CatalogueItem);
  });
}

/** Last agreed unit rate for a vendor catalogue item, taken from confirmed+ agreement lines (never from catalogue edits). */
export function priceHistory(db: DB, vendorId: string, name: string, catalogueItemId?: string) {
  const rows: { eventId: string; at: string; rate: number; qty: number; status: AgreementStatus }[] = [];
  for (const a of db.assignments.filter((x) => x.vendorId === vendorId)) {
    for (const l of a.lines.filter((x) => (catalogueItemId && x.catalogueItemId === catalogueItemId) || x.name === name)) {
      if (["Confirmed", "Approved", "Ordered", "Partially Completed", "Completed"].includes(a.status))
        rows.push({ eventId: a.eventId, at: a.createdAt, rate: l.agreedRate, qty: l.qty, status: a.status });
    }
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

/* ---------------- event-vendor assignments (agreements) ---------------- */
export function addAssignment(eventId: string, vendorId: string, departmentId: string, scope: string): Result<string> {
  let id = "";
  let warn = "";
  mutate((d) => {
    const ev = d.events.find((e) => e.id === eventId);
    const v = d.vendors.find((x) => x.id === vendorId);
    if (!ev || !v) return;
    id = uid("as");
    const conflicts = vendorConflicts(d as unknown as DB, eventId, vendorId);
    warn = conflicts.map((c) => c.message).join(" ");
    d.assignments.unshift({
      id, ref: nextNumber(d, "assignment"), eventId, vendorId, departmentId, scope: scope || `${v.name} — ${ev.title}`, status: "Draft", version: 1, lines: [], setupTime: "", accessInstructions: "",
      deliveryDetails: "", deadline: ev.startDate, terms: v.paymentTerms, schedule: [{ id: uid("ps"), label: "Advance", pct: 50, dueDate: ev.startDate }, { id: uid("ps"), label: "Balance on completion", pct: 50, dueDate: ev.endDate }],
      snapshots: [], requirementDocIds: [], createdAt: new Date().toISOString(),
    });
    logAudit(d, "Assigned", "Vendor", id, `${v.name} assigned to ${ev.ref}`, eventId);
    notify(d, { type: "assignment", severity: "info", title: `Vendor assigned: ${v.name}`, body: `${ev.ref} now has a new agreement in Draft.`, link: `/events/${eventId}?tab=vendors` });
    for (const c of conflicts) notify(d, { type: "conflict", severity: c.severity === "critical" ? "critical" : "warning", title: "Vendor scheduling conflict", body: c.message, link: `/events/${eventId}?tab=vendors`, dedupeKey: `vconf:${id}:${c.eventId ?? "u"}` });
  });
  return id ? ok(id) : fail(warn || "Could not create assignment");
}

export const EDITABLE: AgreementStatus[] = ["Draft", "Sent", "Awaiting Confirmation", "Revised"];

export function saveAgreement(id: string, patch: Partial<Pick<VendorAssignment, "scope" | "lines" | "setupTime" | "accessInstructions" | "deliveryDetails" | "deadline" | "terms" | "schedule" | "departmentId">>): Result {
  let err = "";
  mutate((d) => {
    const a = d.assignments.find((x) => x.id === id);
    if (!a) { err = "Not found"; return; }
    if (!EDITABLE.includes(a.status)) { err = `Agreement is ${a.status}. Create a revision to change the confirmed scope.`; return; }
    Object.assign(a, patch);
  });
  return err ? fail(err) : ok(undefined);
}

function snapshot(a: VendorAssignment, byUserId: string, reason: string, status: AgreementStatus): AgreementSnapshot {
  return { version: a.version, at: new Date().toISOString(), byUserId, status, reason, lines: JSON.parse(JSON.stringify(a.lines)), total: agreementTotal(a.lines), quotedTotal: agreementQuotedTotal(a.lines) };
}

/** Status progression for the procurement workflow. Confirming stores an immutable scope snapshot. */
export function setAgreementStatus(id: string, status: AgreementStatus, reason = ""): Result {
  let err = "";
  mutate((d) => {
    const a = d.assignments.find((x) => x.id === id);
    if (!a) { err = "Not found"; return; }
    if (status === "Confirmed" || status === "Sent" || status === "Awaiting Confirmation") {
      if (!a.lines.length) { err = "Add at least one line item first."; return; }
    }
    if (status === "Confirmed") {
      if (a.lines.some((l) => l.agreedRate <= 0)) { err = "Every line needs an agreed rate before the scope can be confirmed."; return; }
      a.snapshots.push(snapshot(a, d.currentUserId, reason || "Scope and price confirmed", "Confirmed"));
    }
    const prev = a.status;
    a.status = status;
    logAudit(d, "Status", "Agreement", id, `Agreement ${a.ref} ${prev} → ${status}`, a.eventId);
    const v = d.vendors.find((x) => x.id === a.vendorId);
    if (status === "Sent" || status === "Awaiting Confirmation")
      notify(d, { type: "vendor", severity: "warning", title: `Awaiting vendor confirmation: ${v?.name}`, body: `${a.ref} was sent. Follow up if no reply.`, link: `/events/${a.eventId}?tab=vendors`, dedupeKey: `vsent:${id}:${status}` });
    if (status === "Confirmed") notify(d, { type: "vendor", severity: "success", title: `Scope confirmed: ${v?.name}`, body: `${a.ref} confirmed at the agreed amount.`, link: `/events/${a.eventId}?tab=vendors`, dedupeKey: `vconf-ok:${id}:${a.version}` });
  });
  if (!err && (status === "Sent")) generateRequirementDoc(id);
  return err ? fail(err) : ok(undefined);
}

/** After confirmation, changes create a new version; the confirmed snapshot is preserved. */
export function reviseAgreement(id: string, reason: string): Result {
  let err = "";
  mutate((d) => {
    const a = d.assignments.find((x) => x.id === id);
    if (!a) { err = "Not found"; return; }
    if (EDITABLE.includes(a.status) || a.status === "Cancelled" || a.status === "Completed") { err = "Only confirmed or ordered agreements can be revised."; return; }
    if (!a.snapshots.some((s) => s.version === a.version)) a.snapshots.push(snapshot(a, d.currentUserId, "Pre-revision state", a.status));
    a.version += 1;
    a.status = "Revised";
    a.poRef = a.poRef;
    logAudit(d, "Revised", "Agreement", id, `Agreement ${a.ref} revised to v${a.version}: ${reason}`, a.eventId);
    notify(d, { type: "document", severity: "warning", title: `Agreement revised: ${a.ref}`, body: `Version ${a.version} needs vendor re-confirmation. ${reason}`, link: `/events/${a.eventId}?tab=vendors` });
  });
  return err ? fail(err) : ok(undefined);
}

export function createPurchaseOrder(id: string): Result<string> {
  let err = "";
  let ref = "";
  mutate((d) => {
    const a = d.assignments.find((x) => x.id === id);
    if (!a) { err = "Not found"; return; }
    if (a.status !== "Approved") { err = "Only approved agreements can be converted to a purchase / work order."; return; }
    ref = a.poRef ?? nextNumber(d, "po");
    a.poRef = ref; a.orderedAt = new Date().toISOString(); a.status = "Ordered";
    logAudit(d, "Ordered", "Agreement", id, `Purchase/work order ${ref} issued for ${a.ref}`, a.eventId);
    notify(d, { type: "vendor", severity: "info", title: `Work order issued: ${ref}`, body: "Track delivery and bills from the event's Vendors tab.", link: `/events/${a.eventId}?tab=vendors` });
  });
  if (err) return fail(err);
  generatePODoc(id);
  return ok(ref);
}

export function recordDelivery(id: string, delivered: Record<string, number>): Result {
  let err = "";
  mutate((d) => {
    const a = d.assignments.find((x) => x.id === id);
    if (!a) { err = "Not found"; return; }
    if (!["Ordered", "Partially Completed", "Completed"].includes(a.status)) { err = "Issue a purchase/work order before recording delivery."; return; }
    for (const l of a.lines) if (delivered[l.id] !== undefined) l.deliveredQty = Math.max(0, Math.min(l.qty, delivered[l.id]));
    const all = a.lines.every((l) => l.deliveredQty >= l.qty);
    const any = a.lines.some((l) => l.deliveredQty > 0);
    a.status = all ? "Completed" : any ? "Partially Completed" : "Ordered";
    logAudit(d, "Delivery", "Agreement", id, `Delivery recorded on ${a.ref}: ${a.status}`, a.eventId);
  });
  return err ? fail(err) : ok(undefined);
}

export function cancelAgreement(id: string, reason: string) {
  mutate((d) => {
    const a = d.assignments.find((x) => x.id === id); if (!a) return;
    a.status = "Cancelled";
    logAudit(d, "Cancelled", "Agreement", id, `Agreement ${a.ref} cancelled: ${reason}`, a.eventId);
  });
}

export function removeDraftAgreement(id: string) {
  mutate((d) => { const i = d.assignments.findIndex((x) => x.id === id && x.status === "Draft"); if (i >= 0) d.assignments.splice(i, 1); });
}

export function blankLine(): AgreementLine {
  return { id: uid("al"), name: "", unit: "piece", qty: 1, catalogueRate: 0, quotedRate: 0, agreedRate: 0, discountPct: 0, remarks: "", responsible: "vendor", deliveredQty: 0 };
}

/* ---------------- vendor bills & payments ---------------- */
export function recordBill(input: { assignmentId: string; vendorBillNo: string; date: string; dueDate: string; amount: number; note: string }): Result<string> {
  let err = ""; let id = "";
  mutate((d) => {
    const a = d.assignments.find((x) => x.id === input.assignmentId);
    if (!a) { err = "Agreement not found"; return; }
    if (!["Ordered", "Partially Completed", "Completed"].includes(a.status)) { err = "Bills can only be recorded against an ordered agreement."; return; }
    if (input.amount <= 0) { err = "Enter a bill amount."; return; }
    id = uid("vb");
    const agreed = agreementTotal(a.lines);
    const billed = d.bills.filter((b) => b.assignmentId === a.id && b.status !== "Cancelled").reduce((s, b) => s + b.amount, 0);
    const over = billed + input.amount > agreed;
    d.bills.unshift({ id, ref: nextNumber(d, "bill"), vendorBillNo: input.vendorBillNo, assignmentId: a.id, eventId: a.eventId, vendorId: a.vendorId, date: input.date, dueDate: input.dueDate, amount: input.amount, status: over ? "Disputed" : "Pending", note: over ? `Exceeds agreed order value. ${input.note}` : input.note });
    logAudit(d, "Recorded", "VendorBill", id, `Vendor bill ${input.vendorBillNo} recorded against ${a.ref}`, a.eventId);
    if (over) notify(d, { type: "vendor", severity: "warning", title: "Vendor bill exceeds agreed value", body: `${input.vendorBillNo} pushes billed total above the work order. Review before approving.`, link: `/events/${a.eventId}?tab=vendors` });
  });
  return err ? fail(err) : ok(id);
}

export function setBillStatus(id: string, status: "Approved" | "Disputed" | "Cancelled" | "Pending") {
  mutate((d) => {
    const b = d.bills.find((x) => x.id === id); if (!b) return;
    b.status = status;
    logAudit(d, "Bill", "VendorBill", id, `Vendor bill ${b.vendorBillNo} marked ${status}`, b.eventId);
  });
}

export function payVendor(input: { assignmentId: string; billId?: string; amount: number; method: PayMethod; date: string; reference: string; note: string }): Result<string> {
  let err = ""; let id = "";
  mutate((d) => {
    const a = d.assignments.find((x) => x.id === input.assignmentId);
    if (!a) { err = "Agreement not found"; return; }
    if (input.amount <= 0) { err = "Enter an amount greater than zero."; return; }
    if (input.billId) {
      const b = d.bills.find((x) => x.id === input.billId);
      if (!b || b.status !== "Approved") { err = "Only approved bills can be paid."; return; }
      const bal = b.amount - billPaid(d as unknown as DB, b.id);
      if (input.amount > bal) { err = "Payment exceeds the bill's outstanding balance."; return; }
    } else {
      const agreed = agreementTotal(a.lines);
      const paidAdv = d.payments.filter((p) => p.assignmentId === a.id && p.category === "vendor").reduce((s, p) => s + p.amount, 0);
      if (paidAdv + input.amount > agreed) { err = "Total payments would exceed the agreed order value."; return; }
    }
    id = uid("pay");
    d.payments.unshift({ id, ref: nextNumber(d, "vpay"), direction: "out", category: "vendor", eventId: a.eventId, partyId: a.vendorId, amount: input.amount, method: input.method, date: input.date, reference: input.reference, note: input.note, billId: input.billId, assignmentId: a.id });
    logAudit(d, "Paid", "Payment", id, `Vendor payment recorded for ${a.ref}`, a.eventId);
    notify(d, { type: "payment", severity: "success", title: "Vendor payment recorded", body: `${d.vendors.find((v) => v.id === a.vendorId)?.name}: payment against ${a.ref}. (Simulated — no money moved.)`, link: `/events/${a.eventId}?tab=vendors` });
  });
  return err ? fail(err) : ok(id);
}

export const newScheduleItem = (): PayScheduleItem => ({ id: uid("ps"), label: "Milestone", pct: 0, dueDate: "" });
