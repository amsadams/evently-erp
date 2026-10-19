import { addDays, parseISO } from "date-fns";
import type { DB, Invoice, InvoiceKind, InvoiceLine, InvoiceType, Milestone2, PayMethod, QuoteBody, QuoteStatus, TaxMode } from "@/types";
import { uid } from "@/lib/utils";
import { toISODate, todayISO } from "@/lib/formatting";
import { computeQuote, agreementTotal } from "@/lib/calculations/quote";
import { computeInvoiceTotals } from "@/lib/calculations/invoice";
import { invoiceBalance } from "@/lib/calculations/finance";
import { percentOf } from "@/lib/calculations/money";
import { mutate } from "@/stores/db";
import { logAudit, nextNumber, notify } from "./core";
import { fail, ok, type Result } from "./events";
import { generateInvoiceDoc, generateQuotationDoc, generateReceiptDoc } from "./documents";
import { COMMITTED_STATUSES } from "@/lib/calculations/finance";

/* ---------------- quotations ---------------- */
export function createQuotation(eventId: string): string {
  const id = uid("q");
  mutate((d) => {
    const ev = d.events.find((e) => e.id === eventId); if (!ev) return;
    const body: QuoteBody = { lines: [], charges: [], taxMode: d.settings.taxRegistered ? d.settings.invoiceDefaultTaxMode : "none", advancePct: 30, terms: d.settings.terms, paymentTerms: "30% advance on confirmation, 40% before event setup, balance 7 days before the event.", notes: "" };
    d.quotations.unshift({
      id, ref: nextNumber(d, "quotation"), eventId, clientId: ev.clientId, title: `Proposal – ${ev.title}`, status: "Draft", version: 1, validUntil: toISODate(addDays(new Date(), 15)), body, versions: [], reviewApproved: false,
      createdAt: new Date().toISOString(), createdBy: d.currentUserId,
    });
    logAudit(d, "Created", "Quotation", id, `Quotation drafted for ${ev.ref}`, eventId);
  });
  return id;
}

const LOCKED: QuoteStatus[] = ["Sent", "Approved", "Rejected", "Expired", "Converted"];

export function saveQuotation(id: string, patch: { body?: QuoteBody; title?: string; validUntil?: string }): Result {
  let err = "";
  mutate((d) => {
    const q = d.quotations.find((x) => x.id === id);
    if (!q) { err = "Not found"; return; }
    if (LOCKED.includes(q.status)) { err = `Quotation is ${q.status}. Create a revision to edit it.`; return; }
    if (patch.body) { q.body = patch.body; q.reviewApproved = false; if (q.status === "Internal Review") q.status = "Draft"; }
    if (patch.title !== undefined) q.title = patch.title;
    if (patch.validUntil) q.validUntil = patch.validUntil;
  });
  return err ? fail(err) : ok(undefined);
}

export function reviseQuotation(id: string, reason: string): Result {
  let err = "";
  mutate((d) => {
    const q = d.quotations.find((x) => x.id === id);
    if (!q) { err = "Not found"; return; }
    if (q.status === "Converted") { err = "This quotation was converted to a booking. Raise a change order / new quotation instead."; return; }
    if (!LOCKED.includes(q.status)) { err = "Draft quotations can be edited directly."; return; }
    q.versions.push({ version: q.version, at: new Date().toISOString(), byUserId: d.currentUserId, reason, total: computeQuote(q.body).grandTotal, body: JSON.parse(JSON.stringify(q.body)), status: q.status });
    q.version += 1; q.status = "Draft"; q.reviewApproved = false; q.sentAt = undefined; q.decidedAt = undefined;
    q.validUntil = toISODate(addDays(new Date(), 15));
    logAudit(d, "Revised", "Quotation", id, `Quotation ${q.ref} revised to v${q.version}: ${reason}`, q.eventId);
    notify(d, { type: "document", severity: "info", title: `Quotation revised: ${q.ref}`, body: `Version ${q.version} drafted. Previous version kept in history.`, link: `/quotations/${id}` });
  });
  return err ? fail(err) : ok(undefined);
}

export function setQuoteStatus(id: string, status: QuoteStatus): Result {
  let err = "";
  mutate((d) => {
    const q = d.quotations.find((x) => x.id === id);
    if (!q) { err = "Not found"; return; }
    if (status === "Internal Review" && !q.body.lines.length) { err = "Add at least one line item first."; return; }
    if (status === "Sent" && !q.reviewApproved) { err = "Internal approval is required before sending."; return; }
    const prev = q.status;
    q.status = status;
    if (status === "Sent") q.sentAt = new Date().toISOString();
    if (status === "Approved" || status === "Rejected") q.decidedAt = new Date().toISOString();
    logAudit(d, "Status", "Quotation", id, `Quotation ${q.ref} ${prev} → ${status}`, q.eventId);
    const sev = status === "Approved" ? "success" : status === "Rejected" ? "warning" : "info";
    if (["Sent", "Approved", "Rejected"].includes(status)) notify(d, { type: "quotation", severity: sev, title: `Quotation ${q.ref} ${status.toLowerCase()}`, body: status === "Sent" ? "Shared with the client (simulated — no email sent)." : `Client decision recorded.`, link: `/quotations/${id}`, dedupeKey: `q:${id}:${q.version}:${status}` });
    if (status === "Sent" || status === "Approved") { /* PDF snapshot is generated below */ }
  });
  if (!err && (status === "Sent")) generateQuotationDoc(id);
  return err ? fail(err) : ok(undefined);
}

export function approveQuoteInternally(id: string) {
  mutate((d) => {
    const q = d.quotations.find((x) => x.id === id); if (!q) return;
    q.reviewApproved = true;
    if (q.status === "Draft" || q.status === "Internal Review") q.status = "Internal Review";
    logAudit(d, "Approved", "Quotation", id, `Quotation ${q.ref} approved internally`, q.eventId);
  });
}

/** Add one client-facing line per committed vendor agreement, with a markup (internal vendor rates are not exposed). */
export function importVendorLines(id: string, markupPct: number): number {
  let added = 0;
  mutate((d) => {
    const q = d.quotations.find((x) => x.id === id); if (!q || LOCKED.includes(q.status)) return;
    const asg = d.assignments.filter((a) => a.eventId === q.eventId && COMMITTED_STATUSES.includes(a.status));
    for (const a of asg) {
      const key = `Services: ${d.vendors.find((v) => v.id === a.vendorId)?.name}`;
      if (q.body.lines.some((l) => l.name === key)) continue;
      const cost = agreementTotal(a.lines);
      q.body.lines.push({ id: uid("ql"), departmentId: a.departmentId, name: key, description: a.scope, qty: 1, unit: "lot", rate: cost + percentOf(cost, markupPct), discountPct: 0, taxRate: 18 });
      added++;
    }
    q.reviewApproved = false;
  });
  return added;
}

export const DEFAULT_MILESTONES = [
  { name: "Booking advance", pct: 30, offsetDays: 0 }, { name: "Pre-event milestone", pct: 40, offsetDays: 14 }, { name: "Final balance", pct: 30, offsetDays: 30 },
];

/** Workflow 3: accepted quotation → booking / sales order snapshot, event confirmed. */
export function convertToBooking(quoteId: string, milestones: { name: string; pct: number; dueDate: string }[]): Result<string> {
  let err = ""; let soId = "";
  mutate((d) => {
    const q = d.quotations.find((x) => x.id === quoteId);
    if (!q) { err = "Not found"; return; }
    if (q.status !== "Approved") { err = "Only a client-approved quotation can be converted."; return; }
    if (Math.round(milestones.reduce((s, m) => s + m.pct, 0) * 100) !== 10000) { err = "Milestone percentages must add up to 100%."; return; }
    const t = computeQuote(q.body);
    soId = uid("so");
    let allocated = 0;
    const ms: Milestone2[] = milestones.map((m, i) => {
      const amount = i === milestones.length - 1 ? t.grandTotal - allocated : Math.round((t.grandTotal * m.pct) / 100);
      allocated += amount;
      return { id: uid("ms"), name: m.name, pct: m.pct, amount, dueDate: m.dueDate };
    });
    d.salesOrders.unshift({ id: soId, ref: nextNumber(d, "salesOrder"), quotationId: q.id, quotationVersion: q.version, eventId: q.eventId, clientId: q.clientId, total: t.grandTotal, taxTotal: t.taxTotal, milestones: ms, createdAt: new Date().toISOString(), body: JSON.parse(JSON.stringify(q.body)) });
    q.status = "Converted"; q.convertedTo = { kind: "booking", salesOrderId: soId };
    const ev = d.events.find((e) => e.id === q.eventId);
    if (ev) {
      if (ev.status === "Enquiry" || ev.status === "Planning") ev.status = "Confirmed";
      const type = d.eventTypes.find((x) => x.id === ev.typeId);
      if (!ev.milestones.length && type) ev.milestones = type.milestoneTemplate.map((m) => ({ id: uid("m"), title: m.title, date: toISODate(addDays(parseISO(ev.startDate), m.offsetDays)), done: false }));
      if (!d.tasks.some((t2) => t2.eventId === ev.id) && type) {
        for (const tt of type.taskTemplate) d.tasks.unshift({ id: uid("t"), title: tt.title, description: "", status: "To Do", priority: "Medium", assigneeId: ev.coordinatorId, departmentId: tt.departmentId, eventId: ev.id, due: toISODate(addDays(parseISO(ev.startDate), tt.offsetDays)), dependsOn: [], checklist: [], comments: [], attachments: [], history: [{ at: new Date().toISOString(), text: "Generated on booking confirmation" }], kind: "task", createdAt: new Date().toISOString() });
      }
      logAudit(d, "Confirmed", "Event", ev.id, `Event ${ev.ref} confirmed via sales order`, ev.id);
    }
    logAudit(d, "Converted", "Quotation", quoteId, `Quotation ${q.ref} converted to sales order`, q.eventId);
    notify(d, { type: "event", severity: "success", title: "Booking confirmed", body: `${ev?.ref}: sales order created with ${ms.length} payment milestones.`, link: `/events/${q.eventId}?tab=finance`, dedupeKey: `book:${soId}` });
  });
  return err ? fail(err) : ok(soId);
}

/* ---------------- invoices ---------------- */
export interface NewInvoiceInput {
  eventId: string; clientId: string; type: InvoiceType; kind: InvoiceKind; salesOrderId?: string; milestoneId?: string; lines: InvoiceLine[]; taxMode: TaxMode;
  dueDate: string; note: string; issue: boolean; refInvoiceId?: string;
}
export function createInvoice(input: NewInvoiceInput): Result<string> {
  let err = ""; let id = "";
  mutate((d) => {
    if (!input.lines.length || input.lines.every((l) => l.amount <= 0)) { err = "Add at least one line with an amount."; return; }
    if (input.type === "Tax Invoice" && !d.settings.taxRegistered) { err = "Company is not tax-registered in settings. Choose Bill of Supply or Proforma."; return; }
    if (input.milestoneId && input.salesOrderId) {
      const so = d.salesOrders.find((s) => s.id === input.salesOrderId);
      const m = so?.milestones.find((x) => x.id === input.milestoneId);
      if (m?.invoiceId) { err = "This milestone is already invoiced."; return; }
    }
    const totals = computeInvoiceTotals(input.lines, input.taxMode);
    id = uid("inv");
    const key = input.type === "Proforma" ? "proforma" : input.type === "Credit Note" ? "creditNote" : "invoice";
    const inv: Invoice = {
      id, ref: nextNumber(d, key), type: input.type, kind: input.kind, eventId: input.eventId, clientId: input.clientId, salesOrderId: input.salesOrderId, milestoneId: input.milestoneId,
      lines: input.lines, taxMode: input.taxMode, ...totals, issueDate: todayISO(), dueDate: input.dueDate, status: input.issue ? "Issued" : "Draft", note: input.note, refInvoiceId: input.refInvoiceId,
    };
    d.invoices.unshift(inv);
    if (input.milestoneId) {
      const m = d.salesOrders.find((s) => s.id === input.salesOrderId)?.milestones.find((x) => x.id === input.milestoneId);
      if (m) m.invoiceId = id;
    }
    logAudit(d, input.issue ? "Issued" : "Drafted", "Invoice", id, `${input.type} ${inv.ref} ${input.issue ? "issued" : "drafted"}`, input.eventId);
    if (input.issue) notify(d, { type: "payment", severity: "info", title: `${input.type} ${inv.ref} issued`, body: `Payment due ${inv.dueDate}.`, link: `/invoices`, dedupeKey: `inv-issued:${id}` });
  });
  if (!err && input.issue) generateInvoiceDoc(id);
  return err ? fail(err) : ok(id);
}

export function issueInvoice(id: string) {
  mutate((d) => {
    const i = d.invoices.find((x) => x.id === id); if (!i || i.status !== "Draft") return;
    i.status = "Issued"; i.issueDate = todayISO();
    logAudit(d, "Issued", "Invoice", id, `${i.type} ${i.ref} issued`, i.eventId);
  });
  generateInvoiceDoc(id);
}

export function voidInvoice(id: string, reason: string): Result {
  let err = "";
  mutate((d) => {
    const i = d.invoices.find((x) => x.id === id); if (!i) { err = "Not found"; return; }
    if (d.payments.some((p) => p.invoiceId === id)) { err = "Payments are recorded against this invoice. Issue a credit note instead of voiding."; return; }
    i.status = "Void"; i.voidReason = reason;
    d.salesOrders.forEach((s) => s.milestones.forEach((m) => { if (m.invoiceId === id) m.invoiceId = undefined; }));
    logAudit(d, "Voided", "Invoice", id, `${i.type} ${i.ref} voided: ${reason}`, i.eventId);
  });
  return err ? fail(err) : ok(undefined);
}

export function issueCreditNote(invoiceId: string, amount: number, reason: string): Result<string> {
  let src: Invoice | undefined;
  mutate((d) => { src = JSON.parse(JSON.stringify(d.invoices.find((x) => x.id === invoiceId) ?? null)) ?? undefined; });
  if (!src) return fail("Invoice not found");
  const s: Invoice = src;
  if (s.status !== "Issued" || s.type === "Credit Note" || s.type === "Proforma") return fail("Credit notes apply to issued tax invoices / bills of supply.");
  if (amount <= 0 || amount > s.total) return fail("Credit amount must be between 0 and the invoice total.");
  return createInvoice({
    eventId: s.eventId, clientId: s.clientId, type: "Credit Note", kind: "Adjustment", salesOrderId: s.salesOrderId, refInvoiceId: s.id,
    lines: [{ id: uid("il"), description: `Credit against ${s.ref}: ${reason}`, amount, taxRate: 0 }], taxMode: "none", dueDate: todayISO(), note: reason, issue: true,
  });
}

export function recordClientPayment(input: { invoiceId?: string; eventId: string; clientId: string; amount: number; method: PayMethod; date: string; reference: string; note: string }): Result<string> {
  let err = ""; let id = "";
  mutate((d) => {
    if (input.amount <= 0) { err = "Enter an amount greater than zero."; return; }
    if (input.invoiceId) {
      const inv = d.invoices.find((x) => x.id === input.invoiceId);
      if (!inv || inv.status !== "Issued") { err = "Payments can only be recorded against issued invoices."; return; }
      const bal = invoiceBalance(d as unknown as DB, inv);
      if (input.amount > bal) { err = `Amount exceeds the invoice balance (${bal / 100}).`; return; }
    }
    id = uid("pay");
    d.payments.unshift({ id, ref: nextNumber(d, "receipt"), direction: "in", category: "client", eventId: input.eventId, partyId: input.clientId, amount: input.amount, method: input.method, date: input.date, reference: input.reference, note: input.note, invoiceId: input.invoiceId });
    logAudit(d, "Recorded", "Payment", id, `Client payment recorded (${input.method})`, input.eventId);
    notify(d, { type: "payment", severity: "success", title: "Client payment recorded", body: `Receipt created. This is a simulated entry — no real transaction occurred.`, link: `/invoices` });
  });
  if (!err) generateReceiptDoc(id);
  return err ? fail(err) : ok(id);
}

export function recordRefund(input: { eventId: string; clientId: string; amount: number; method: PayMethod; reference: string; note: string }): Result<string> {
  let err = ""; let id = "";
  mutate((d) => {
    const received = d.payments.filter((p) => p.eventId === input.eventId && p.category === "client").reduce((s, p) => s + p.amount, 0);
    const refunded = d.payments.filter((p) => p.eventId === input.eventId && p.category === "refund").reduce((s, p) => s + p.amount, 0);
    if (input.amount <= 0 || input.amount > received - refunded) { err = "Refund cannot exceed the net amount received for this event."; return; }
    id = uid("pay");
    d.payments.unshift({ id, ref: nextNumber(d, "vpay"), direction: "out", category: "refund", eventId: input.eventId, partyId: input.clientId, amount: input.amount, method: input.method, date: todayISO(), reference: input.reference, note: input.note });
    logAudit(d, "Refund", "Payment", id, `Refund recorded: ${input.note}`, input.eventId);
  });
  return err ? fail(err) : ok(id);
}

export function saveMilestones(soId: string, items: { id: string; name: string; pct: number; dueDate: string }[]): Result {
  let err = "";
  mutate((d) => {
    const so = d.salesOrders.find((s) => s.id === soId); if (!so) { err = "Not found"; return; }
    if (Math.round(items.reduce((s, m) => s + m.pct, 0) * 100) !== 10000) { err = "Percentages must add up to 100%."; return; }
    let allocated = 0;
    so.milestones = items.map((m, i) => {
      const prev = so.milestones.find((x) => x.id === m.id);
      const amount = prev?.invoiceId ? prev.amount : i === items.length - 1 ? so.total - allocated : Math.round((so.total * m.pct) / 100);
      allocated += amount;
      return { id: m.id, name: m.name, pct: m.pct, amount, dueDate: m.dueDate, invoiceId: prev?.invoiceId };
    });
    logAudit(d, "Updated", "SalesOrder", soId, `Payment schedule of ${so.ref} updated`, so.eventId);
  });
  return err ? fail(err) : ok(undefined);
}
