import type { DB, DocumentRecord } from "@/types";
import { buildSeed } from "./seed";
import { invoiceDoc, quotationDoc, receiptDoc, vendorRequirementDoc, purchaseOrderDoc } from "@/lib/documents/builders";

/** Seed dataset plus a handful of already-generated documents so the Document Centre is populated. */
export function buildDemoDB(): DB {
  const db = buildSeed();
  const docs: DocumentRecord[] = [];
  let n = 0;
  const add = (kind: DocumentRecord["kind"], ref: string, version: number, title: string, eventId: string, partyName: string, status: string, snapshot: DocumentRecord["snapshot"], sourceId: string) =>
    docs.push({ id: `doc${++n}`, kind, ref, version, title, eventId, partyName, status, createdAt: new Date(Date.now() - n * 86400000).toISOString(), byUserId: "u3", sourceId, snapshot });
  for (const q of db.quotations.filter((x) => x.status !== "Draft")) {
    add("Client Quotation", q.ref, q.version, q.title, q.eventId, db.clients.find((c) => c.id === q.clientId)?.name ?? "", q.status, quotationDoc(db, q), q.id);
  }
  for (const i of db.invoices.slice(0, 8)) {
    add("Client Invoice", i.ref, 1, `${i.type} ${i.ref}`, i.eventId, db.clients.find((c) => c.id === i.clientId)?.name ?? "", i.status, invoiceDoc(db, i), i.id);
  }
  for (const p of db.payments.filter((x) => x.category === "client").slice(0, 3)) {
    add("Payment Receipt", p.ref, 1, `Receipt ${p.ref}`, p.eventId, db.clients.find((c) => c.id === p.partyId)?.name ?? "", "Issued", receiptDoc(db, p), p.id);
  }
  for (const a of db.assignments.slice(0, 5)) {
    const v = db.vendors.find((x) => x.id === a.vendorId)?.name ?? "";
    add("Vendor Requirement", a.ref + "/REQ", 1, `Requirement – ${a.scope}`, a.eventId, v, a.status, vendorRequirementDoc(db, a), a.id);
    if (a.poRef) add("Purchase / Work Order", a.poRef, 1, `Work order – ${a.scope}`, a.eventId, v, a.status, purchaseOrderDoc(db, a), a.id);
  }
  db.documents = docs;
  return db;
}
