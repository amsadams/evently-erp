"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useDB } from "@/stores/db";
import { useCurrentUser, useLookups } from "@/hooks/use-app";
import { changeEventStatus } from "@/services/events";
import { eventFinancials } from "@/lib/calculations/finance";
import { eventConflicts } from "@/lib/calculations/conflicts";
import { fmtDate, money, moneyCompact } from "@/lib/formatting";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable } from "@/components/tables/data-table";
import { KanbanBoard } from "@/components/ui/kanban";
import { TabPanel, TabsRoot, toast } from "@/components/ui/overlays";
import { Badge, Button, StatusBadge } from "@/components/ui/primitives";
import { MiniCalendar } from "@/features/calendar/mini-calendar";
import { EVENT_STATUSES, type DB, type EventRecord } from "@/types";
import { Card } from "@/components/ui/primitives";
import Link from "next/link";

const STATUS_DOT: Record<string, string> = { Enquiry: "bg-info", Planning: "bg-primary", Confirmed: "bg-success", "In Progress": "bg-warning", Completed: "bg-muted", Cancelled: "bg-danger", "On Hold": "bg-[#d98a1f]" };

export default function EventsPage() {
  const db = useDB() as unknown as DB;
  const router = useRouter();
  const { can } = useCurrentUser();
  const L = useLookups();
  const [view, setView] = React.useState("table");

  const columns: ColumnDef<EventRecord, unknown>[] = [
    { accessorKey: "ref", header: "Ref", cell: ({ row }) => <span className="font-mono text-xs text-muted">{row.original.ref}</span> },
    { accessorKey: "title", header: "Event", cell: ({ row: { original: e } }) => {
      const clash = eventConflicts(db, e).length > 0;
      return <div><p className="font-medium">{e.title} {clash && <Badge tone="warning" dot={false} className="ml-1">Clash</Badge>}</p><p className="text-xs text-muted">{L.client(e.clientId)?.name}</p></div>;
    } },
    { id: "type", accessorFn: (e) => L.eventType(e.typeId)?.name ?? "", header: "Type" },
    { accessorKey: "startDate", header: "Date", cell: ({ row: { original: e } }) => <span className="whitespace-nowrap">{fmtDate(e.startDate, "dd MMM yy")}{e.endDate !== e.startDate && <span className="text-muted"> → {fmtDate(e.endDate, "dd MMM")}</span>}</span> },
    { accessorKey: "venue", header: "Venue", cell: ({ row }) => <span className="text-muted">{row.original.venue}</span> },
    { id: "coordinator", accessorFn: (e) => L.user(e.coordinatorId)?.name ?? "", header: "Coordinator" },
    { accessorKey: "priority", header: "Priority", cell: ({ row }) => <StatusBadge status={row.original.priority} /> },
    { id: "value", accessorFn: (e) => eventFinancials(db, e).estimatedRevenue, header: "Value", cell: ({ row }) => <span className="tabular-nums">{money(row.getValue("value") as number)}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  ];

  return (
    <>
      <PageHeader title="Events" description="Every booking is the central record linking client, venue, vendors, tasks, quotations, expenses and payments."
        actions={can("events.write") && <Button onClick={() => router.push("/events/new")}><Plus className="h-4 w-4" />New event</Button>} />
      <TabsRoot value={view} onValueChange={setView} tabs={[{ value: "table", label: "Table" }, { value: "pipeline", label: "Pipeline" }, { value: "calendar", label: "Calendar" }]}>
        <TabPanel value="table">
          <DataTable data={db.events} columns={columns} csvName="events" onRowClick={(e) => router.push(`/events/${e.id}`)} initialSort={[{ id: "startDate", desc: false }]}
            searchText={(e) => `${e.ref} ${e.title} ${L.client(e.clientId)?.name} ${e.venue} ${e.city}`} searchPlaceholder="Search by reference, title, client, venue…"
            filters={[
              { key: "status", label: "Status", options: [...EVENT_STATUSES], get: (e) => e.status },
              { key: "type", label: "Type", options: db.eventTypes.map((t) => t.name), get: (e) => L.eventType(e.typeId)?.name ?? "" },
              { key: "coord", label: "Coordinator", options: db.users.filter((u) => u.active).map((u) => u.name), get: (e) => L.user(e.coordinatorId)?.name ?? "" },
              { key: "priority", label: "Priority", options: ["Low", "Medium", "High", "Critical"], get: (e) => e.priority },
            ]}
            empty={{ title: "No events match", description: "Create an event to get started.", action: <Button onClick={() => router.push("/events/new")}>New event</Button> }} />
        </TabPanel>
        <TabPanel value="pipeline">
          <KanbanBoard columns={EVENT_STATUSES.map((s) => ({ id: s, label: s, tone: STATUS_DOT[s] }))} items={db.events} columnOf={(e) => e.status}
            onMove={(e, status) => { const r = changeEventStatus(e.id, status as EventRecord["status"]); if (r.ok) toast.success(`${e.ref} → ${status}`); else toast.error("Status change blocked", r.error); }}
            renderCard={(e) => (
              <div className="space-y-1.5">
                <Link href={`/events/${e.id}`} onPointerDown={(ev) => ev.stopPropagation()} className="block text-sm font-semibold leading-tight hover:text-primary">{e.title}</Link>
                <p className="text-xs text-muted">{L.client(e.clientId)?.name} · {fmtDate(e.startDate, "dd MMM")}</p>
                <div className="flex items-center justify-between"><StatusBadge status={e.priority} /><span className="text-xs font-medium tabular-nums">{moneyCompact(eventFinancials(db, e).estimatedRevenue)}</span></div>
              </div>
            )} />
          <p className="text-xs text-muted">Status moves follow the configured workflow (Settings → Workflow). Invalid transitions and venue clashes are blocked.</p>
        </TabPanel>
        <TabPanel value="calendar">
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <Card className="p-3"><MiniCalendar events={db.events} /></Card>
            <Card className="p-4 text-sm text-muted">For month, week, day and agenda views with filters and clash markers, open the <Link className="font-medium text-primary" href="/calendar">full calendar</Link>.</Card>
          </div>
        </TabPanel>
      </TabsRoot>
    </>
  );
}
