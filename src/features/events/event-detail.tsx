"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { AlertTriangle, Ban, CheckCircle2, ChevronDown, FileText, Flag, Lock, MapPin, Pencil, Plus, RotateCcw, Trash2, Users } from "lucide-react";
import { useDB } from "@/stores/db";
import { openCreate, openEdit } from "@/stores/ui";
import { useCurrentUser, useLookups } from "@/hooks/use-app";
import { addMilestone, changeEventStatus, closeEvent, closureChecks, removeDepartmentPlan, removeFunction, reopenEvent, saveDepartmentPlan, saveFunction, toggleMilestone, updateEvent } from "@/services/events";
import { generateEventSummary, generateExpenseReport, generateSettlement } from "@/services/documents";
import { setTaskStatus } from "@/services/ops";
import { eventFinancials, departmentSpend, COMMITTED_STATUSES } from "@/lib/calculations/finance";
import { eventConflicts, stockConflicts, vendorConflicts } from "@/lib/calculations/conflicts";
import { fmtDate, fmtDateTime, ago, moneyCompact, money, todayISO } from "@/lib/formatting";
import { eventBasicsSchema } from "@/lib/validation/schemas";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { ActionMenu, Modal, TabPanel, TabsRoot, confirm, toast } from "@/components/ui/overlays";
import { Alert, Badge, Button, Card, CardHeader, DefinitionList, EmptyState, Progress, Stat, StatusBadge, Textarea, Field } from "@/components/ui/primitives";
import { FormDialog } from "@/components/forms/form-dialog";
import { usePreview } from "@/components/documents/doc-preview";
import { VendorTab } from "./vendor-tab";
import { FinanceTab } from "./finance-tab";
import { EventInventoryTab } from "./inventory-tab";
import { EVENT_STATUSES, type DB, type EventFunction } from "@/types";
import { cn } from "@/lib/utils";

export function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const tab = search.get("tab") ?? "overview";
  const setTab = (t: string) => router.replace(`/events/${id}?tab=${t}`, { scroll: false });
  const db = useDB() as unknown as DB;
  const { can } = useCurrentUser();
  const L = useLookups();
  const preview = usePreview();
  const [editOpen, setEditOpen] = React.useState(false);
  const [closeOpen, setCloseOpen] = React.useState(false);
  const [fnDialog, setFnDialog] = React.useState<{ fn?: EventFunction } | null>(null);
  const [planDialog, setPlanDialog] = React.useState<string | "new" | null>(null);

  const ev = db.events.find((e) => e.id === id);
  if (!ev) return <EmptyState title="Event not found" description="It may have been removed." action={<Button onClick={() => router.push("/events")}>Back to events</Button>} />;

  const f = eventFinancials(db, ev);
  const client = L.client(ev.clientId);
  const tasks = db.tasks.filter((t) => t.eventId === id && t.status !== "Archived");
  const done = tasks.filter((t) => t.status === "Completed").length;
  const assignments = db.assignments.filter((a) => a.eventId === id);
  const docs = db.documents.filter((d) => d.eventId === id);
  const activity = db.audit.filter((a) => a.eventId === id);
  const conflicts = [...eventConflicts(db, ev), ...stockConflicts(db, id)];
  const vendorIssues = [...new Set(assignments.filter((a) => a.status !== "Cancelled").flatMap((a) => vendorConflicts(db, id, a.vendorId).map((c) => c.message)))];
  const spend = departmentSpend(db, id);
  const allowed = db.settings.statusFlow[ev.status] ?? [];
  const ro = !can("events.write");
  const closed = !!ev.closure;
  const type = L.eventType(ev.typeId);

  const readiness = [
    { label: "Approved client quotation or sales order", ok: f.basis === "Sales order" || f.basis === "Approved quotation", blocking: true },
    { label: "Advance payment received", ok: f.received > 0, blocking: true },
    { label: "All vendor agreements confirmed or ordered", ok: assignments.length > 0 && assignments.filter((a) => a.status !== "Cancelled").every((a) => COMMITTED_STATUSES.includes(a.status)), blocking: true },
    { label: "Critical / high-priority tasks complete", ok: tasks.filter((t) => ["Critical", "High"].includes(t.priority)).every((t) => ["Completed", "Cancelled"].includes(t.status)), blocking: false },
    { label: "No scheduling or stock conflicts", ok: conflicts.length === 0 && vendorIssues.length === 0, blocking: true },
    { label: "Milestones on track", ok: ev.milestones.every((m) => m.done || m.date >= todayISO()), blocking: false },
  ];
  const blockers = readiness.filter((r) => r.blocking && !r.ok);

  const statusMenu = allowed.map((s) => ({
    label: `Move to ${s}`, onSelect: async () => {
      if (s === "Cancelled" && !(await confirm({ title: "Cancel this event?", message: "Cancelling flags the event across calendars and notifications. Vendor agreements and invoices are not auto-cancelled.", confirmLabel: "Cancel event", danger: true }))) return;
      const r = changeEventStatus(id, s);
      if (r.ok) toast.success(`Status: ${s}`); else toast.error("Cannot change status", r.error);
    }, danger: s === "Cancelled",
  }));

  return (
    <>
      <BackLink href="/events">Events</BackLink>
      <PageHeader title={ev.title}
        description={<span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1"><span className="font-mono text-xs">{ev.ref}</span><span><Link href={`/clients/${ev.clientId}`} className="font-medium text-primary hover:underline">{client?.name}</Link></span><span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{ev.venue}, {ev.city}</span><span>{fmtDate(ev.startDate)}{ev.endDate !== ev.startDate && ` → ${fmtDate(ev.endDate)}`}</span></span>}
        meta={<><StatusBadge status={ev.status} /><StatusBadge status={ev.priority} /><Badge tone="neutral" dot={false}>{type?.name}</Badge>{closed && <Badge tone="success"><Lock className="mr-1 inline h-3 w-3" />Financially closed</Badge>}</>}
        actions={<>
          {!ro && !closed && allowed.length > 0 && <ActionMenu trigger={<Button variant="outline">Status<ChevronDown className="h-4 w-4" /></Button>} items={statusMenu} />}
          {!ro && <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" />Edit</Button>}
          {can("finance.write") && !closed && ev.status !== "Cancelled" && ev.status !== "Enquiry" && <Button onClick={() => setCloseOpen(true)}><Flag className="h-4 w-4" />Close event</Button>}
          {closed && can("finance.write") && <Button variant="outline" onClick={() => { reopenEvent(id); toast.info("Event reopened"); }}><RotateCcw className="h-4 w-4" />Reopen</Button>}
        </>} />

      {(conflicts.length > 0 || vendorIssues.length > 0) && (
        <Alert tone="warning" title={`${conflicts.length + vendorIssues.length} conflict${conflicts.length + vendorIssues.length > 1 ? "s" : ""} need attention`} className="mb-4">
          <ul className="mt-1 space-y-1">{[...conflicts.map((c) => c.message), ...vendorIssues].slice(0, 5).map((m, i) => <li key={i} className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{m}</li>)}</ul>
        </Alert>
      )}

      <TabsRoot value={tab} onValueChange={setTab} tabs={[
        { value: "overview", label: "Overview" }, { value: "functions", label: "Functions & timeline", count: ev.functions.length }, { value: "departments", label: "Departments", count: ev.plans.length },
        { value: "vendors", label: "Vendors", count: assignments.length }, { value: "finance", label: "Quotes & finance" }, { value: "tasks", label: "Tasks", count: tasks.length },
        { value: "inventory", label: "Stock & rentals" }, { value: "documents", label: "Documents", count: docs.length }, { value: "activity", label: "Activity", count: activity.length },
      ]}>
        <TabPanel value="overview">
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Estimated revenue" value={money(f.estimatedRevenue)} basis={f.basis} />
            <Stat label="Vendor commitments" value={money(f.vendorCommitted)} basis="Committed" sub={`${assignments.filter((a) => COMMITTED_STATUSES.includes(a.status)).length} agreements`} />
            <Stat label="Estimated profit" value={money(f.estimatedProfit)} basis="Estimated" tone={f.estimatedProfit < 0 ? "danger" : "success"} sub={`${f.estimatedMargin.toFixed(1)}% margin`} />
            <Stat label="Received from client" value={money(f.received)} basis="Paid" sub={`${money(f.contractOutstanding)} to collect`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Event details" />
              <div className="p-4"><DefinitionList cols={3} items={[
                ["Client", client?.name], ["Coordinator", L.user(ev.coordinatorId)?.name], ["Type", type?.name], ["Date", `${fmtDate(ev.startDate)}${ev.endDate !== ev.startDate ? " → " + fmtDate(ev.endDate) : ""}`], ["Time", `${ev.startTime} – ${ev.endTime}`], ["Guests", ev.guests],
                ["Venue", ev.venue], ["City", ev.city], ["Budget", money(ev.budget)],
              ]} />
                {ev.description && <p className="mt-4 rounded-lg bg-canvas p-3 text-sm text-muted">{ev.description}</p>}
                {ev.logistics && <p className="mt-2 rounded-lg bg-canvas p-3 text-sm text-muted"><strong className="text-ink">Logistics:</strong> {ev.logistics}</p>}
              </div>
            </Card>
            <Card>
              <CardHeader title="Readiness" description={blockers.length ? `${blockers.length} blocking issue${blockers.length > 1 ? "s" : ""}` : "No blocking issues"} />
              <ul className="divide-y divide-line">
                {readiness.map((r) => (
                  <li key={r.label} className="flex items-start gap-2 px-4 py-2.5 text-sm">
                    {r.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", r.blocking ? "text-danger" : "text-warning")} />}
                    <span className={cn(!r.ok && "font-medium")}>{r.label}{!r.ok && <span className="ml-1 text-xs font-normal text-muted">({r.blocking ? "blocking" : "warning"})</span>}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card><CardHeader title="Task progress" description={`${done} of ${tasks.length} complete`} /><div className="p-4"><Progress value={tasks.length ? (done / tasks.length) * 100 : 0} tone="success" />
              <ul className="mt-3 space-y-1.5 text-sm">{tasks.filter((t) => !["Completed", "Cancelled"].includes(t.status)).slice(0, 5).map((t) => <li key={t.id} className="flex items-center justify-between gap-2"><span className="truncate">{t.title}</span><span className={cn("shrink-0 text-xs", t.due && t.due < todayISO() ? "font-medium text-danger" : "text-muted")}>{fmtDate(t.due, "dd MMM")}</span></li>)}</ul></div></Card>
            <Card><CardHeader title="Milestones" action={!ro && <Button variant="ghost" size="sm" onClick={() => setFnDialog({ fn: { id: "__ms", name: "", date: ev.startDate, startTime: "", endTime: "", venue: "", guests: 0 } })}><Plus className="h-3.5 w-3.5" />Add</Button>} />
              <ul className="divide-y divide-line">{ev.milestones.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2.5"><input type="checkbox" aria-label={`Complete ${m.title}`} className="h-4 w-4 accent-primary" checked={m.done} disabled={ro} onChange={() => toggleMilestone(id, m.id)} /><span className={cn("flex-1 text-sm", m.done && "text-muted line-through")}>{m.title}</span><span className={cn("text-xs", !m.done && m.date < todayISO() ? "font-medium text-danger" : "text-muted")}>{fmtDate(m.date, "dd MMM")}</span></li>
              ))}{ev.milestones.length === 0 && <EmptyState title="No milestones" />}</ul></Card>
          </div>
        </TabPanel>

        <TabPanel value="functions">
          <div className="mb-3 flex justify-end">{!ro && <Button onClick={() => setFnDialog({})}><Plus className="h-4 w-4" />Add function</Button>}</div>
          <Card>
            {ev.functions.length === 0 ? <EmptyState icon={<Users className="h-5 w-5" />} title="Single-session event" description="Add functions for multi-day bookings: engagement, sangeet, reception, conference sessions." /> : (
              <ol className="divide-y divide-line">{[...ev.functions].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)).map((fn) => (
                <li key={fn.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-14 shrink-0 rounded-lg bg-primary-soft py-1 text-center text-primary"><p className="text-[10px] font-semibold uppercase">{fmtDate(fn.date, "MMM")}</p><p className="text-lg font-bold leading-none">{fmtDate(fn.date, "dd")}</p></div>
                  <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{fn.name}</p><p className="text-xs text-muted">{fn.startTime}–{fn.endTime} · {fn.venue} · {fn.guests} guests</p></div>
                  {!ro && <><Button variant="ghost" size="icon" aria-label={`Edit ${fn.name}`} onClick={() => setFnDialog({ fn })}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" aria-label={`Delete ${fn.name}`} onClick={async () => { if (await confirm({ title: `Delete “${fn.name}”?`, message: "The function is removed from the event timeline.", confirmLabel: "Delete", danger: true })) removeFunction(id, fn.id); }}><Trash2 className="h-4 w-4" /></Button></>}
                </li>))}</ol>)}
          </Card>
        </TabPanel>

        <TabPanel value="departments">
          <div className="mb-3 flex items-center justify-between"><p className="text-sm text-muted">Each department has its own requirements, budget, vendors, tasks and progress for this event.</p>{!ro && <Button onClick={() => setPlanDialog("new")}><Plus className="h-4 w-4" />Add department</Button>}</div>
          <div className="grid gap-4 md:grid-cols-2">
            {ev.plans.map((p) => {
              const d = L.dept(p.departmentId); if (!d) return null;
              const dTasks = tasks.filter((t) => t.departmentId === p.departmentId);
              const dDone = dTasks.filter((t) => t.status === "Completed").length;
              const dAss = assignments.filter((a) => a.departmentId === p.departmentId && a.status !== "Cancelled");
              const used = spend[p.departmentId] ?? 0;
              const progress = dTasks.length ? (dDone / dTasks.length) * 100 : dAss.length ? (dAss.filter((a) => COMMITTED_STATUSES.includes(a.status)).length / dAss.length) * 100 : 0;
              return (
                <Card key={p.departmentId}>
                  <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
                    <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{ background: d.color }} /><h3 className="text-sm font-semibold">{d.name}</h3>{!d.active && <Badge>Inactive</Badge>}</div>
                    {!ro && <div className="flex"><Button variant="ghost" size="icon" aria-label={`Edit ${d.name} plan`} onClick={() => setPlanDialog(p.departmentId)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" aria-label={`Remove ${d.name}`} onClick={async () => { if (await confirm({ title: `Remove ${d.name}?`, message: "Existing vendors and tasks keep their department tag.", confirmLabel: "Remove", danger: true })) removeDepartmentPlan(id, p.departmentId); }}><Trash2 className="h-4 w-4" /></Button></div>}
                  </div>
                  <div className="space-y-3 p-4 text-sm">
                    <p className="text-muted">{p.requirements || "No requirements recorded yet."}</p>
                    <div><div className="mb-1 flex justify-between text-xs"><span className="text-muted">Budget used (committed + expenses)</span><span className="font-medium tabular-nums">{moneyCompact(used)} / {moneyCompact(p.budget)}</span></div><Progress value={p.budget ? (used / p.budget) * 100 : 0} tone={p.budget && used > p.budget ? "danger" : "primary"} /></div>
                    <div><div className="mb-1 flex justify-between text-xs"><span className="text-muted">Progress</span><span className="font-medium">{Math.round(progress)}%</span></div><Progress value={progress} tone="success" /></div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted"><span>{dAss.length} vendor{dAss.length === 1 ? "" : "s"}</span><span>·</span><span>{dTasks.length} tasks</span></div>
                  </div>
                </Card>
              );
            })}
            {ev.plans.length === 0 && <Card className="md:col-span-2"><EmptyState title="No departments planned" description="Add the departments that deliver this event." /></Card>}
          </div>
        </TabPanel>

        <TabPanel value="vendors"><VendorTab eventId={id} readOnly={!can("vendors.write")} /></TabPanel>
        <TabPanel value="finance"><FinanceTab eventId={id} /></TabPanel>

        <TabPanel value="tasks">
          <div className="mb-3 flex justify-end">{can("tasks.write") && <Button onClick={() => openCreate("task", { eventId: id })}><Plus className="h-4 w-4" />Add task</Button>}</div>
          <Card>
            {tasks.length === 0 ? <EmptyState title="No tasks yet" description="Tasks created here are linked to the event timeline." /> : (
              <ul className="divide-y divide-line">{tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                  <input type="checkbox" className="h-4 w-4 accent-primary" aria-label={`Complete ${t.title}`} checked={t.status === "Completed"} disabled={!can("tasks.write")}
                    onChange={(e) => { const r = setTaskStatus(t.id, e.target.checked ? "Completed" : "To Do"); if (!r.ok) toast.error("Cannot update task", r.error); }} />
                  <button onClick={() => openEdit("task", t.id)} className="min-w-0 flex-1 text-left"><span className={cn("block truncate text-sm font-medium", t.status === "Completed" && "text-muted line-through")}>{t.title}</span><span className="text-xs text-muted">{L.user(t.assigneeId)?.name} · {L.dept(t.departmentId)?.name ?? "General"}</span></button>
                  <StatusBadge status={t.priority} /><span className={cn("w-16 text-right text-xs", t.due && t.due < todayISO() && t.status !== "Completed" ? "font-medium text-danger" : "text-muted")}>{fmtDate(t.due, "dd MMM")}</span>
                </li>))}</ul>)}
          </Card>
        </TabPanel>

        <TabPanel value="inventory"><EventInventoryTab eventId={id} /></TabPanel>

        <TabPanel value="documents">
          <div className="mb-3 flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => { const d = generateEventSummary(id); if (d) { toast.success("Event summary generated"); preview.show(d.snapshot); } }}><FileText className="h-4 w-4" />Event summary</Button>
            <Button variant="outline" onClick={() => { const d = generateExpenseReport(id); if (d) preview.show(d.snapshot); }}><FileText className="h-4 w-4" />Expense report</Button>
            {can("finance.read") && <Button variant="outline" onClick={() => { const d = generateSettlement(id); if (d) preview.show(d.snapshot); }}><FileText className="h-4 w-4" />Settlement statement</Button>}
          </div>
          <Card>
            {docs.length === 0 ? <EmptyState title="No documents yet" /> : <ul className="divide-y divide-line">{docs.map((d) => (
              <li key={d.id}><button onClick={() => preview.show(d.snapshot)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-canvas"><FileText className="h-4 w-4 text-muted" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{d.title}</span><span className="text-xs text-muted">{d.kind} · {d.ref} · v{d.version}{d.superseded ? " (superseded)" : ""} · {ago(d.createdAt)}</span></span><span className="text-xs font-medium text-primary">Preview</span></button></li>
            ))}</ul>}
          </Card>
        </TabPanel>

        <TabPanel value="activity">
          <Card>{activity.length === 0 ? <EmptyState title="No activity yet" /> : (
            <ol className="relative ml-6 border-l border-line py-3">{activity.map((a) => (
              <li key={a.id} className="relative px-4 py-2"><span className="absolute -left-[5px] top-3.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-primary" /><p className="text-sm">{a.summary}</p><p className="text-xs text-muted">{L.user(a.userId)?.name} · {fmtDateTime(a.at)}</p></li>
            ))}</ol>)}</Card>
        </TabPanel>
      </TabsRoot>

      {/* Edit event */}
      <FormDialog open={editOpen} onOpenChange={setEditOpen} title="Edit event" schema={eventBasicsSchema} size="lg"
        fields={[
          { name: "title", label: "Title", required: true, span: 2 }, { name: "clientId", label: "Client", type: "select", required: true, options: db.clients.map((c) => ({ value: c.id, label: c.name })) },
          { name: "typeId", label: "Type", type: "select", required: true, options: db.eventTypes.map((t) => ({ value: t.id, label: t.name })) },
          { name: "coordinatorId", label: "Coordinator", type: "select", required: true, options: db.users.filter((u) => u.active).map((u) => ({ value: u.id, label: u.name })) },
          { name: "priority", label: "Priority", type: "select", required: true, options: ["Low", "Medium", "High", "Critical"].map((p) => ({ value: p, label: p })) },
          { name: "status", label: "Status (use the Status menu to transition)", type: "select", required: true, options: EVENT_STATUSES.map((p) => ({ value: p, label: p })) },
          { name: "venue", label: "Venue", required: true }, { name: "city", label: "City", required: true }, { name: "startDate", label: "Start date", type: "date", required: true }, { name: "endDate", label: "End date", type: "date", required: true },
          { name: "startTime", label: "Start time", type: "time" }, { name: "endTime", label: "End time", type: "time" }, { name: "guests", label: "Guests", type: "number", min: 1 }, { name: "budget", label: "Budget", type: "money" },
          { name: "description", label: "Description", type: "textarea" }, { name: "logistics", label: "Logistics", type: "textarea" },
        ]}
        defaultValues={{ title: ev.title, clientId: ev.clientId, typeId: ev.typeId, coordinatorId: ev.coordinatorId, priority: ev.priority, status: ev.status, venue: ev.venue, city: ev.city, startDate: ev.startDate, endDate: ev.endDate, startTime: ev.startTime, endTime: ev.endTime, guests: ev.guests, budget: ev.budget, description: ev.description, logistics: ev.logistics }}
        onSubmit={(v: any) => {
          if (v.status !== ev.status) { const r = changeEventStatus(id, v.status); if (!r.ok) return r.error; }
          const { status: _s, ...rest } = v; void _s;
          const c = eventConflicts(db, { ...rest, id, status: v.status });
          updateEvent(id, rest);
          if (c.length) toast.warning("Saved with conflicts", c[0].message); else toast.success("Event updated");
        }} />

      {/* Function / milestone dialog */}
      <FormDialog open={!!fnDialog} onOpenChange={(o) => !o && setFnDialog(null)} size="sm"
        title={fnDialog?.fn?.id === "__ms" ? "Add milestone" : fnDialog?.fn?.id ? "Edit function" : "Add function"}
        schema={fnDialog?.fn?.id === "__ms" ? z.object({ name: z.string().min(2, "Required"), date: z.string().min(1, "Required") }) : z.object({ name: z.string().min(2, "Name is required"), date: z.string().min(1), startTime: z.string().min(1), endTime: z.string().min(1), venue: z.string().min(2), guests: z.number().int().min(0) })}
        fields={fnDialog?.fn?.id === "__ms" ? [{ name: "name", label: "Milestone", required: true, span: 2 }, { name: "date", label: "Date", type: "date", required: true }] : [{ name: "name", label: "Function name", required: true, span: 2 }, { name: "date", label: "Date", type: "date", required: true }, { name: "guests", label: "Guests", type: "number", min: 0 }, { name: "startTime", label: "Start", type: "time", required: true }, { name: "endTime", label: "End", type: "time", required: true }, { name: "venue", label: "Venue / area", required: true, span: 2 }]}
        defaultValues={{ name: fnDialog?.fn?.id === "__ms" ? "" : fnDialog?.fn?.name ?? "", date: fnDialog?.fn?.date ?? ev.startDate, startTime: fnDialog?.fn?.startTime || ev.startTime, endTime: fnDialog?.fn?.endTime || ev.endTime, venue: fnDialog?.fn?.venue || ev.venue, guests: fnDialog?.fn?.guests ?? ev.guests }}
        onSubmit={(v: any) => { if (fnDialog?.fn?.id === "__ms") { addMilestone(id, v.name, v.date); toast.success("Milestone added"); } else { saveFunction(id, { ...v, id: fnDialog?.fn?.id }); toast.success("Function saved"); } }} />

      {/* Department plan dialog */}
      <PlanDialog eventId={id} target={planDialog} onClose={() => setPlanDialog(null)} />

      {/* Close event */}
      <CloseEventDialog open={closeOpen} onOpenChange={setCloseOpen} eventId={id} onDone={(settlementDoc) => { if (settlementDoc) preview.show(settlementDoc); }} />
      {preview.node}
      <span className="sr-only">{closed ? "closed" : ""}{Ban.name}</span>
    </>
  );
}

function PlanDialog({ eventId, target, onClose }: { eventId: string; target: string | "new" | null; onClose: () => void }) {
  const db = useDB() as unknown as DB;
  const ev = db.events.find((e) => e.id === eventId);
  const existing = ev?.plans.find((p) => p.departmentId === target);
  const free = db.departments.filter((d) => d.active && !ev?.plans.some((p) => p.departmentId === d.id));
  const [deptId, setDeptId] = React.useState("");
  const [budget, setBudget] = React.useState(0);
  const [req, setReq] = React.useState("");
  React.useEffect(() => { if (target) { setDeptId(existing?.departmentId ?? free[0]?.id ?? ""); setBudget(existing?.budget ?? 0); setReq(existing?.requirements ?? ""); } }, [target]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal open={!!target} onOpenChange={(o) => !o && onClose()} title={existing ? "Edit department plan" : "Add department"} size="sm"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!deptId} onClick={() => { saveDepartmentPlan(eventId, { departmentId: deptId, budget, requirements: req, notes: existing?.notes ?? "" }); toast.success("Department plan saved"); onClose(); }}>Save</Button></>}>
      <div className="space-y-4">
        {!existing && <Field label="Department"><select className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm" value={deptId} onChange={(e) => setDeptId(e.target.value)}>{free.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>}
        <Field label="Planned budget (₹)"><input type="number" min={0} className="h-9 w-full rounded-lg border border-line px-3 text-right text-sm tabular-nums" value={budget / 100} onChange={(e) => setBudget(Math.round(Number(e.target.value) * 100))} /></Field>
        <Field label="Requirements"><Textarea value={req} onChange={(e) => setReq(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function CloseEventDialog({ open, onOpenChange, eventId, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; eventId: string; onDone: (d?: import("@/types").DocSnapshot) => void }) {
  const db = useDB();
  const [note, setNote] = React.useState("");
  const [ack, setAck] = React.useState(false);
  const issues = React.useMemo(() => (open ? closureChecks(eventId) : []), [open, eventId, db.payments, db.invoices, db.tasks, db.bills]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { if (open) { setNote(""); setAck(false); } }, [open]);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Close event & settle" description="Financial closure reconciles client and vendor balances, generates the settlement statement and records an audit entry." size="md"
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={issues.length > 0 && !ack} onClick={() => { closeEvent(eventId, note || "Closed after reconciliation"); toast.success("Event closed", "Settlement statement generated."); onOpenChange(false); const d = useDB.getState().documents.find((x) => x.sourceId === eventId && x.kind === "Settlement Statement" && !x.superseded); onDone(d?.snapshot); }}>Close event</Button></>}>
      {issues.length === 0 ? <Alert tone="success" title="Ready to close">All reconciliation checks passed.</Alert> : (
        <div className="space-y-3">
          <Alert tone="warning" title="Unreconciled items"><ul className="list-disc pl-4">{issues.map((i) => <li key={i}>{i}</li>)}</ul></Alert>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-primary" checked={ack} onChange={(e) => setAck(e.target.checked)} />Close anyway — I accept these items are outstanding (recorded in the audit trail)</label>
        </div>
      )}
      <Field label="Closure note" className="mt-4"><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Final balance received; vendor bills reconciled." /></Field>
    </Modal>
  );
}
