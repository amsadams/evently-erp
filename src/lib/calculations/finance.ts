import type { DB, EventRecord, Invoice, Money, VendorAssignment, Quotation } from "@/types";
import { todayISO } from "../formatting";
import { agreementTotal, computeQuote } from "./quote";

/** Statuses at which a vendor agreement is a commitment of company money. */
export const COMMITTED_STATUSES = ["Confirmed", "Approved", "Ordered", "Partially Completed", "Completed"];

export const quoteTotal = (q: Quotation): Money => computeQuote(q.body).grandTotal;
export const assignmentTotal = (a: VendorAssignment): Money => agreementTotal(a.lines);

export function invoicePaid(db: DB, invoiceId: string): Money {
  return db.payments.filter((p) => p.invoiceId === invoiceId && p.category === "client").reduce((a, p) => a + p.amount, 0);
}
export type InvoiceDisplayStatus = "Draft" | "Issued" | "Partially Paid" | "Paid" | "Overdue" | "Void";
export function invoiceStatus(db: DB, inv: Invoice): InvoiceDisplayStatus {
  if (inv.status === "Void") return "Void";
  if (inv.status === "Draft") return "Draft";
  if (inv.type === "Credit Note") return "Issued";
  const paid = invoicePaid(db, inv.id);
  if (paid >= inv.total && inv.total > 0) return "Paid";
  if (inv.dueDate < todayISO()) return "Overdue";
  if (paid > 0) return "Partially Paid";
  return "Issued";
}
export const invoiceBalance = (db: DB, inv: Invoice): Money =>
  inv.status === "Issued" && inv.type !== "Credit Note" ? Math.max(0, inv.total - invoicePaid(db, inv.id)) : 0;

export function billPaid(db: DB, billId: string): Money {
  return db.payments.filter((p) => p.billId === billId && p.category === "vendor").reduce((a, p) => a + p.amount, 0);
}

export interface EventFinancials {
  basis: "Sales order" | "Approved quotation" | "Draft quotation" | "Event budget" | "None";
  estimatedRevenue: Money; // ESTIMATED: contract / quote value
  invoiced: Money; // INVOICED: issued tax invoices net of credit notes (proforma excluded)
  requested: Money; // proforma payment requests (not revenue)
  received: Money; // PAID: cash in, net of refunds
  receivable: Money; // OUTSTANDING: issued tax invoices not yet settled
  contractOutstanding: Money; // estimated revenue - received
  vendorCommitted: Money; // COMMITTED
  vendorBilled: Money; // INVOICED by vendors (approved bills)
  vendorPaid: Money; // PAID to vendors
  vendorPayable: Money; // OUTSTANDING: approved bills not yet paid
  vendorAdvanceUnadjusted: Money; // vendor payments not yet allocated to a bill
  expensesRecorded: Money;
  expensesPaid: Money;
  estimatedProfit: Money;
  estimatedMargin: number;
  actualResult: Money;
  actualMargin: number;
  cashPosition: Money;
}

export function eventFinancials(db: DB, event: EventRecord): EventFinancials {
  const so = db.salesOrders.find((s) => s.eventId === event.id);
  const quotes = db.quotations.filter((q) => q.eventId === event.id && q.status !== "Rejected" && q.status !== "Expired");
  const approved = quotes.filter((q) => q.status === "Approved" || q.status === "Converted").sort((a, b) => b.version - a.version)[0];
  const draft = [...quotes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  let basis: EventFinancials["basis"] = "None";
  let estimatedRevenue = 0;
  if (so) { basis = "Sales order"; estimatedRevenue = so.total; }
  else if (approved) { basis = "Approved quotation"; estimatedRevenue = quoteTotal(approved); }
  else if (draft) { basis = "Draft quotation"; estimatedRevenue = quoteTotal(draft); }
  else if (event.budget) { basis = "Event budget"; estimatedRevenue = event.budget; }

  const invs = db.invoices.filter((i) => i.eventId === event.id && i.status === "Issued");
  const taxInvs = invs.filter((i) => i.type === "Tax Invoice" || i.type === "Bill of Supply");
  const invoiced = taxInvs.reduce((a, i) => a + i.total, 0) - invs.filter((i) => i.type === "Credit Note").reduce((a, i) => a + i.total, 0);
  const requested = invs.filter((i) => i.type === "Proforma").reduce((a, i) => a + i.total, 0);
  const pays = db.payments.filter((p) => p.eventId === event.id);
  const received = pays.filter((p) => p.category === "client").reduce((a, p) => a + p.amount, 0) - pays.filter((p) => p.category === "refund").reduce((a, p) => a + p.amount, 0);
  const paidOnTax = pays.filter((p) => p.category === "client" && p.invoiceId && taxInvs.some((i) => i.id === p.invoiceId)).reduce((a, p) => a + p.amount, 0);
  const receivable = Math.max(0, taxInvs.reduce((a, i) => a + i.total, 0) - paidOnTax);

  const ass = db.assignments.filter((a) => a.eventId === event.id);
  const vendorCommitted = ass.filter((a) => COMMITTED_STATUSES.includes(a.status)).reduce((s, a) => s + assignmentTotal(a), 0);
  const bills = db.bills.filter((b) => b.eventId === event.id && b.status === "Approved");
  const vendorBilled = bills.reduce((a, b) => a + b.amount, 0);
  const vendorPays = pays.filter((p) => p.category === "vendor");
  const vendorPaid = vendorPays.reduce((a, p) => a + p.amount, 0);
  const paidAgainstBills = vendorPays.filter((p) => p.billId && bills.some((b) => b.id === p.billId)).reduce((a, p) => a + p.amount, 0);
  const vendorPayable = Math.max(0, vendorBilled - paidAgainstBills);
  const vendorAdvanceUnadjusted = vendorPays.filter((p) => !p.billId).reduce((a, p) => a + p.amount, 0);

  const exps = db.expenses.filter((e) => e.eventId === event.id && e.status !== "Rejected");
  const expensesRecorded = exps.reduce((a, e) => a + e.amount, 0);
  const expensesPaid = exps.filter((e) => e.status === "Paid").reduce((a, e) => a + e.amount, 0);

  const estimatedProfit = estimatedRevenue - vendorCommitted - expensesRecorded;
  const actualResult = invoiced - vendorBilled - expensesRecorded;
  return {
    basis, estimatedRevenue, invoiced, requested, received, receivable, contractOutstanding: Math.max(0, estimatedRevenue - received),
    vendorCommitted, vendorBilled, vendorPaid, vendorPayable, vendorAdvanceUnadjusted, expensesRecorded, expensesPaid,
    estimatedProfit, estimatedMargin: estimatedRevenue ? (estimatedProfit / estimatedRevenue) * 100 : 0,
    actualResult, actualMargin: invoiced ? (actualResult / invoiced) * 100 : 0,
    cashPosition: received - vendorPaid - expensesPaid,
  };
}

export function departmentSpend(db: DB, eventId: string): Record<string, Money> {
  const out: Record<string, Money> = {};
  for (const a of db.assignments.filter((x) => x.eventId === eventId && COMMITTED_STATUSES.includes(x.status)))
    out[a.departmentId] = (out[a.departmentId] ?? 0) + assignmentTotal(a);
  for (const e of db.expenses.filter((x) => x.eventId === eventId && x.departmentId && x.status !== "Rejected"))
    out[e.departmentId!] = (out[e.departmentId!] ?? 0) + e.amount;
  return out;
}
