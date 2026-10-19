"use client";
import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarCheck, CheckSquare, Clock, FileSignature, Hourglass, IndianRupee, Landmark, Layers, Percent, TrendingUp, Wallet, Briefcase, Store } from "lucide-react";
import { useDB } from "@/stores/db";
import { RANGES, dashboardMetrics, monthlySeries, upcomingPayments, type RangeKey } from "@/lib/calculations/metrics";
import { allConflicts } from "@/lib/calculations/conflicts";
import { money, moneyCompact, fmtDate, ago, todayISO } from "@/lib/formatting";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Card, CardHeader, EmptyState, Select, Stat, StatusBadge } from "@/components/ui/primitives";
import { CountBarChart, Donut, MoneyBarChart } from "@/components/charts/charts";
import { MiniCalendar } from "@/features/calendar/mini-calendar";
import { EVENT_STATUSES, type DB } from "@/types";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const db = useDB() as unknown as DB;
  const [range, setRange] = React.useState<RangeKey>("all");
  const [typeId, setTypeId] = React.useState("");
  const m = React.useMemo(() => dashboardMetrics(db, range, typeId || undefined), [db, range, typeId]);
  const payments = React.useMemo(() => upcomingPayments(db), [db]);
  const series = React.useMemo(() => monthlySeries(db, m.events), [db, m.events]);
  const conflicts = React.useMemo(() => allConflicts(db), [db]);
  const today = todayISO();
  const milestones = m.events.flatMap((e) => e.milestones.filter((x) => !x.done).map((x) => ({ ...x, event: e }))).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  const pipeline = EVENT_STATUSES.map((s) => ({ name: s, value: m.events.filter((e) => e.status === s).length })).filter((x) => x.value > 0);
  const byType = db.eventTypes.map((t) => ({ name: t.name, value: m.events.filter((e) => e.typeId === t.id).length })).filter((x) => x.value > 0);
  const nextEvents = m.events.filter((e) => e.endDate >= today && !["Cancelled", "Completed"].includes(e.status)).sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 4);

  return (
    <>
      <PageHeader title="Overview" description="Live view of your event pipeline, collections, vendor commitments and workload — computed from the demo dataset."
        actions={<>
          <Select aria-label="Date range" className="w-auto" value={range} onChange={(e) => setRange(e.target.value as RangeKey)}>{RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</Select>
          <Select aria-label="Event type" className="w-auto" value={typeId} onChange={(e) => setTypeId(e.target.value)}><option value="">All event types</option>{db.eventTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
        </>} />

      {conflicts.length > 0 && (
        <Link href="/calendar" className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning hover:brightness-95">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span><strong>{conflicts.length} scheduling or stock conflict{conflicts.length > 1 ? "s" : ""}</strong> need attention — {conflicts[0].message}</span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat href="/events" label="Active events" value={m.active} icon={<Briefcase className="h-4 w-4" />} sub="Confirmed / in progress" />
        <Stat href="/calendar" label="Upcoming events" value={m.upcoming} icon={<CalendarCheck className="h-4 w-4" />} sub="From today" />
        <Stat href="/events" label="In planning" value={m.planning} icon={<Layers className="h-4 w-4" />} sub="Enquiry + planning" />
        <Stat href="/events" label="Completed" value={m.completed} icon={<CheckSquare className="h-4 w-4" />} />
        <Stat href="/quotations" label="Pending client approvals" value={m.pendingApprovals} tone={m.pendingApprovals ? "warning" : undefined} icon={<FileSignature className="h-4 w-4" />} sub="Quotes in review / sent" />
        <Stat href="/procurement" label="Pending vendor confirmations" value={m.pendingVendors} tone={m.pendingVendors ? "warning" : undefined} icon={<Store className="h-4 w-4" />} />
        <Stat href="/invoices" label="Client receivables" value={moneyCompact(m.receivables)} basis="Outstanding" tone={m.receivables ? "danger" : undefined} icon={<Landmark className="h-4 w-4" />} sub="Issued tax invoices" />
        <Stat href="/finance" label="Vendor payables" value={moneyCompact(m.payables)} basis="Outstanding" icon={<Wallet className="h-4 w-4" />} sub="Approved bills unpaid" />
        <Stat href="/finance" label="Est. revenue" value={moneyCompact(m.estRevenue)} basis="Estimated" icon={<TrendingUp className="h-4 w-4" />} />
        <Stat href="/finance" label="Est. expenses" value={moneyCompact(m.estExpenses)} basis="Committed" icon={<IndianRupee className="h-4 w-4" />} sub="Vendors + expenses" />
        <Stat href="/finance" label="Actual profit (completed)" value={moneyCompact(m.actualProfit)} basis="Invoiced − bills − exp." tone={m.actualProfit < 0 ? "danger" : "success"} icon={<Percent className="h-4 w-4" />} sub={`${m.actualMargin.toFixed(1)}% margin`} />
        <Stat href="/tasks" label="Tasks due today / overdue" value={`${m.dueToday} / ${m.overdue}`} tone={m.overdue ? "danger" : undefined} icon={<Clock className="h-4 w-4" />} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Estimated revenue vs committed costs" description="By event start month · estimated (quote/sales order) vs committed vendor + recorded expenses" />
          <div className="p-4"><MoneyBarChart data={series} series={[{ key: "Revenue", label: "Est. revenue" }, { key: "Costs", label: "Committed costs", color: "#D98A1F" }]} xKey="month" /></div>
        </Card>
        <Card>
          <CardHeader title="Event pipeline" description="Status breakdown" />
          <div className="p-4"><Donut data={pipeline} /></div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Upcoming payment deadlines" action={<Link href="/invoices" className="text-xs font-medium text-primary">All →</Link>} />
          {payments.length === 0 ? <EmptyState title="Nothing due" description="No client or vendor payments fall due in the next 3 weeks." /> : (
            <ul className="divide-y divide-line">
              {payments.slice(0, 6).map((p) => (
                <li key={p.id}><Link href={p.href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-canvas">
                  <span className={cn("h-8 w-1 rounded-full", p.kind === "receivable" ? "bg-success" : "bg-warning")} aria-hidden />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{p.label}</span><span className="block text-xs text-muted">{p.kind === "receivable" ? "Receive" : "Pay"} · {p.sub}</span></span>
                  <span className="text-right"><span className="block text-sm font-semibold tabular-nums">{moneyCompact(p.amount)}</span><span className={cn("block text-xs", p.overdue ? "font-medium text-danger" : "text-muted")}>{p.overdue ? "Overdue · " : ""}{fmtDate(p.due, "dd MMM")}</span></span>
                </Link></li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Upcoming milestones" />
          {milestones.length === 0 ? <EmptyState title="No open milestones" /> : (
            <ul className="divide-y divide-line">
              {milestones.map((x) => (
                <li key={x.id}><Link href={`/events/${x.event.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-canvas">
                  <Hourglass className={cn("h-4 w-4", x.date < today ? "text-danger" : "text-muted")} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{x.title}</span><span className="block truncate text-xs text-muted">{x.event.ref} · {x.event.title}</span></span>
                  <span className={cn("text-xs", x.date < today ? "font-medium text-danger" : "text-muted")}>{fmtDate(x.date, "dd MMM")}</span>
                </Link></li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Calendar preview" action={<Link href="/calendar" className="text-xs font-medium text-primary">Open calendar →</Link>} />
          <div className="p-3"><MiniCalendar events={m.events} /></div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Next events" action={<Link href="/events" className="text-xs font-medium text-primary">All events →</Link>} />
          <ul className="divide-y divide-line">
            {nextEvents.map((e) => (
              <li key={e.id}><Link href={`/events/${e.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas">
                <div className="w-12 shrink-0 rounded-lg bg-primary-soft py-1 text-center text-primary"><p className="text-[10px] font-semibold uppercase">{fmtDate(e.startDate, "MMM")}</p><p className="text-lg font-bold leading-none">{fmtDate(e.startDate, "dd")}</p></div>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{e.title}</span><span className="block truncate text-xs text-muted">{e.ref} · {e.venue} · {e.guests} guests</span></span>
                <StatusBadge status={e.status} /><ArrowRight className="hidden h-4 w-4 text-muted sm:block" />
              </Link></li>
            ))}
            {nextEvents.length === 0 && <EmptyState title="No upcoming events in this view" />}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Events by type" />
          <div className="p-3"><CountBarChart data={byType} layout="horizontal" height={190} /></div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Recent activity" description="Audit timeline of changes across modules" action={<Badge tone="neutral" dot={false}>Demo data</Badge>} />
        <ul className="divide-y divide-line">
          {db.audit.slice(0, 8).map((a) => (
            <li key={a.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
              <span className="min-w-0 flex-1">{a.summary}<span className="block text-xs text-muted">{db.users.find((u) => u.id === a.userId)?.name} · {a.entity}</span></span>
              <span className="shrink-0 text-xs text-muted">{ago(a.at)}</span>
            </li>
          ))}
        </ul>
      </Card>
      <span className="sr-only">{money(0)}</span>
    </>
  );
}
