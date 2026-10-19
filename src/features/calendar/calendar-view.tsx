"use client";
import * as React from "react";
import Link from "next/link";
import { addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { toISODate, todayISO } from "@/lib/formatting";
import { Button, Card, EmptyState } from "@/components/ui/primitives";
import { TabsRoot, TabPanel } from "@/components/ui/overlays";
import { KIND_META, type CalItem } from "./items";
import { cn } from "@/lib/utils";

const onDay = (i: CalItem, iso: string) => i.start <= iso && i.end >= iso;

function Chip({ item, compact }: { item: CalItem; compact?: boolean }) {
  const m = KIND_META[item.kind];
  return (
    <Link href={item.href} title={`${m.label}: ${item.title}${item.sub ? " — " + item.sub : ""}`} className="flex items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] font-medium leading-tight hover:brightness-95" style={{ background: m.color + "1f", color: m.color }}>
      {item.conflict && <AlertTriangle className="h-3 w-3 shrink-0 text-danger" aria-label="Conflict" />}
      <span className="truncate">{!compact && item.time ? item.time + " " : ""}{item.title}</span>
    </Link>
  );
}

export function CalendarView({ items, initialView = "month" }: { items: CalItem[]; initialView?: string }) {
  const [view, setView] = React.useState(initialView);
  const [cursor, setCursor] = React.useState(() => new Date());
  const today = todayISO();
  const step = (dir: 1 | -1) => setCursor((c) => (view === "month" ? addMonths(c, dir) : view === "week" ? addWeeks(c, dir) : addDays(c, dir * (view === "agenda" ? 14 : 1))));
  const title = view === "month" ? format(cursor, "MMMM yyyy") : view === "week" ? `${format(startOfWeek(cursor, { weekStartsOn: 1 }), "d MMM")} – ${format(endOfWeek(cursor, { weekStartsOn: 1 }), "d MMM yyyy")}` : view === "day" ? format(cursor, "EEEE, d MMMM yyyy") : `From ${format(cursor, "d MMM yyyy")}`;
  const monthDays = eachDayOfInterval({ start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }) });
  const weekDays = eachDayOfInterval({ start: startOfWeek(cursor, { weekStartsOn: 1 }), end: endOfWeek(cursor, { weekStartsOn: 1 }) });
  const agendaDays = Array.from({ length: 14 }, (_, i) => addDays(cursor, i));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Previous" onClick={() => step(-1)}><ChevronLeft className="h-4 w-4" /></Button>
        <Button variant="outline" size="icon" aria-label="Next" onClick={() => step(1)}><ChevronRight className="h-4 w-4" /></Button>
        <Button variant="outline" onClick={() => setCursor(new Date())}>Today</Button>
        <h2 className="ml-1 text-base font-semibold">{title}</h2>
      </div>
      <TabsRoot value={view} onValueChange={setView} tabs={[{ value: "month", label: "Month" }, { value: "week", label: "Week" }, { value: "day", label: "Day" }, { value: "agenda", label: "Agenda" }]}>
        <TabPanel value="month">
          <Card className="overflow-hidden">
            <div className="grid grid-cols-7 border-b border-line bg-canvas text-center text-xs font-medium text-muted">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-2">{d}</div>)}</div>
            <div className="grid grid-cols-7">
              {monthDays.map((d) => {
                const iso = toISODate(d); const list = items.filter((i) => onDay(i, iso));
                return (
                  <div key={iso} className={cn("min-h-[92px] border-b border-r border-line p-1 last:border-r-0", !isSameMonth(d, cursor) && "bg-canvas/60")}>
                    <button onClick={() => { setCursor(d); setView("day"); }} aria-label={`Open ${format(d, "d MMMM")}`} className={cn("mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs", iso === today ? "bg-primary font-semibold text-white" : isSameMonth(d, cursor) ? "hover:bg-subtle" : "text-muted")}>{format(d, "d")}</button>
                    <div className="space-y-0.5">
                      {list.slice(0, 3).map((i) => <Chip key={i.id} item={i} compact />)}
                      {list.length > 3 && <button onClick={() => { setCursor(d); setView("day"); }} className="px-1 text-[11px] font-medium text-primary">+{list.length - 3} more</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </TabPanel>
        <TabPanel value="week">
          <div className="grid gap-3 md:grid-cols-7">
            {weekDays.map((d) => { const iso = toISODate(d); const list = items.filter((i) => onDay(i, iso)); return (
              <Card key={iso} className={cn("min-h-[160px] p-2", iso === today && "border-primary/50")}>
                <button onClick={() => { setCursor(d); setView("day"); }} className="mb-2 block text-left"><span className="block text-[10px] font-semibold uppercase text-muted">{format(d, "EEE")}</span><span className={cn("text-base font-semibold", iso === today && "text-primary")}>{format(d, "d")}</span></button>
                <div className="space-y-1">{list.map((i) => <Chip key={i.id} item={i} />)}{list.length === 0 && <p className="text-[11px] text-muted">—</p>}</div>
              </Card>); })}
          </div>
        </TabPanel>
        <TabPanel value="day">
          <DayList items={items.filter((i) => onDay(i, toISODate(cursor)))} label={format(cursor, "EEEE d MMMM")} />
        </TabPanel>
        <TabPanel value="agenda">
          <Card>
            {agendaDays.every((d) => !items.some((i) => onDay(i, toISODate(d)))) ? <EmptyState title="Nothing scheduled" description="No activity in the next two weeks for the selected filters." /> : (
              <ul className="divide-y divide-line">{agendaDays.map((d) => { const iso = toISODate(d); const list = items.filter((i) => onDay(i, iso)); if (!list.length) return null; return (
                <li key={iso} className="flex gap-4 px-4 py-3"><div className="w-14 shrink-0 text-center"><p className="text-[10px] font-semibold uppercase text-muted">{format(d, "EEE")}</p><p className={cn("text-xl font-bold", iso === today && "text-primary")}>{format(d, "d")}</p><p className="text-[10px] text-muted">{format(d, "MMM")}</p></div><div className="min-w-0 flex-1 space-y-1">{list.map((i) => <AgendaRow key={i.id} item={i} />)}</div></li>); })}</ul>
            )}
          </Card>
        </TabPanel>
      </TabsRoot>
    </div>
  );
}

function AgendaRow({ item }: { item: CalItem }) {
  const m = KIND_META[item.kind];
  return (
    <Link href={item.href} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2 hover:bg-canvas">
      <span className="h-8 w-1 rounded-full" style={{ background: m.color }} />
      <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 truncate text-sm font-medium">{item.conflict && <AlertTriangle className="h-3.5 w-3.5 text-danger" aria-label="Conflict" />}{item.title}</span><span className="block truncate text-xs text-muted">{m.label}{item.sub ? ` · ${item.sub}` : ""}{item.start !== item.end ? ` · ${format(parseISO(item.start), "d MMM")}–${format(parseISO(item.end), "d MMM")}` : ""}</span></span>
      {item.time && <span className="text-xs text-muted">{item.time}</span>}
    </Link>
  );
}
function DayList({ items, label }: { items: CalItem[]; label: string }) {
  return <Card className="p-3">{items.length === 0 ? <EmptyState title={`Nothing on ${label}`} /> : <div className="space-y-1.5">{items.map((i) => <AgendaRow key={i.id} item={i} />)}</div>}</Card>;
}
