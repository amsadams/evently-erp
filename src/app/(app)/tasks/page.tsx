"use client";
import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Link2Off, Paperclip, Plus } from "lucide-react";
import { useDB } from "@/stores/db";
import { openCreate, openEdit } from "@/stores/ui";
import { useCurrentUser, useLookups } from "@/hooks/use-app";
import { setTaskStatus } from "@/services/ops";
import { funnelBucket, isBlocked, isOverdue, type FunnelBucket } from "@/lib/calculations/tasks";
import { fmtDate } from "@/lib/formatting";
import { PageHeader } from "@/components/layout/page-header";
import { KanbanBoard } from "@/components/ui/kanban";
import { TabPanel, TabsRoot, toast } from "@/components/ui/overlays";
import { DataTable } from "@/components/tables/data-table";
import { Avatar, Badge, Button, Card, Select, StatusBadge } from "@/components/ui/primitives";
import { CalendarView } from "@/features/calendar/calendar-view";
import type { CalItem } from "@/features/calendar/items";
import { TaskSheet } from "@/features/tasks/task-sheet";
import { TASK_STATUSES, type DB, type Task } from "@/types";
import { cn } from "@/lib/utils";

const FUNNEL: { key: FunnelBucket; tone: string }[] = [
  { key: "Overdue", tone: "text-danger" }, { key: "Critical", tone: "text-danger" }, { key: "Due today", tone: "text-warning" }, { key: "Due soon", tone: "text-warning" }, { key: "Upcoming", tone: "text-info" }, { key: "No deadline", tone: "text-muted" }, { key: "Completed", tone: "text-success" },
];
const DOT: Record<string, string> = { "To Do": "bg-muted", Planning: "bg-info", Ongoing: "bg-warning", Completed: "bg-success", Cancelled: "bg-danger", Archived: "bg-line" };

export default function TasksPage() {
  const db = useDB() as unknown as DB;
  const { user, can } = useCurrentUser();
  const L = useLookups();
  const [view, setView] = React.useState("board");
  const [mine, setMine] = React.useState(false);
  const [f, setF] = React.useState({ event: "", dept: "", assignee: "", priority: "", bucket: "" as "" | FunnelBucket });
  const [openId, setOpenId] = React.useState<string | null>(null);

  const all = db.tasks.filter((t) => t.status !== "Archived");
  const base = all.filter((t) => (!mine || t.assigneeId === user.id) && (!f.event || (f.event === "none" ? !t.eventId : t.eventId === f.event)) && (!f.dept || t.departmentId === f.dept) && (!f.assignee || t.assigneeId === f.assignee) && (!f.priority || t.priority === f.priority));
  const counts = FUNNEL.map((x) => ({ ...x, n: base.filter((t) => funnelBucket(t) === x.key).length }));
  const tasks = f.bucket ? base.filter((t) => funnelBucket(t) === f.bucket) : base;

  const move = (t: Task, status: string) => { const r = setTaskStatus(t.id, status as Task["status"]); if (!r.ok) toast.error("Cannot move task", r.error); else toast.success(`${t.title} → ${status}`); };
  const card = (t: Task) => (
    <div className="space-y-2">
      <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setOpenId(t.id)} className="block text-left text-sm font-semibold leading-tight hover:text-primary">{t.title}</button>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <StatusBadge status={t.priority} />
        {t.due && <Badge tone={isOverdue(t) ? "danger" : "neutral"} dot={false}>{isOverdue(t) && <AlertTriangle className="mr-1 inline h-3 w-3" />}{fmtDate(t.due, "dd MMM")}</Badge>}
        {isBlocked(t, db.tasks as Task[]) && <Badge tone="warning" dot={false}><Link2Off className="mr-1 inline h-3 w-3" />Blocked</Badge>}
        {t.checklist.length > 0 && <Badge tone="neutral" dot={false}>{t.checklist.filter((c) => c.done).length}/{t.checklist.length}</Badge>}
        {t.attachments.length > 0 && <Paperclip className="h-3 w-3 text-muted" />}
      </div>
      <div className="flex items-center justify-between"><span className="truncate text-xs text-muted">{L.event(t.eventId)?.ref ?? "General"}</span><Avatar name={L.user(t.assigneeId)?.name ?? "?"} className="h-6 w-6 text-[10px]" /></div>
    </div>
  );

  const cols: ColumnDef<Task, unknown>[] = [
    { accessorKey: "title", header: "Task", cell: ({ row: { original: t } }) => <div><p className={cn("font-medium", t.status === "Completed" && "text-muted line-through")}>{t.title}</p><p className="text-xs text-muted">{L.event(t.eventId)?.ref ?? "General"} · {L.dept(t.departmentId)?.name ?? "—"}</p></div> },
    { id: "assignee", accessorFn: (t) => L.user(t.assigneeId)?.name ?? "", header: "Assignee" },
    { accessorKey: "priority", header: "Priority", cell: ({ row }) => <StatusBadge status={row.original.priority} /> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { accessorKey: "due", header: "Due", cell: ({ row: { original: t } }) => <span className={cn(isOverdue(t) && "font-medium text-danger")}>{fmtDate(t.due, "dd MMM yy")}</span> },
    { id: "bucket", accessorFn: (t) => funnelBucket(t), header: "Funnel" },
  ];
  const calItems: CalItem[] = tasks.filter((t) => t.due).map((t) => ({ id: t.id, kind: "task", title: t.title, sub: `${t.status} · ${L.user(t.assigneeId)?.name}`, start: t.due!, end: t.due!, href: "/tasks" }));

  return (
    <>
      <PageHeader title="Tasks & follow-ups" description="Event-linked and general work with priorities, dependencies, checklists and reminders."
        actions={can("tasks.write") && <Button onClick={() => openCreate("task")}><Plus className="h-4 w-4" />New task</Button>} />
      <Card className="mb-4 p-3">
        <div className="flex items-center justify-between"><p className="text-xs font-semibold text-muted">PRIORITY FUNNEL</p><button className="text-xs text-primary" onClick={() => setF({ ...f, bucket: "" })}>{f.bucket ? "Clear" : ""}</button></div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {counts.map((c) => (
            <button key={c.key} aria-pressed={f.bucket === c.key} onClick={() => setF({ ...f, bucket: f.bucket === c.key ? "" : c.key })} className={cn("rounded-lg border p-2.5 text-left transition-colors", f.bucket === c.key ? "border-primary bg-primary-soft" : "border-line hover:bg-canvas")}>
              <p className={cn("text-xl font-semibold tabular-nums", c.tone)}>{c.n}</p><p className="text-xs text-muted">{c.key}</p>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted">Each open task falls in exactly one bucket: Overdue → Critical → Due today → Due soon (≤3 days) → Upcoming → No deadline. Completed and cancelled tasks are counted separately.</p>
      </Card>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm"><input type="checkbox" className="accent-primary" checked={mine} onChange={(e) => setMine(e.target.checked)} />My tasks</label>
        <Select aria-label="Event" className="w-auto max-w-[13rem]" value={f.event} onChange={(e) => setF({ ...f, event: e.target.value })}><option value="">All events</option><option value="none">General (no event)</option>{db.events.map((e) => <option key={e.id} value={e.id}>{e.ref}</option>)}</Select>
        <Select aria-label="Department" className="w-auto" value={f.dept} onChange={(e) => setF({ ...f, dept: e.target.value })}><option value="">All departments</option>{db.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
        <Select aria-label="Assignee" className="w-auto" value={f.assignee} onChange={(e) => setF({ ...f, assignee: e.target.value })}><option value="">Anyone</option>{db.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
        <Select aria-label="Priority" className="w-auto" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="">Any priority</option>{["Critical", "High", "Medium", "Low"].map((p) => <option key={p}>{p}</option>)}</Select>
      </div>
      <TabsRoot value={view} onValueChange={setView} tabs={[{ value: "board", label: "Board" }, { value: "list", label: "List" }, { value: "table", label: "Table" }, { value: "calendar", label: "Calendar" }]}>
        <TabPanel value="board">
          <KanbanBoard columns={TASK_STATUSES.filter((s) => s !== "Archived").map((s) => ({ id: s, label: s, tone: DOT[s] }))} items={tasks} columnOf={(t) => t.status} renderCard={card} onMove={(t, c) => move(t, c)} />
        </TabPanel>
        <TabPanel value="list">
          <Card><ul className="divide-y divide-line">
            {tasks.length === 0 && <li className="p-8 text-center text-sm text-muted">No tasks match these filters.</li>}
            {[...tasks].sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999")).map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                <input type="checkbox" className="h-4 w-4 accent-primary" aria-label={`Complete ${t.title}`} checked={t.status === "Completed"} disabled={!can("tasks.write")} onChange={(e) => move(t, e.target.checked ? "Completed" : "To Do")} />
                <button onClick={() => setOpenId(t.id)} className="min-w-0 flex-1 text-left"><span className={cn("block truncate text-sm font-medium", t.status === "Completed" && "text-muted line-through")}>{t.title}</span><span className="text-xs text-muted">{L.event(t.eventId)?.ref ?? "General"} · {L.user(t.assigneeId)?.name} · {t.status}</span></button>
                <StatusBadge status={t.priority} /><span className={cn("w-16 text-right text-xs", isOverdue(t) ? "font-medium text-danger" : "text-muted")}>{fmtDate(t.due, "dd MMM")}</span>
              </li>))}
          </ul></Card>
        </TabPanel>
        <TabPanel value="table"><DataTable data={tasks} columns={cols} csvName="tasks" onRowClick={(t) => setOpenId(t.id)} searchText={(t) => `${t.title} ${t.description}`} /></TabPanel>
        <TabPanel value="calendar"><CalendarView items={calItems} /></TabPanel>
      </TabsRoot>
      <TaskSheet id={openId} onClose={() => setOpenId(null)} />
      <span className="sr-only">{openEdit.name}</span>
    </>
  );
}
