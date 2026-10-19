import type { DB, DocSnapshot, Invoice, Payment, Quotation, VendorAssignment } from "@/types";
import { computeQuote, agreementLineAgreed, agreementTotal, agreementQuotedTotal } from "../calculations/quote";
import { assignmentTotal, eventFinancials, invoicePaid } from "../calculations/finance";
import { fmtDate, moneyPlain } from "../formatting";

/** jsPDF core fonts do not include the rupee glyph, so documents use "Rs.". */
export const pdfMoney = (m: number) => "Rs. " + moneyPlain(m);

const companyParty = (db: DB, label = "From") => ({
  label,
  lines: [db.settings.legalName, ...db.settings.address.split(",").map((s) => s.trim()).reduce<string[]>((a, s, i) => { if (i % 2 === 0) a.push(s); else a[a.length - 1] += ", " + s; return a; }, []),
    `GSTIN: ${db.settings.gstin}`, `${db.settings.phone} | ${db.settings.email}`],
});

const clientParty = (db: DB, clientId: string, label = "Billed to") => {
  const c = db.clients.find((x) => x.id === clientId);
  return { label, lines: c ? [c.name, c.address, c.gstin ? `GSTIN: ${c.gstin}` : "", `${c.phone} | ${c.email}`].filter(Boolean) : ["—"] };
};
const vendorParty = (db: DB, vendorId: string, label = "Vendor") => {
  const v = db.vendors.find((x) => x.id === vendorId);
  return { label, lines: v ? [v.name, v.city, v.gstin ? `GSTIN: ${v.gstin}` : "", `${v.contacts[0]?.name ?? ""} | ${v.phone}`].filter(Boolean) : ["—"] };
};
const eventMeta = (db: DB, eventId: string): [string, string][] => {
  const e = db.events.find((x) => x.id === eventId);
  return e ? [["Event", `${e.ref} - ${e.title}`], ["Event date", e.startDate === e.endDate ? fmtDate(e.startDate) : `${fmtDate(e.startDate)} to ${fmtDate(e.endDate)}`], ["Venue", `${e.venue}, ${e.city}`]] : [];
};
const today = () => fmtDate(new Date().toISOString().slice(0, 10));

/* ---------------- client quotation ---------------- */
export function quotationDoc(db: DB, q: Quotation): DocSnapshot {
  const t = computeQuote(q.body);
  const rows: string[][] = [];
  const byDept = new Map<string, number[]>();
  q.body.lines.forEach((l, i) => byDept.set(l.departmentId, [...(byDept.get(l.departmentId) ?? []), i]));
  let n = 1;
  for (const [dp, idxs] of byDept) {
    rows.push([`**${db.departments.find((d) => d.id === dp)?.name ?? "General"}`, "", "", "", "", "", "", ""]);
    for (const i of idxs) {
      const l = q.body.lines[i]; const c = t.lines[i];
      rows.push([String(n++), l.name + (l.description ? `\n${l.description}` : ""), String(l.qty), l.unit, moneyPlain(l.rate), l.discountPct ? `${l.discountPct}%` : "-", q.body.taxMode === "none" ? "-" : `${l.taxRate}%`, moneyPlain(c.net)]);
    }
  }
  q.body.charges.forEach((c, i) => rows.push([String(n++), c.label, "1", "lot", moneyPlain(c.amount), "-", q.body.taxMode === "none" ? "-" : `${c.taxRate}%`, moneyPlain(t.charges[i].net)]));
  const totals: DocSnapshot["totals"] = [["Sub-total", pdfMoney(t.grossTotal + t.chargesTotal - (q.body.taxMode === "inclusive" ? 0 : 0))]];
  if (t.discountTotal) totals.push(["Discount", "- " + pdfMoney(t.discountTotal)]);
  if (q.body.taxMode === "inclusive") totals.push(["Taxable value (tax included in rates)", pdfMoney(t.taxable)]);
  for (const b of t.taxBreakdown.filter((x) => x.rate > 0)) totals.push([`GST @ ${b.rate}% on ${moneyPlain(b.taxable)}`, pdfMoney(b.tax)]);
  totals.push(["Total", pdfMoney(t.grandTotal), true]);
  totals.push([`Advance to confirm (${q.body.advancePct}%)`, pdfMoney(t.advanceAmount)]);
  // sub-total is simpler to present as net-of-discount value
  totals[0] = ["Sub-total (after discounts)", pdfMoney(t.grossTotal - t.discountTotal + t.chargesTotal - (q.body.taxMode === "inclusive" ? 0 : 0))];
  return {
    title: q.title, docLabel: "QUOTATION", ref: q.ref, version: q.version, date: today(), status: q.status,
    parties: [companyParty(db), clientParty(db, q.clientId, "Prepared for")],
    meta: [...eventMeta(db, q.eventId), ["Valid until", fmtDate(q.validUntil)], ["Tax treatment", q.body.taxMode === "exclusive" ? "Taxes extra" : q.body.taxMode === "inclusive" ? "Tax inclusive" : "No tax applied"]],
    tables: [{ columns: ["#", "Description", "Qty", "Unit", "Rate", "Disc.", "Tax", "Amount"], rows, align: ["left", "left", "right", "left", "right", "right", "right", "right"] }],
    totals,
    notes: [{ heading: "Payment terms", text: q.body.paymentTerms }, { heading: "Terms & conditions", text: q.body.terms }, ...(q.body.notes ? [{ heading: "Notes", text: q.body.notes }] : [])],
    signatures: ["Authorised signatory - " + db.settings.name, "Client acceptance (sign & date)"],
    disclaimer: "This is a quotation / estimate and not a tax invoice. Prices are subject to the stated validity.",
  };
}

/* ---------------- vendor requirement (RFQ / scope) ---------------- */
export function vendorRequirementDoc(db: DB, a: VendorAssignment): DocSnapshot {
  const priced = ["Confirmed", "Approved", "Ordered", "Partially Completed", "Completed"].includes(a.status);
  const dept = db.departments.find((d) => d.id === a.departmentId)?.name ?? "";
  const rows = a.lines.map((l, i) => priced
    ? [String(i + 1), l.name, String(l.qty), l.unit, l.responsible === "vendor" ? "Vendor" : "Internal team", moneyPlain(l.agreedRate), moneyPlain(agreementLineAgreed(l)), l.remarks || "-"]
    : [String(i + 1), l.name, String(l.qty), l.unit, l.responsible === "vendor" ? "Vendor" : "Internal team", l.remarks || "-"]);
  return {
    title: `Requirement list - ${a.scope}`, docLabel: priced ? "VENDOR REQUIREMENT - CONFIRMED SCOPE" : "VENDOR REQUIREMENT / REQUEST FOR QUOTATION", ref: a.ref + "/REQ", version: a.version, date: today(), status: a.status,
    parties: [companyParty(db, "Issued by"), vendorParty(db, a.vendorId, "Issued to")],
    meta: [...eventMeta(db, a.eventId), ["Department", dept], ["Setup / arrival", a.setupTime || "-"], ["Deadline", fmtDate(a.deadline)], ["Document status", a.status]],
    tables: [{
      heading: "Scope of work",
      columns: priced ? ["#", "Item / service", "Qty", "Unit", "By", "Agreed rate", "Amount", "Remarks"] : ["#", "Item / service", "Qty", "Unit", "By", "Remarks"],
      rows, align: priced ? ["left", "left", "right", "left", "left", "right", "right", "left"] : ["left", "left", "right", "left", "left", "left"],
    }],
    totals: priced ? [["Agreed value (excl. applicable taxes)", pdfMoney(agreementTotal(a.lines)), true]] : [],
    notes: [
      { heading: "Scope summary", text: a.scope },
      { heading: "Delivery & access", text: `${a.deliveryDetails}\n${a.accessInstructions}`.trim() },
      ...(a.schedule.length ? [{ heading: "Payment schedule", text: a.schedule.map((s) => `${s.label}: ${s.pct}% by ${fmtDate(s.dueDate)}`).join("\n") }] : []),
      { heading: "Terms", text: a.terms },
    ],
    signatures: ["For " + db.settings.name, "Vendor acknowledgement"],
    disclaimer: priced ? "Confirmed scope snapshot. Any change after confirmation is issued as a new version." : "This request does not constitute an order or agreement on price. Please respond with your quotation by the deadline.",
  };
}

/* ---------------- purchase / work order ---------------- */
export function purchaseOrderDoc(db: DB, a: VendorAssignment): DocSnapshot {
  const rows = a.lines.map((l, i) => [String(i + 1), l.name, String(l.qty), l.unit, moneyPlain(l.agreedRate), l.discountPct ? `${l.discountPct}%` : "-", moneyPlain(agreementLineAgreed(l))]);
  return {
    title: `Work order - ${a.scope}`, docLabel: "PURCHASE / WORK ORDER", ref: a.poRef ?? a.ref, version: a.version, date: today(), status: a.status,
    parties: [companyParty(db, "Ordered by"), vendorParty(db, a.vendorId, "Vendor")],
    meta: [...eventMeta(db, a.eventId), ["Agreement", a.ref], ["Setup / arrival", a.setupTime || "-"], ["Delivery deadline", fmtDate(a.deadline)]],
    tables: [{ columns: ["#", "Item / service", "Qty", "Unit", "Agreed rate", "Disc.", "Amount"], rows, align: ["left", "left", "right", "left", "right", "right", "right"] }],
    totals: [["Quoted value", pdfMoney(agreementQuotedTotal(a.lines))], ["Agreed order value (excl. taxes)", pdfMoney(agreementTotal(a.lines)), true]],
    notes: [
      { heading: "Delivery & access", text: `${a.deliveryDetails}\n${a.accessInstructions}`.trim() },
      { heading: "Payment schedule", text: a.schedule.map((s) => `${s.label}: ${s.pct}% (${pdfMoney(Math.round((agreementTotal(a.lines) * s.pct) / 100))}) by ${fmtDate(s.dueDate)}`).join("\n") || "As agreed" },
      { heading: "Terms", text: a.terms + "\nVendor tax invoices must reference this order number. Changes require a written change order." },
    ],
    signatures: ["Authorised signatory - " + db.settings.name, "Vendor acceptance (sign & date)"],
    disclaimer: "Vendor invoices are vendor-issued documents; this order is not a tax invoice.",
  };
}

/* ---------------- client invoice / proforma / credit note ---------------- */
export function invoiceDoc(db: DB, inv: Invoice): DocSnapshot {
  const label = inv.type === "Proforma" ? "PROFORMA INVOICE (PAYMENT REQUEST)" : inv.type === "Tax Invoice" ? "TAX INVOICE" : inv.type === "Bill of Supply" ? "BILL OF SUPPLY" : "CREDIT NOTE";
  const rows = inv.lines.map((l, i) => [String(i + 1), l.description, inv.taxMode === "none" ? "-" : `${l.taxRate}%`, moneyPlain(l.amount)]);
  const paid = invoicePaid(db, inv.id);
  const totals: DocSnapshot["totals"] = [["Taxable value", pdfMoney(inv.subtotal)]];
  if (inv.tax) totals.push([`GST (${inv.lines[0]?.taxRate ?? 18}%)`, pdfMoney(inv.tax)]);
  totals.push(["Total", pdfMoney(inv.total), true]);
  if (inv.type !== "Credit Note") { totals.push(["Received", pdfMoney(paid)]); totals.push(["Balance due", pdfMoney(Math.max(0, inv.total - paid)), true]); }
  const so = db.salesOrders.find((s) => s.id === inv.salesOrderId);
  return {
    title: `${inv.type} ${inv.ref}`, docLabel: label, ref: inv.ref, version: 1, date: fmtDate(inv.issueDate), status: inv.status,
    parties: [companyParty(db), clientParty(db, inv.clientId)],
    meta: [...eventMeta(db, inv.eventId), ["Invoice type", `${inv.type} - ${inv.kind}`], ["Due date", fmtDate(inv.dueDate)], ...(so ? [["Sales order", so.ref] as [string, string]] : []), ["Place of supply", db.events.find((e) => e.id === inv.eventId)?.city ?? "-"]],
    tables: [{ columns: ["#", "Description", "Tax", "Amount"], rows, align: ["left", "left", "right", "right"] }],
    totals,
    notes: [{ heading: "Bank details", text: db.settings.bank }, ...(inv.note ? [{ heading: "Note", text: inv.note }] : [])],
    signatures: ["Authorised signatory - " + db.settings.name],
    disclaimer: inv.type === "Proforma" ? "This is a proforma invoice requesting payment. It is NOT a tax invoice and is not proof of payment received."
      : inv.type === "Credit Note" ? "Credit note adjusting a previously issued invoice."
        : db.settings.taxRegistered ? "Demo document. Verify tax particulars with your accountant before production use." : "Not tax-registered: confirm applicable document type with your accountant.",
  };
}

/* ---------------- payment receipt ---------------- */
export function receiptDoc(db: DB, p: Payment): DocSnapshot {
  const inv = db.invoices.find((i) => i.id === p.invoiceId);
  return {
    title: `Payment receipt ${p.ref}`, docLabel: "PAYMENT RECEIPT", ref: p.ref, version: 1, date: fmtDate(p.date), status: "Issued",
    parties: [companyParty(db, "Received by"), p.category === "vendor" ? vendorParty(db, p.partyId, "Paid to") : clientParty(db, p.partyId, "Received from")],
    meta: [...eventMeta(db, p.eventId), ["Payment method", p.method], ["Reference / UTR", p.reference || "-"]],
    tables: [{ columns: ["Applied to", "Amount"], rows: [[inv ? `${inv.type} ${inv.ref}` : "Advance / on account", moneyPlain(p.amount)]], align: ["left", "right"] }],
    totals: [[p.direction === "in" ? "Amount received" : "Amount paid", pdfMoney(p.amount), true]],
    notes: p.note ? [{ heading: "Note", text: p.note }] : [], signatures: ["Authorised signatory - " + db.settings.name],
    disclaimer: "This receipt acknowledges a payment and is not a tax invoice.",
  };
}

/* ---------------- expense report ---------------- */
export function expenseReportDoc(db: DB, eventId: string): DocSnapshot {
  const ev = db.events.find((e) => e.id === eventId)!;
  const exps = db.expenses.filter((e) => e.eventId === eventId);
  return {
    title: `Expense report - ${ev.title}`, docLabel: "EXPENSE REPORT", ref: `EXR/${ev.ref}`, version: 1, date: today(), status: "Generated",
    parties: [companyParty(db, "Company")], meta: eventMeta(db, eventId),
    tables: [{ columns: ["Date", "Category", "Payee", "Method", "Status", "Amount"], rows: exps.map((e) => [fmtDate(e.date), e.category, e.payee, e.method, e.status, moneyPlain(e.amount)]), align: ["left", "left", "left", "left", "left", "right"] }],
    totals: [["Total expenses (excl. rejected)", pdfMoney(exps.filter((e) => e.status !== "Rejected").reduce((a, e) => a + e.amount, 0)), true]],
    notes: [], signatures: ["Prepared by", "Approved by"],
  };
}

/* ---------------- event summary ---------------- */
export function eventSummaryDoc(db: DB, eventId: string): DocSnapshot {
  const ev = db.events.find((e) => e.id === eventId)!;
  const client = db.clients.find((c) => c.id === ev.clientId);
  const f = eventFinancials(db, ev);
  return {
    title: `Event summary - ${ev.title}`, docLabel: "EVENT SUMMARY", ref: `EVS/${ev.ref}`, version: 1, date: today(), status: ev.status,
    parties: [companyParty(db, "Prepared by"), { label: "Client", lines: [client?.name ?? "-", client?.phone ?? ""] }],
    meta: [...eventMeta(db, eventId), ["Status", ev.status], ["Guests", String(ev.guests)], ["Coordinator", db.users.find((u) => u.id === ev.coordinatorId)?.name ?? "-"]],
    tables: [
      { heading: "Functions", columns: ["Function", "Date", "Time", "Guests"], rows: ev.functions.map((x) => [x.name, fmtDate(x.date), `${x.startTime}-${x.endTime}`, String(x.guests)]) },
      { heading: "Vendors", columns: ["Vendor", "Department", "Status", "Agreed value"], rows: db.assignments.filter((a) => a.eventId === eventId).map((a) => [db.vendors.find((v) => v.id === a.vendorId)?.name ?? "", db.departments.find((d) => d.id === a.departmentId)?.name ?? "", a.status, moneyPlain(assignmentTotal(a))]), align: ["left", "left", "left", "right"] },
      { heading: "Financial position", columns: ["Measure", "Basis", "Amount"], rows: [["Revenue", "Estimated (" + f.basis + ")", moneyPlain(f.estimatedRevenue)], ["Invoiced", "Invoiced", moneyPlain(f.invoiced)], ["Received", "Paid", moneyPlain(f.received)], ["Vendor cost", "Committed", moneyPlain(f.vendorCommitted)], ["Expenses", "Recorded", moneyPlain(f.expensesRecorded)], ["Estimated profit", "Estimated", moneyPlain(f.estimatedProfit)]], align: ["left", "left", "right"] },
    ],
    totals: [], notes: ev.description ? [{ heading: "Overview", text: ev.description }] : [], signatures: [],
  };
}

/* ---------------- settlement statement ---------------- */
export function settlementDoc(db: DB, eventId: string): DocSnapshot {
  const ev = db.events.find((e) => e.id === eventId)!;
  const f = eventFinancials(db, ev);
  const rows: string[][] = [
    ["Client", "Contract value (estimated)", moneyPlain(f.estimatedRevenue)], ["Client", "Invoiced (tax invoices, net of credit notes)", moneyPlain(f.invoiced)], ["Client", "Received (paid)", moneyPlain(f.received)],
    ["Client", "Receivable outstanding", moneyPlain(f.receivable)], ["Vendors", "Committed (work orders)", moneyPlain(f.vendorCommitted)], ["Vendors", "Billed (approved bills)", moneyPlain(f.vendorBilled)],
    ["Vendors", "Paid", moneyPlain(f.vendorPaid)], ["Vendors", "Payable outstanding", moneyPlain(f.vendorPayable)], ["Expenses", "Recorded", moneyPlain(f.expensesRecorded)], ["Expenses", "Paid", moneyPlain(f.expensesPaid)],
  ];
  return {
    title: `Settlement statement - ${ev.title}`, docLabel: "EVENT SETTLEMENT STATEMENT", ref: `SET/${ev.ref}`, version: 1, date: today(), status: ev.closure ? "Closed" : "Draft",
    parties: [companyParty(db, "Prepared by"), clientParty(db, ev.clientId, "Client")], meta: eventMeta(db, eventId),
    tables: [{ columns: ["Side", "Measure", "Amount"], rows, align: ["left", "left", "right"] }],
    totals: [["Actual result (invoiced - vendor bills - expenses)", pdfMoney(f.actualResult), true], ["Actual margin", `${f.actualMargin.toFixed(1)}%`], ["Estimated profit (committed basis)", pdfMoney(f.estimatedProfit)], ["Net cash position (received - paid)", pdfMoney(f.cashPosition)]],
    notes: [{ heading: "Definitions", text: "Estimated = contract value less committed vendor cost and recorded expenses. Actual = invoiced revenue less approved vendor bills and recorded expenses. Cash = received less paid." }],
    signatures: ["Prepared by - Finance", "Approved by - Management"],
  };
}
