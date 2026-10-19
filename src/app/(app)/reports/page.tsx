"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { format, parseISO } from "date-fns";
import { useDB } from "@/stores/db";
import { eventFinancials, billPaid, invoiceBalance, invoiceStatus, assignmentTotal, COMMITTED_STATUSES } from "@/lib/calculations/finance";
import { agreementQuotedTotal } from "@/lib/calculations/quote";
import { funnelBucket, isOverdue } from "@/lib/calculations/tasks";
import { held } from "@/lib/calculations/inventory";
import { money, moneyCompact, fmtDate } from "@/lib/formatting";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable } from "@/components/tables/data-table";
import { CountBarChart, Donut, MoneyBarChart } from "@/components/charts/charts";
import { Alert, Card, CardHeader, Field, Input, Select } from "@/components/ui/primitives";
import { EVENT_STATUSES, type DB, type EventRecord } from "@/types";

type ReportId = "pipeline" | "revenue" | "vendor-spend" | "profit" | "receivables" | "payables" | "expenses" | "vendor-perf" | "tasks" | "inventory" | "budget" | "monthly";
const REPORTS: { id: ReportId; label: string; def: string }[] = [
  { id: "pipeline", label: "Event pipeline & status", def: "Count of events by status and type for the filtered period (by event start date)." },
  { id: "revenue", label: "Revenue & collections", def: "Invoiced = issued tax invoices net of credit notes. Received = client receipts net of refunds. Outstanding = invoiced not yet received." },
  { id: "vendor-spend", label: "Vendor expenditure", def: "Committed = agreements from Confirmed onwards. Billed = approved vendor bills. Paid = recorded vendor payments." },
  { id: "profit", label: "Event profitability", def: "Estimated = revenue basis − committed vendors − recorded expenses. Actual = invoiced − approved bills − expenses." },
  { id: "receivables", label: "Outstanding receivables", def: "Issued tax invoices and bills of supply with unpaid balance. Proforma requests are excluded." },
  { id: "payables", label: "Outstanding payables", def: "Approved vendor bills less payments allocated to them." },
  { id: "expenses", label: "Expenses", def: "Recorded expenses (excluding rejected) by category, incl. petty cash." },
  { id: "vendor-perf", label: "Vendor performance", def: "Average rating from internal feedback, share of agreements completed, and average agreed-vs-quoted price change." },
  { id: "tasks", label: "Task completion", def: "Completion rate = completed ÷ (all tasks − cancelled − archived). Overdue = open and past due date." },
  { id: "inventory", label: "Inventory utilisation", def: "Peak units held across events ÷ usable stock." },
  { id: "budget", label: "Budget vs actual", def: "Event budget vs committed vendor cost + recorded expenses." },
  { id: "monthly", label: "Monthly & yearly performance", def: "Events, estimated revenue and costs by event start month." },
];

export default function ReportsPage() {
  const db = useDB() as unknown as DB;
  const [rid, setRid] = React.useState<ReportId>("pipeline");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [typeId, setTypeId] = React.useState("");
  const [eventId, setEventId] = React.useState("");
  const [cat, setCat] = React.useState("");

  const events = db.events.filter((e) => (!from || e.endDate >= from) && (!to || e.startDate <= to) && (!typeId || e.typeId === typeId) && (!eventId || e.id === eventId));
  const ids = new Set(events.map((e) => e.id));
  const fin = events.map((e) => ({ e, f: eventFinancials(db, e) }));
  const def = REPORTS.find((r) => r.id === rid)!;

  const body = (() => {
    switch (rid) {
      case "pipeline": {
        const rows = events;
        const cols: ColumnDef<EventRecord, any>[] = [{ accessorKey: "ref", header: "Ref" }, { accessorKey: "title", header: "Event" }, { id: "type", accessorFn: (e) => db.eventTypes.find((t) => t.id === e.typeId)?.name ?? "", header: "Type" }, { accessorKey: "status", header: "Status" }, { accessorKey: "startDate", header: "Start", cell: ({ row }) => fmtDate(row.original.startDate) }, { accessorKey: "guests", header: "Guests" }];
        return { charts: <div className="grid gap-4 md:grid-cols-2"><Card><CardHeader title="By status" /><div className="p-4"><Donut data={EVENT_STATUSES.map((s) => ({ name: s, value: rows.filter((e) => e.status === s).length })).filter((x) => x.value)} /></div></Card><Card><CardHeader title="By type" /><div className="p-3"><CountBarChart layout="horizontal" height={200} data={db.eventTypes.map((t) => ({ name: t.name, value: rows.filter((e) => e.typeId === t.id).length })).filter((x) => x.value)} /></div></Card></div>, table: <DataTable data={rows} columns={cols} csvName="event-pipeline" /> };
      }
      case "revenue": {
        const monthly = new Map<string, any>();
        for (const p of db.payments.filter((p) => ids.has(p.eventId) && (p.category === "client" || p.category === "refund"))) { const k = p.date.slice(0, 7); const c = monthly.get(k) ?? { name: format(parseISO(p.date), "MMM yy"), Collected: 0, k }; c.Collected += p.category === "refund" ? -p.amount : p.amount; monthly.set(k, c); }
        const rows = fin.map(({ e, f }) => ({ ref: e.ref, title: e.title, estimated: f.estimatedRevenue, invoiced: f.invoiced, received: f.received, outstanding: f.receivable }));
        const cols: ColumnDef<any, any>[] = [{ accessorKey: "ref", header: "Ref" }, { accessorKey: "title", header: "Event" }, ...(["estimated", "invoiced", "received", "outstanding"] as const).map((k) => ({ accessorKey: k, header: k[0].toUpperCase() + k.slice(1), cell: ({ row }: any) => <span className="tabular-nums">{money(row.original[k])}</span> }))];
        return { charts: <Card><CardHeader title="Collections by month" /><div className="p-4"><MoneyBarChart data={[...monthly.values()].sort((a, b) => a.k.localeCompare(b.k))} series={[{ key: "Collected", label: "Collected (net of refunds)", color: "#16835D" }]} /></div></Card>, table: <DataTable data={rows} columns={cols} csvName="revenue-collections" /> };
      }
      case "vendor-spend": {
        const rows = db.vendors.filter((v) => !cat || v.categoryId === cat).map((v) => {
          const as = db.assignments.filter((a) => a.vendorId === v.id && ids.has(a.eventId));
          const committed = as.filter((a) => COMMITTED_STATUSES.includes(a.status)).reduce((s, a) => s + assignmentTotal(a), 0);
          const bills = db.bills.filter((b) => b.vendorId === v.id && ids.has(b.eventId) && b.status === "Approved");
          return { vendor: v.name, category: db.settings.vendorCategories.find((c) => c.id === v.categoryId)?.name ?? "", events: new Set(as.map((a) => a.eventId)).size, committed, billed: bills.reduce((s, b) => s + b.amount, 0), paid: db.payments.filter((p) => p.partyId === v.id && p.category === "vendor" && ids.has(p.eventId)).reduce((s, p) => s + p.amount, 0), outstanding: bills.reduce((s, b) => s + Math.max(0, b.amount - billPaid(db, b.id)), 0) };
        }).filter((r) => r.committed || r.billed);
        const cols: ColumnDef<any, any>[] = [{ accessorKey: "vendor", header: "Vendor" }, { accessorKey: "category", header: "Category" }, { accessorKey: "events", header: "Events" }, ...(["committed", "billed", "paid", "outstanding"] as const).map((k) => ({ accessorKey: k, header: k[0].toUpperCase() + k.slice(1), cell: ({ row }: any) => <span className="tabular-nums">{money(row.original[k])}</span> }))];
        return { charts: <Card><CardHeader title="Committed spend by vendor" /><div className="p-4"><MoneyBarChart data={rows.map((r) => ({ name: r.vendor.split(" ")[0], Committed: r.committed, Paid: r.paid }))} series={[{ key: "Committed", label: "Committed" }, { key: "Paid", label: "Paid", color: "#16835D" }]} /></div></Card>, table: <DataTable data={rows} columns={cols} csvName="vendor-expenditure" />, extra: <Field label="Vendor category" className="max-w-xs"><Select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{db.settings.vendorCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field> };
      }
      case "profit": {
        const rows = fin.map(({ e, f }) => ({ ref: e.ref, title: e.title, status: e.status, revenue: f.estimatedRevenue, costs: f.vendorCommitted + f.expensesRecorded, profit: f.estimatedProfit, margin: Math.round(f.estimatedMargin * 10) / 10, actual: f.invoiced ? f.actualResult : 0 }));
        const cols: ColumnDef<any, any>[] = [{ accessorKey: "ref", header: "Ref" }, { accessorKey: "title", header: "Event" }, { accessorKey: "status", header: "Status" }, ...(["revenue", "costs", "profit", "actual"] as const).map((k) => ({ accessorKey: k, header: k === "actual" ? "Actual result" : k[0].toUpperCase() + k.slice(1), cell: ({ row }: any) => <span className="tabular-nums">{money(row.original[k])}</span> })), { accessorKey: "margin", header: "Est. margin %" }];
        return { charts: <Card><CardHeader title="Estimated profit by event" /><div className="p-4"><MoneyBarChart data={rows.map((r) => ({ name: r.ref.slice(-4), Profit: r.profit }))} series={[{ key: "Profit", label: "Estimated profit", color: "#6D4AFF" }]} /></div></Card>, table: <DataTable data={rows} columns={cols} csvName="event-profitability" /> };
      }
      case "receivables": {
        const rows = db.invoices.filter((i) => ids.has(i.eventId) && i.status === "Issued" && i.type !== "Credit Note" && i.type !== "Proforma" && invoiceBalance(db, i) > 0).map((i) => ({ ref: i.ref, client: db.clients.find((c) => c.id === i.clientId)?.name ?? "", event: db.events.find((e) => e.id === i.eventId)?.ref ?? "", due: i.dueDate, balance: invoiceBalance(db, i), status: invoiceStatus(db, i) }));
        const cols: ColumnDef<any, any>[] = [{ accessorKey: "ref", header: "Invoice" }, { accessorKey: "client", header: "Client" }, { accessorKey: "event", header: "Event" }, { accessorKey: "due", header: "Due" }, { accessorKey: "balance", header: "Balance", cell: ({ row }: any) => <span className="tabular-nums">{money(row.original.balance)}</span> }, { accessorKey: "status", header: "Status" }];
        return { charts: <Card className="p-4 text-sm">Total outstanding: <strong>{money(rows.reduce((a, r) => a + r.balance, 0))}</strong> across {rows.length} invoices.</Card>, table: <DataTable data={rows} columns={cols} csvName="receivables" /> };
      }
      case "payables": {
        const rows = db.bills.filter((b) => ids.has(b.eventId) && b.status === "Approved" && b.amount - billPaid(db, b.id) > 0).map((b) => ({ bill: b.vendorBillNo, vendor: db.vendors.find((v) => v.id === b.vendorId)?.name ?? "", event: db.events.find((e) => e.id === b.eventId)?.ref ?? "", due: b.dueDate, outstanding: b.amount - billPaid(db, b.id) }));
        const cols: ColumnDef<any, any>[] = [{ accessorKey: "bill", header: "Bill" }, { accessorKey: "vendor", header: "Vendor" }, { accessorKey: "event", header: "Event" }, { accessorKey: "due", header: "Due" }, { accessorKey: "outstanding", header: "Outstanding", cell: ({ row }: any) => <span className="tabular-nums">{money(row.original.outstanding)}</span> }];
        return { charts: <Card className="p-4 text-sm">Total payable: <strong>{money(rows.reduce((a, r) => a + r.outstanding, 0))}</strong> across {rows.length} bills.</Card>, table: <DataTable data={rows} columns={cols} csvName="payables" /> };
      }
      case "expenses": {
        const list = db.expenses.filter((x) => x.status !== "Rejected" && (!x.eventId || ids.has(x.eventId)));
        const byCat = Object.entries(list.reduce<Record<string, number>>((a, x) => ({ ...a, [x.category]: (a[x.category] ?? 0) + x.amount }), {})).map(([name, value]) => ({ name, value }));
        const cols: ColumnDef<any, any>[] = [{ accessorKey: "category", header: "Category" }, { accessorKey: "payee", header: "Payee" }, { id: "ev", accessorFn: (x: any) => db.events.find((e) => e.id === x.eventId)?.ref ?? "Company", header: "Event" }, { accessorKey: "date", header: "Date" }, { accessorKey: "status", header: "Status" }, { accessorKey: "amount", header: "Amount", cell: ({ row }: any) => <span className="tabular-nums">{money(row.original.amount)}</span> }];
        return { charts: <Card><CardHeader title="By category" /><div className="p-4"><Donut money data={byCat} /></div></Card>, table: <DataTable data={list} columns={cols} csvName="expenses" /> };
      }
      case "vendor-perf": {
        const rows = db.vendors.map((v) => {
          const as = db.assignments.filter((a) => a.vendorId === v.id && a.status !== "Draft" && a.status !== "Cancelled");
          const q = as.reduce((s, a) => s + agreementQuotedTotal(a.lines), 0), ag = as.reduce((s, a) => s + assignmentTotal(a), 0);
          return { vendor: v.name, rating: v.feedback.length ? Math.round((v.feedback.reduce((s, f) => s + f.rating, 0) / v.feedback.length) * 10) / 10 : 0, agreements: as.length, completed: as.length ? Math.round((as.filter((a) => a.status === "Completed").length / as.length) * 100) : 0, saving: q ? Math.round(((q - ag) / q) * 1000) / 10 : 0 };
        });
        const cols: ColumnDef<any, any>[] = [{ accessorKey: "vendor", header: "Vendor" }, { accessorKey: "rating", header: "Avg rating" }, { accessorKey: "agreements", header: "Agreements" }, { accessorKey: "completed", header: "Completed %" }, { accessorKey: "saving", header: "Negotiated saving %" }];
        return { charts: <Card><CardHeader title="Average rating" /><div className="p-3"><CountBarChart layout="horizontal" height={260} data={rows.map((r) => ({ name: r.vendor.split(" ")[0], value: r.rating }))} /></div></Card>, table: <DataTable data={rows} columns={cols} csvName="vendor-performance" /> };
      }
      case "tasks": {
        const list = db.tasks.filter((t) => !t.eventId || ids.has(t.eventId));
        const rows = db.users.map((u) => { const mine = list.filter((t) => t.assigneeId === u.id && !["Cancelled", "Archived"].includes(t.status)); return { assignee: u.name, total: mine.length, completed: mine.filter((t) => t.status === "Completed").length, overdue: mine.filter(isOverdue).length, rate: mine.length ? Math.round((mine.filter((t) => t.status === "Completed").length / mine.length) * 100) : 0 }; }).filter((r) => r.total);
        const cols: ColumnDef<any, any>[] = [{ accessorKey: "assignee", header: "Assignee" }, { accessorKey: "total", header: "Tasks" }, { accessorKey: "completed", header: "Completed" }, { accessorKey: "overdue", header: "Overdue" }, { accessorKey: "rate", header: "Completion %" }];
        const buckets = ["Overdue", "Critical", "Due today", "Due soon", "Upcoming", "No deadline", "Completed"].map((b) => ({ name: b, value: list.filter((t) => t.status !== "Archived" && t.status !== "Cancelled" && funnelBucket(t) === b).length }));
        return { charts: <Card><CardHeader title="Priority funnel" /><div className="p-3"><CountBarChart data={buckets} height={220} /></div></Card>, table: <DataTable data={rows} columns={cols} csvName="task-completion" /> };
      }
      case "inventory": {
        const rows = db.inventory.map((i) => { const peak = Math.max(0, ...db.allocations.filter((a) => a.itemId === i.id && ids.has(a.eventId)).map((a) => held(a))); const usable = Math.max(1, i.total - i.damaged - i.unavailable); return { item: i.name, category: i.category, usable, peak, allocations: db.allocations.filter((a) => a.itemId === i.id && ids.has(a.eventId)).length, util: Math.round((peak / usable) * 100) }; });
        const cols: ColumnDef<any, any>[] = [{ accessorKey: "item", header: "Item" }, { accessorKey: "category", header: "Category" }, { accessorKey: "usable", header: "Usable stock" }, { accessorKey: "peak", header: "Peak held" }, { accessorKey: "allocations", header: "Allocations" }, { accessorKey: "util", header: "Utilisation %" }];
        return { charts: <Card><CardHeader title="Utilisation %" /><div className="p-3"><CountBarChart layout="horizontal" height={300} data={rows.filter((r) => r.util).map((r) => ({ name: r.item.slice(0, 14), value: r.util }))} /></div></Card>, table: <DataTable data={rows} columns={cols} csvName="inventory-utilisation" /> };
      }
      case "budget": {
        const rows = fin.map(({ e, f }) => ({ ref: e.ref, title: e.title, budget: e.budget, actual: f.vendorCommitted + f.expensesRecorded, variance: e.budget - (f.vendorCommitted + f.expensesRecorded) }));
        const cols: ColumnDef<any, any>[] = [{ accessorKey: "ref", header: "Ref" }, { accessorKey: "title", header: "Event" }, ...(["budget", "actual", "variance"] as const).map((k) => ({ accessorKey: k, header: k === "actual" ? "Committed + expenses" : k[0].toUpperCase() + k.slice(1), cell: ({ row }: any) => <span className={k === "variance" && row.original.variance < 0 ? "tabular-nums text-danger" : "tabular-nums"}>{money(row.original[k])}</span> }))];
        return { charts: <Card><CardHeader title="Budget vs committed cost" /><div className="p-4"><MoneyBarChart data={rows.map((r) => ({ name: r.ref.slice(-4), Budget: r.budget, Actual: r.actual }))} series={[{ key: "Budget", label: "Budget", color: "#C9CEDD" }, { key: "Actual", label: "Committed + expenses" }]} /></div></Card>, table: <DataTable data={rows} columns={cols} csvName="budget-vs-actual" /> };
      }
      case "monthly": {
        const m = new Map<string, any>();
        for (const { e, f } of fin) { const k = e.startDate.slice(0, 7); const c = m.get(k) ?? { period: format(parseISO(e.startDate), "MMM yyyy"), k, events: 0, revenue: 0, costs: 0 }; c.events++; c.revenue += f.estimatedRevenue; c.costs += f.vendorCommitted + f.expensesRecorded; m.set(k, c); }
        const rows = [...m.values()].sort((a, b) => a.k.localeCompare(b.k));
        const years = Object.entries(rows.reduce<Record<string, any>>((a, r) => { const y = r.k.slice(0, 4); a[y] = a[y] ?? { year: y, events: 0, revenue: 0, costs: 0 }; a[y].events += r.events; a[y].revenue += r.revenue; a[y].costs += r.costs; return a; }, {})).map(([, v]) => v);
        const cols: ColumnDef<any, any>[] = [{ accessorKey: "period", header: "Period" }, { accessorKey: "events", header: "Events" }, { accessorKey: "revenue", header: "Est. revenue", cell: ({ row }: any) => <span className="tabular-nums">{money(row.original.revenue)}</span> }, { accessorKey: "costs", header: "Costs", cell: ({ row }: any) => <span className="tabular-nums">{money(row.original.costs)}</span> }];
        return { charts: <div className="space-y-4"><Card><CardHeader title="Monthly" /><div className="p-4"><MoneyBarChart data={rows.map((r) => ({ name: r.period, Revenue: r.revenue, Costs: r.costs }))} series={[{ key: "Revenue", label: "Est. revenue" }, { key: "Costs", label: "Costs", color: "#D98A1F" }]} /></div></Card><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{years.map((y) => <Card key={y.year} className="p-4"><p className="text-xs text-muted">{y.year}</p><p className="text-lg font-semibold">{y.events} events</p><p className="text-xs text-muted">{moneyCompact(y.revenue)} est. revenue</p></Card>)}</div></div>, table: <DataTable data={rows} columns={cols} csvName="monthly-performance" /> };
      }
    }
  })();

  return (
    <>
      <PageHeader title="Reports & analytics" description="Filter by period, type and event, review charts and detailed rows, and export CSV." />
      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Report" className="lg:col-span-2"><Select value={rid} onChange={(e) => setRid(e.target.value as ReportId)}>{REPORTS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select></Field>
          <Field label="Event from"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Event to"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label="Event type"><Select value={typeId} onChange={(e) => setTypeId(e.target.value)}><option value="">All types</option>{db.eventTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          <Field label="Specific event" className="lg:col-span-2"><Select value={eventId} onChange={(e) => setEventId(e.target.value)}><option value="">All events</option>{db.events.map((e) => <option key={e.id} value={e.id}>{e.ref} · {e.title}</option>)}</Select></Field>
        </div>
        <Alert tone="info" className="mt-3"><strong>Definition:</strong> {def.def} ({events.length} event{events.length === 1 ? "" : "s"} in scope)</Alert>
      </Card>
      {(body as any).extra && <div className="mb-4">{(body as any).extra}</div>}
      <div className="space-y-4">{body.charts}{body.table}</div>
    </>
  );
}
