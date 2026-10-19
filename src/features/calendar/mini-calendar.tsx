"use client";
import * as React from "react";
import Link from "next/link";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { EventRecord } from "@/types";
import { toISODate, todayISO } from "@/lib/formatting";
import { cn } from "@/lib/utils";

export function MiniCalendar({ events }: { events: EventRecord[] }) {
  const [cursor, setCursor] = React.useState(() => startOfMonth(new Date()));
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }) });
  const today = todayISO();
  const on = (iso: string) => events.filter((e) => e.startDate <= iso && e.endDate >= iso && e.status !== "Cancelled");
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button aria-label="Previous month" onClick={() => setCursor(addMonths(cursor, -1))} className="rounded p-1 text-muted hover:bg-subtle"><ChevronLeft className="h-4 w-4" /></button>
        <span className="text-sm font-semibold">{format(cursor, "MMMM yyyy")}</span>
        <button aria-label="Next month" onClick={() => setCursor(addMonths(cursor, 1))} className="rounded p-1 text-muted hover:bg-subtle"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium text-muted">{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}</div>
      <div className="mt-1 grid grid-cols-7 gap-0.5">
        {days.map((d) => {
          const iso = toISODate(d); const evs = on(iso);
          const cell = (
            <span className={cn("relative flex h-8 flex-col items-center justify-center rounded-md text-xs", !isSameMonth(d, cursor) && "text-[#c3c8d6]", iso === today && "bg-primary font-semibold text-white", evs.length && iso !== today && "bg-primary-soft font-medium text-primary")}>
              {format(d, "d")}
              {evs.length > 0 && iso !== today && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-primary" />}
            </span>
          );
          return evs.length ? <Link key={iso} href={`/events/${evs[0].id}`} title={evs.map((e) => e.title).join(", ")} aria-label={`${format(d, "d MMM")}: ${evs.map((e) => e.title).join(", ")}`}>{cell}</Link> : <div key={iso}>{cell}</div>;
        })}
      </div>
    </div>
  );
}
void parseISO;
