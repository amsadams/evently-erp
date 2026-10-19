"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { format, parseISO } from "date-fns";
import { Plus } from "lucide-react";
import { useDB } from "@/stores/db";
import { openCreate } from "@/stores/ui";
import { useCurrentUser } from "@/hooks/use-app";
import { billPaid, eventFinancials, invoiceBalance, invoiceStatus, type EventFinancials } from "@/lib/calculations/finance";
import { setBillStatus } from "@/services/vendors";
import { setExpenseStatus } from "@/services/ops";
import { fmtDate, money, moneyCompact } from "@/lib/formatting";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable } from "@/components/tables/data-table";
import { TabPanel, TabsRoot } from "@/components/ui/overlays";
import { Alert, Button, Card, CardHeader, Stat, StatusBadge } from "@/components/ui/primitives";
import { MoneyAreaChart, MoneyBarChart } from "@/components/charts/charts";
import type { DB, EventRecord, Expense, VendorBill } from "@/types";
import { cn } from "@/lib/utils";

interface Row { e: EventRecord; f: EventFinancials }

export default function FinancePage() {
  const db = useDB() as unknown as DB;
  const router = useRouter();
  const { can } = useCurrentUser();
  const [tab, setTab] = React.useState("profit");
  const w = can("finance.write");
  const rows = React.useMemo<Row[]>(() => db.events.map((e) => ({ e, f: eventFinancials(db, e) })), [db]);
  const tot = (fn: (f: EventFinancials) => number) => rows.reduce((a, r) => a + fn(r.f), 0);
  const petty = db.expenses.filter((x) => x.pettyCash && x.status !== "Rejected").reduce((a, x) => a + x.amount, 0);

  const cash = React.useMemo(() => {
    const m = new Map<string, { month: string; In: number; Out: number; sort: string }>();
    for (const p of db.payments) {
      const k = p.date.slice(0, 7);
      const c = m.get(k) ?? { month: format(parseISO(p.date), "MMM yy"), In: 0, Out: 0, sort: k };
      if (p.direction === "in") c.In += p.amount; else c.Out += p.amount;
      m.set(k, c);
    }
    for (const x of db.expenses.filter((e) => e.status === "Paid")) {
      const k = x.date.slice(0, 7);
      const c = m.get(k) ?? { month: format(parseISO(x.date), "MMM yy"), In: 0, Out: 0, sort: k };
      c.Out += x.amount; m.set(k, c);
    }
    return [...m.values()].sort((a, b) => a.sort.localeCompare(b.sort));
  }, [db]);

  const profitCols: ColumnDef<Row, unknown>[] = [
    { id: "event", accessorFn: (r) => `${r.e.ref} ${r.e.title}`, header: "Event", cell: ({ row: { original: r } }) => <div><p className="font-medium">{r.e.title}</p><p className="text-xs text-muted">{r.e.ref} · {r.f.basis}</p></div> },
    { id: "status", accessorFn: (r) => r.e.status, header: "Status", cell: ({ row }) => <StatusBadge status={row.original.e.status} /> },
    { id: "rev", accessorFn: (r) => r.f.estimatedRevenue, header: "Est. revenue", cell: ({ row }) => <span className="tabular-nums">{money(row.original.f.estimatedRevenue)}</span> },
    { id: "inv", accessorFn: (r) => r.f.invoiced, header: "Invoiced", cell: ({ row }) => <span className="tabular-nums">{money(row.original.f.invoiced)}</span> },
    { id: "rec", accessorFn: (r) => r.f.received, header: "Received", cell: ({ row }) => <span className="tabular-nums text-success">{money(row.original.f.received)}</span> },
    { id: "com", accessorFn: (r) => r.f.vendorCommitted, header: "Vendor committed", cell: ({ row }) => <span className="tabular-nums">{money(row.original.f.vendorCommitted)}</span> },
    { id: "exp", accessorFn: (r) => r.f.expensesRecorded, header: "Expenses", cell: ({ row }) => <span className="tabular-nums">{money(row.original.f.expensesRecorded)}</span> },
    { id: "ep", accessorFn: (r) => r.f.estimatedProfit, header: "Est. profit", cell: ({ row }) => <span className={cn("font-medium tabular-nums", row.original.f.estimatedProfit < 0 && "text-danger")}>{money(row.original.f.estimatedProfit)} <span className="text-xs font-normal text-muted">{row.original.f.estimatedMargin.toFixed(0)}%</span></span> },
    { id: "ap", accessorFn: (r) => r.f.actualResult, header: "Actual result", cell: ({ row }) => row.original.f.invoiced ? <span className={cn("tabular-nums", row.original.f.actualResult < 0 && "text-danger")}>{money(row.original.f.actualResult)}</span> : <span className="text-muted">—</span> },
  ];
  const billCols: ColumnDef<VendorBill, unknown>[] = [
    { accessorKey: "vendorBillNo", header: "Bill", cell: ({ row: { original: b } }) => <div><p className="font-medium">{b.vendorBillNo}</p><p className="font-mono text-[11px] text-muted">{b.ref}</p></div> },
    { id: "vendor", accessorFn: (b) => db.vendors.find((v) => v.id === b.vendorId)?.name ?? "", header: "Vendor" },
    { id: "event", accessorFn: (b) => db.events.find((e) => e.id === b.eventId)?.ref ?? "", header: "Event" },
    { accessorKey: "dueDate", header: "Due", cell: ({ row }) => fmtDate(row.original.dueDate, "dd MMM yy") },
    { accessorKey: "amount", header: "Amount", cell: ({ row }) => <span className="tabular-nums">{money(row.original.amount)}</span> },
    { id: "paid", accessorFn: (b) => billPaid(db, b.id), header: "Paid", cell: ({ row }) => <span className="tabular-nums text-muted">{money(row.getValue("paid") as number)}</span> },
    { id: "bal", accessorFn: (b) => (b.status === "Approved" ? b.amount - billPaid(db, b.id) : 0), header: "Outstanding", cell: ({ row }) => <span className="font-medium tabular-nums">{money(row.getValue("bal") as number)}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row: { original: b } }) => <StatusBadge status={b.status === "Approved" && billPaid(db, b.id) >= b.amount ? "Paid" : b.status} /> },
    { id: "act", header: "", enableSorting: false, cell: ({ row: { original: b } }) => w && b.status === "Pending" ? <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setBillStatus(b.id, "Approved"); }}>Approve</Button> : null },
  ];
  const expCols: ColumnDef<Expense, unknown>[] = [
    { accessorKey: "category", header: "Expense", cell: ({ row: { original: x } }) => <div><p className="font-medium">{x.category}</p><p className="text-xs text-muted">{x.payee}{x.pettyCash ? " · petty cash" : ""}</p></div> },
    { id: "event", accessorFn: (x) => db.events.find((e) => e.id === x.eventId)?.ref ?? "Company", header: "Event" },
    { accessorKey: "date", header: "Date", cell: ({ row }) => fmtDate(row.original.date, "dd MMM yy") }, { accessorKey: "method", header: "Method" },
    { accessorKey: "amount", header: "Amount", cell: ({ row }) => <span className="tabular-nums">{money(row.original.amount)}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: "act", header: "", enableSorting: false, cell: ({ row: { original: x } }) => w ? (x.status === "Pending" ? <Button size="sm" variant="outline" onClick={() => setExpenseStatus(x.id, "Approved")}>Approve</Button> : x.status === "Approved" ? <Button size="sm" variant="outline" onClick={() => setExpenseStatus(x.id, "Paid")}>Mark paid</Button> : null) : null },
  ];

  return (
    <>
      <PageHeader title="Finance" description="Event-centric profitability with client and vendor ledgers kept separate. Every figure is labelled estimated, committed, invoiced, paid or outstanding."
        actions={w && <Button onClick={() => openCreate("expense")}><Plus className="h-4 w-4" />Record expense</Button>} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Stat label="Est. revenue" value={moneyCompact(tot((f) => f.estimatedRevenue))} basis="Estimated" />
        <Stat label="Invoiced" value={moneyCompact(tot((f) => f.invoiced))} basis="Invoiced" />
        <Stat label="Received" value={moneyCompact(tot((f) => f.received))} basis="Paid" tone="success" />
        <Stat label="Receivable" value={moneyCompact(tot((f) => f.receivable))} basis="Outstanding" tone="danger" />
        <Stat label="Vendor committed" value={moneyCompact(tot((f) => f.vendorCommitted))} basis="Committed" />
        <Stat label="Vendor payable" value={moneyCompact(tot((f) => f.vendorPayable))} basis="Outstanding" tone="warning" />
        <Stat label="Expenses" value={moneyCompact(tot((f) => f.expensesRecorded))} basis="Recorded" sub={`${moneyCompact(petty)} petty cash`} />
        <Stat label="Est. profit" value={moneyCompact(tot((f) => f.estimatedProfit))} basis="Estimated" tone={tot((f) => f.estimatedProfit) < 0 ? "danger" : "success"} />
        <Stat label="Actual result" value={moneyCompact(rows.reduce((a, r) => a + (r.f.invoiced ? r.f.actualResult : 0), 0))} basis="Invoiced − bills − exp." />
        <Stat label="Net cash" value={moneyCompact(tot((f) => f.cashPosition))} basis="Cash" sub="Received − paid" />
      </div>
      <TabsRoot value={tab} onValueChange={setTab} tabs={[{ value: "profit", label: "Event profitability" }, { value: "receivables", label: "Receivables" }, { value: "payables", label: "Vendor payables", count: db.bills.length }, { value: "expenses", label: "Expenses & petty cash", count: db.expenses.length }, { value: "cash", label: "Cash flow" }]}>
        <TabPanel value="profit">
          <DataTable data={rows} columns={profitCols} csvName="event-profitability" onRowClick={(r) => router.push(`/events/${r.e.id}?tab=finance`)} searchText={(r) => `${r.e.ref} ${r.e.title}`} pageSize={12}
            filters={[{ key: "st", label: "Status", options: ["Planning", "Confirmed", "In Progress", "Completed", "On Hold", "Enquiry"], get: (r) => r.e.status }]} />
          <Card className="mt-4"><CardHeader title="How these numbers are defined" />
            <ul className="space-y-1 p-4 text-xs text-muted">
              <li><strong className="text-ink">Estimated profit</strong> = estimated revenue (sales order → approved quote → draft quote → budget) − committed vendor agreements − recorded expenses.</li>
              <li><strong className="text-ink">Actual result</strong> = issued tax invoices (net of credit notes; proforma excluded) − approved vendor bills − recorded expenses. Not derived from cash.</li>
              <li><strong className="text-ink">Cash</strong> = client receipts − refunds − vendor payments − paid expenses. Cash is not revenue or profit.</li>
              <li>Vendor payments are counted once (in payments); expenses never include vendor bills, so nothing is double-counted.</li>
            </ul></Card>
        </TabPanel>
        <TabPanel value="receivables">
          <DataTable data={db.invoices.filter((i) => i.status === "Issued" && i.type !== "Credit Note" && invoiceBalance(db, i) > 0)} csvName="receivables" onRowClick={() => router.push("/invoices")}
            columns={[
              { accessorKey: "ref", header: "Document", cell: ({ row }) => <span className="font-medium">{row.original.ref}</span> }, { accessorKey: "type", header: "Type" },
              { id: "client", accessorFn: (i) => db.clients.find((c) => c.id === i.clientId)?.name ?? "", header: "Client" },
              { accessorKey: "dueDate", header: "Due", cell: ({ row }) => fmtDate(row.original.dueDate, "dd MMM yy") },
              { id: "bal", accessorFn: (i) => invoiceBalance(db, i), header: "Balance", cell: ({ row }) => <span className="font-medium tabular-nums">{money(row.getValue("bal") as number)}</span> },
              { id: "st", accessorFn: (i) => invoiceStatus(db, i), header: "Status", cell: ({ row }) => <StatusBadge status={row.getValue("st") as string} /> },
            ]} />
        </TabPanel>
        <TabPanel value="payables"><DataTable data={db.bills} columns={billCols} csvName="vendor-bills" searchText={(b) => `${b.vendorBillNo} ${db.vendors.find((v) => v.id === b.vendorId)?.name}`} onRowClick={(b) => router.push(`/events/${b.eventId}?tab=vendors`)} /></TabPanel>
        <TabPanel value="expenses">
          <DataTable data={db.expenses} columns={expCols} csvName="expenses" searchText={(x) => `${x.category} ${x.payee}`}
            filters={[{ key: "st", label: "Status", options: ["Pending", "Approved", "Paid", "Rejected"], get: (x) => x.status }, { key: "pc", label: "Petty cash", options: ["Yes", "No"], get: (x) => (x.pettyCash ? "Yes" : "No") }, { key: "m", label: "Method", options: db.settings.paymentMethods, get: (x) => x.method }]} />
        </TabPanel>
        <TabPanel value="cash">
          <Card><CardHeader title="Cash flow by month" description="Cash movements only: client receipts and refunds, vendor payments, paid expenses" /><div className="p-4"><MoneyAreaChart data={cash} series={[{ key: "In", label: "Cash in", color: "#16835D" }, { key: "Out", label: "Cash out", color: "#C4364F" }]} xKey="month" /></div></Card>
          <Card className="mt-4"><CardHeader title="Event cash position" /><div className="p-4"><MoneyBarChart data={rows.filter((r) => r.f.received || r.f.vendorPaid).map((r) => ({ name: r.e.ref.slice(-4), Received: r.f.received, Paid: r.f.vendorPaid + r.f.expensesPaid }))} series={[{ key: "Received", label: "Received", color: "#16835D" }, { key: "Paid", label: "Paid out", color: "#C4364F" }]} /></div></Card>
        </TabPanel>
      </TabsRoot>
      {!w && <Alert tone="info" className="mt-4">Your role has read-only finance access.</Alert>}
    </>
  );
}
