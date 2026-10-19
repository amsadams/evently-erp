"use client";
import * as React from "react";
import Link from "next/link";
import { FileText, Plus, Receipt, Undo2 } from "lucide-react";
import { useDB } from "@/stores/db";
import { openCreate } from "@/stores/ui";
import { useCurrentUser } from "@/hooks/use-app";
import { departmentSpend, eventFinancials, invoiceBalance, invoicePaid, invoiceStatus, quoteTotal } from "@/lib/calculations/finance";
import { fmtDate, money } from "@/lib/formatting";
import { setExpenseStatus } from "@/services/ops";
import { generateInvoiceDoc, generateReceiptDoc } from "@/services/documents";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Progress, Stat, StatusBadge } from "@/components/ui/primitives";
import { usePreview } from "@/components/documents/doc-preview";
import { CreditNoteDialog, InvoiceDialog, PaymentDialog, RefundDialog } from "@/features/finance/billing";
import { MoneyBarChart } from "@/components/charts/charts";
import type { DB, Invoice } from "@/types";
import { cn } from "@/lib/utils";

export function FinanceTab({ eventId }: { eventId: string }) {
  const db = useDB() as unknown as DB;
  const { can } = useCurrentUser();
  const preview = usePreview();
  const [invOpen, setInvOpen] = React.useState<{ milestoneId?: string } | null>(null);
  const [payInv, setPayInv] = React.useState<Invoice | null>(null);
  const [cnInv, setCnInv] = React.useState<Invoice | null>(null);
  const [refundOpen, setRefundOpen] = React.useState(false);
  const ev = db.events.find((e) => e.id === eventId)!;
  const f = eventFinancials(db, ev);
  const so = db.salesOrders.find((s) => s.eventId === eventId);
  const quotes = db.quotations.filter((q) => q.eventId === eventId);
  const invoices = db.invoices.filter((i) => i.eventId === eventId);
  const payments = db.payments.filter((p) => p.eventId === eventId);
  const expenses = db.expenses.filter((e) => e.eventId === eventId);
  const spend = departmentSpend(db, eventId);
  const canFin = can("finance.write");
  const canSee = can("finance.read");

  if (!canSee) return <Alert tone="warning" title="Finance details are restricted">Your role does not include finance access. Switch to Manager or Finance to view this tab.</Alert>;

  const chart = ev.plans.map((p) => ({ name: (db.departments.find((d) => d.id === p.departmentId)?.name ?? "").split(" ")[0], Budget: p.budget, Actual: spend[p.departmentId] ?? 0 }));
  const showDoc = (id: string, kind: "invoice" | "receipt") => { const d = kind === "invoice" ? generateInvoiceDoc(id) : generateReceiptDoc(id); if (d) preview.show(d.snapshot); };

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Estimated revenue" value={money(f.estimatedRevenue)} basis={f.basis} />
        <Stat label="Invoiced (tax invoices)" value={money(f.invoiced)} basis="Invoiced" sub={f.requested ? `+ ${money(f.requested)} requested (proforma)` : undefined} />
        <Stat label="Received" value={money(f.received)} basis="Paid" tone="success" sub={`${money(f.receivable)} receivable`} />
        <Stat label="Vendor committed" value={money(f.vendorCommitted)} basis="Committed" sub={`Billed ${money(f.vendorBilled)} · Paid ${money(f.vendorPaid)}`} />
        <Stat label="Expenses" value={money(f.expensesRecorded)} basis="Recorded" sub={`${money(f.expensesPaid)} paid`} />
        <Stat label="Estimated profit" value={money(f.estimatedProfit)} basis="Estimated" tone={f.estimatedProfit < 0 ? "danger" : "success"} sub={`${f.estimatedMargin.toFixed(1)}%`} />
        <Stat label="Actual result" value={money(f.actualResult)} basis="Invoiced − bills − exp." tone={f.actualResult < 0 ? "danger" : undefined} sub={f.invoiced ? `${f.actualMargin.toFixed(1)}% margin` : "Awaiting invoices"} />
        <Stat label="Net cash position" value={money(f.cashPosition)} basis="Cash" sub="Received − paid out" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Client quotations" action={can("quotes.write") && <Button variant="outline" size="sm" onClick={() => openCreate("quotation", { eventId })}><Plus className="h-3.5 w-3.5" />New</Button>} />
          {quotes.length === 0 ? <EmptyState title="No quotation yet" description="Build a client quotation to confirm this booking." /> : <ul className="divide-y divide-line">{quotes.map((q) => (
            <li key={q.id}><Link href={`/quotations/${q.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-canvas"><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{q.ref} <span className="text-xs text-muted">v{q.version}</span></span><span className="text-xs text-muted">Valid until {fmtDate(q.validUntil)}</span></span><span className="text-sm tabular-nums">{money(quoteTotal(q))}</span><StatusBadge status={q.status} /></Link></li>
          ))}</ul>}
        </Card>
        <Card>
          <CardHeader title="Payment schedule" description={so ? `${so.ref} · ${money(so.total)}` : "Created when a quotation is converted to a booking"} />
          {!so ? <EmptyState title="No sales order yet" description="Approve a quotation and convert it to a booking to generate payment milestones." /> : (
            <ul className="divide-y divide-line">{so.milestones.map((m) => {
              const inv = invoices.find((i) => i.id === m.invoiceId);
              return (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium">{m.name} <span className="text-xs text-muted">{m.pct}%</span></p><p className="text-xs text-muted">Due {fmtDate(m.dueDate)}{inv ? ` · ${inv.ref}` : ""}</p></div>
                  <span className="text-sm font-semibold tabular-nums">{money(m.amount)}</span>
                  {inv ? <StatusBadge status={invoiceStatus(db, inv)} /> : canFin ? <Button size="sm" variant="outline" onClick={() => setInvOpen({ milestoneId: m.id })}>Invoice</Button> : <Badge>Not invoiced</Badge>}
                </li>
              );
            })}</ul>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Client invoices & receipts" action={canFin && <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setRefundOpen(true)}><Undo2 className="h-3.5 w-3.5" />Refund</Button><Button size="sm" onClick={() => setInvOpen({})}><Plus className="h-3.5 w-3.5" />Create invoice</Button></div>} />
        {invoices.length === 0 ? <EmptyState icon={<Receipt className="h-5 w-5" />} title="No invoices yet" description="Issue an advance request or milestone invoice from the payment schedule." /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="bg-canvas text-xs text-muted"><tr>{["Document", "Type", "Due", "Total", "Paid", "Balance", "Status", ""].map((h) => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">{invoices.map((i) => (
              <tr key={i.id}><td className="px-3 py-2 font-medium">{i.ref}</td><td className="px-3 py-2 text-muted">{i.type} · {i.kind}</td><td className="px-3 py-2">{fmtDate(i.dueDate, "dd MMM")}</td>
                <td className="px-3 py-2 tabular-nums">{money(i.total)}</td><td className="px-3 py-2 tabular-nums">{i.type === "Credit Note" ? "—" : money(invoicePaid(db, i.id))}</td><td className={cn("px-3 py-2 tabular-nums", invoiceBalance(db, i) > 0 && "font-medium")}>{i.type === "Credit Note" ? "—" : money(invoiceBalance(db, i))}</td>
                <td className="px-3 py-2"><StatusBadge status={invoiceStatus(db, i)} /></td>
                <td className="whitespace-nowrap px-3 py-2 text-right"><Button size="sm" variant="ghost" onClick={() => showDoc(i.id, "invoice")}><FileText className="h-3.5 w-3.5" />PDF</Button>
                  {canFin && i.status === "Issued" && invoiceBalance(db, i) > 0 && <Button size="sm" variant="outline" onClick={() => setPayInv(i)}>Record payment</Button>}
                  {canFin && i.status === "Issued" && (i.type === "Tax Invoice" || i.type === "Bill of Supply") && <Button size="sm" variant="ghost" onClick={() => setCnInv(i)}>Credit note</Button>}</td></tr>
            ))}</tbody></table></div>
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Payments" description="Money in (client) and out (vendors, refunds)" />
          {payments.length === 0 ? <EmptyState title="No payments recorded" /> : <ul className="max-h-80 divide-y divide-line overflow-y-auto">{[...payments].sort((a, b) => b.date.localeCompare(a.date)).map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className={cn("h-7 w-1 rounded-full", p.direction === "in" ? "bg-success" : "bg-warning")} />
              <span className="min-w-0 flex-1"><span className="block font-medium">{p.category === "client" ? "Client receipt" : p.category === "vendor" ? `Vendor · ${db.vendors.find((v) => v.id === p.partyId)?.name}` : "Refund to client"}</span><span className="text-xs text-muted">{p.ref} · {fmtDate(p.date)} · {p.method}</span></span>
              <span className={cn("font-semibold tabular-nums", p.direction === "in" ? "text-success" : "")}>{p.direction === "in" ? "+" : "−"}{money(p.amount)}</span>
              {p.category === "client" && <Button size="sm" variant="ghost" aria-label="Receipt PDF" onClick={() => showDoc(p.id, "receipt")}><FileText className="h-3.5 w-3.5" /></Button>}
            </li>))}</ul>}
        </Card>
        <Card>
          <CardHeader title="Expenses" action={canFin && <Button variant="outline" size="sm" onClick={() => openCreate("expense", { eventId })}><Plus className="h-3.5 w-3.5" />Add</Button>} />
          {expenses.length === 0 ? <EmptyState title="No expenses" /> : <ul className="max-h-80 divide-y divide-line overflow-y-auto">{expenses.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-sm"><span className="min-w-0 flex-1"><span className="block font-medium">{e.category}{e.pettyCash && <Badge tone="neutral" dot={false} className="ml-1.5">Petty cash</Badge>}</span><span className="text-xs text-muted">{e.payee} · {fmtDate(e.date)} · {e.method}</span></span>
              <span className="font-semibold tabular-nums">{money(e.amount)}</span><StatusBadge status={e.status} />
              {canFin && e.status === "Pending" && <Button size="sm" variant="outline" onClick={() => setExpenseStatus(e.id, "Approved")}>Approve</Button>}
              {canFin && e.status === "Approved" && <Button size="sm" variant="outline" onClick={() => setExpenseStatus(e.id, "Paid")}>Mark paid</Button>}</li>))}</ul>}
        </Card>
      </div>

      <Card className="mt-4"><CardHeader title="Budget vs actual by department" description="Planned department budget vs committed vendor cost + recorded expenses" />
        <div className="p-4">{ev.plans.length ? <MoneyBarChart data={chart} series={[{ key: "Budget", label: "Budget", color: "#C9CEDD" }, { key: "Actual", label: "Committed + expenses", color: "#6D4AFF" }]} /> : <p className="py-8 text-center text-xs text-muted">Add department budgets in the Departments tab.</p>}</div>
        <div className="border-t border-line px-4 py-3 text-xs text-muted"><Progress value={f.estimatedRevenue ? (f.received / f.estimatedRevenue) * 100 : 0} tone="success" className="mb-1.5" />Collected {f.estimatedRevenue ? Math.round((f.received / f.estimatedRevenue) * 100) : 0}% of {f.basis.toLowerCase()} value.</div></Card>

      <InvoiceDialog open={!!invOpen} onOpenChange={(o) => !o && setInvOpen(null)} eventId={eventId} milestoneId={invOpen?.milestoneId} />
      <PaymentDialog invoice={payInv} onClose={() => setPayInv(null)} />
      <CreditNoteDialog invoice={cnInv} onClose={() => setCnInv(null)} />
      <RefundDialog eventId={eventId} open={refundOpen} onOpenChange={setRefundOpen} />
      {preview.node}
    </>
  );
}
