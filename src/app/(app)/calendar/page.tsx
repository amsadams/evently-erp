"use client";
import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { useDB } from "@/stores/db";
import { allConflicts } from "@/lib/calculations/conflicts";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, Select } from "@/components/ui/primitives";
import { CalendarView } from "@/features/calendar/calendar-view";
import { KIND_META, buildCalendarItems, type ItemKind } from "@/features/calendar/items";
import type { DB } from "@/types";
import { cn } from "@/lib/utils";

export default function CalendarPage() {
  const db = useDB() as unknown as DB;
  const all = React.useMemo(() => buildCalendarItems(db), [db]);
  const [kinds, setKinds] = React.useState<ItemKind[]>(Object.keys(KIND_META) as ItemKind[]);
  const [eventId, setEventId] = React.useState("");
  const [deptId, setDeptId] = React.useState("");
  const [coord, setCoord] = React.useState("");
  const [vendor, setVendor] = React.useState("");
  const items = all.filter((i) => kinds.includes(i.kind) && (!eventId || i.eventId === eventId) && (!deptId || i.deptId === deptId) && (!coord || i.coordinatorId === coord) && (!vendor || i.vendorId === vendor));
  const conflicts = React.useMemo(() => allConflicts(db), [db]);
  const toggle = (k: ItemKind) => setKinds((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]));
  return (
    <>
      <PageHeader title="Calendar" description="Events, functions, meetings, vendor appointments, staff work, task deadlines, payment deadlines, milestones and reminders in one place." />
      {conflicts.length > 0 && (
        <Alert tone="warning" title={`${conflicts.length} conflict${conflicts.length > 1 ? "s" : ""} detected`} className="mb-4">
          <ul className="mt-1 list-disc pl-4">{conflicts.slice(0, 4).map((c, i) => <li key={i}>{c.message}</li>)}</ul>
          <span className="mt-1 flex items-center gap-1 text-warning"><AlertTriangle className="h-3 w-3" />Conflicting events are marked with a warning icon in every view.</span>
        </Alert>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select aria-label="Filter by event" className="w-auto max-w-[14rem]" value={eventId} onChange={(e) => setEventId(e.target.value)}><option value="">All events</option>{db.events.map((e) => <option key={e.id} value={e.id}>{e.ref} · {e.title}</option>)}</Select>
        <Select aria-label="Filter by department" className="w-auto" value={deptId} onChange={(e) => setDeptId(e.target.value)}><option value="">All departments</option>{db.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
        <Select aria-label="Filter by coordinator" className="w-auto" value={coord} onChange={(e) => setCoord(e.target.value)}><option value="">All coordinators</option>{db.users.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
        <Select aria-label="Filter by vendor" className="w-auto max-w-[12rem]" value={vendor} onChange={(e) => setVendor(e.target.value)}><option value="">All vendors</option>{db.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Activity types">
        {(Object.keys(KIND_META) as ItemKind[]).map((k) => (
          <button key={k} aria-pressed={kinds.includes(k)} onClick={() => toggle(k)} className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-opacity", kinds.includes(k) ? "border-transparent" : "border-line bg-surface text-muted opacity-70")} style={kinds.includes(k) ? { background: KIND_META[k].color + "1f", color: KIND_META[k].color } : undefined}>
            <span className="h-2 w-2 rounded-full" style={{ background: KIND_META[k].color }} />{KIND_META[k].label}
          </button>
        ))}
      </div>
      <CalendarView items={items} />
    </>
  );
}
