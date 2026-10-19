import type { DB, DocKind, DocSnapshot, DocumentRecord } from "@/types";
import { uid } from "@/lib/utils";
import { mutate, useDB } from "@/stores/db";
import { type D, logAudit, notify } from "./core";
import {
  eventSummaryDoc, expenseReportDoc, invoiceDoc, purchaseOrderDoc, quotationDoc, receiptDoc, settlementDoc, vendorRequirementDoc,
} from "@/lib/documents/builders";

/** Store a generated document as an immutable, versioned snapshot. Earlier versions are marked superseded. */
export function storeDocument(d: D, kind: DocKind, sourceId: string, snap: DocSnapshot, eventId?: string, partyName = ""): DocumentRecord {
  const prior = d.documents.filter((x) => x.kind === kind && x.sourceId === sourceId);
  const version = Math.max(0, ...prior.map((x) => x.version)) + 1;
  prior.forEach((x) => { x.superseded = true; });
  const rec: DocumentRecord = {
    id: uid("doc"), kind, ref: snap.ref, version, title: snap.title, eventId, partyName, status: snap.status,
    createdAt: new Date().toISOString(), byUserId: d.currentUserId, sourceId, snapshot: { ...snap, version },
  };
  d.documents.unshift(rec);
  logAudit(d, "Generated", "Document", rec.id, `${kind} ${snap.ref} v${version} generated`, eventId);
  if (version > 1) notify(d, { type: "document", severity: "info", title: `Document revised: ${snap.ref}`, body: `${kind} is now version ${version}. Earlier version retained.`, link: "/documents", dedupeKey: `doc:${sourceId}:${kind}:${version}` });
  return rec;
}

type Gen = (db: DB) => { kind: DocKind; sourceId: string; snap: DocSnapshot; eventId?: string; party: string } | null;

function generate(fn: Gen): DocumentRecord | null {
  let out: DocumentRecord | null = null;
  mutate((d) => {
    const g = fn(d as unknown as DB);
    if (g) out = storeDocument(d, g.kind, g.sourceId, g.snap, g.eventId, g.party);
  });
  return out;
}

export const generateQuotationDoc = (id: string) => generate((db) => {
  const q = db.quotations.find((x) => x.id === id); if (!q) return null;
  return { kind: "Client Quotation", sourceId: id, snap: quotationDoc(db, q), eventId: q.eventId, party: db.clients.find((c) => c.id === q.clientId)?.name ?? "" };
});
export const generateRequirementDoc = (id: string) => {
  const rec = generate((db) => {
    const a = db.assignments.find((x) => x.id === id); if (!a) return null;
    return { kind: "Vendor Requirement", sourceId: id, snap: vendorRequirementDoc(db, a), eventId: a.eventId, party: db.vendors.find((v) => v.id === a.vendorId)?.name ?? "" };
  });
  if (rec) mutate((d) => { d.assignments.find((x) => x.id === id)?.requirementDocIds.push(rec.id); });
  return rec;
};
export const generatePODoc = (id: string) => generate((db) => {
  const a = db.assignments.find((x) => x.id === id); if (!a) return null;
  return { kind: "Purchase / Work Order", sourceId: id, snap: purchaseOrderDoc(db, a), eventId: a.eventId, party: db.vendors.find((v) => v.id === a.vendorId)?.name ?? "" };
});
export const generateInvoiceDoc = (id: string) => generate((db) => {
  const i = db.invoices.find((x) => x.id === id); if (!i) return null;
  return { kind: i.type === "Credit Note" ? "Credit Note" : "Client Invoice", sourceId: id, snap: invoiceDoc(db, i), eventId: i.eventId, party: db.clients.find((c) => c.id === i.clientId)?.name ?? "" };
});
export const generateReceiptDoc = (id: string) => generate((db) => {
  const p = db.payments.find((x) => x.id === id); if (!p) return null;
  const party = p.category === "vendor" ? db.vendors.find((v) => v.id === p.partyId)?.name : db.clients.find((c) => c.id === p.partyId)?.name;
  return { kind: "Payment Receipt", sourceId: id, snap: receiptDoc(db, p), eventId: p.eventId, party: party ?? "" };
});
export const generateExpenseReport = (eventId: string) => generate((db) => ({ kind: "Expense Report", sourceId: eventId, snap: expenseReportDoc(db, eventId), eventId, party: "Internal" }));
export const generateEventSummary = (eventId: string) => generate((db) => ({ kind: "Event Summary", sourceId: eventId, snap: eventSummaryDoc(db, eventId), eventId, party: "Internal" }));
export const generateSettlement = (eventId: string) => generate((db) => ({ kind: "Settlement Statement", sourceId: eventId, snap: settlementDoc(db, eventId), eventId, party: db.clients.find((c) => c.id === db.events.find((e) => e.id === eventId)?.clientId)?.name ?? "" }));

export const getDocument = (id: string) => useDB.getState().documents.find((d) => d.id === id);
