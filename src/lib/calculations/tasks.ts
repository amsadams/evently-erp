import type { Task } from "@/types";
import { todayISO } from "../formatting";
import { addDays, format, parseISO } from "date-fns";

export const isOpen = (t: Task) => t.status !== "Completed" && t.status !== "Cancelled" && t.status !== "Archived";
export const isOverdue = (t: Task) => isOpen(t) && !!t.due && t.due < todayISO();

export type FunnelBucket = "Overdue" | "Critical" | "Due today" | "Due soon" | "Upcoming" | "No deadline" | "Completed";
/** Mutually exclusive: Completed, then Overdue, Critical, Due today, Due soon (within 3 days), Upcoming, No deadline. */
export function funnelBucket(t: Task): FunnelBucket {
  if (!isOpen(t)) return "Completed";
  if (isOverdue(t)) return "Overdue";
  if (t.priority === "Critical") return "Critical";
  if (!t.due) return "No deadline";
  const today = todayISO();
  if (t.due === today) return "Due today";
  if (t.due <= format(addDays(parseISO(today), 3), "yyyy-MM-dd")) return "Due soon";
  return "Upcoming";
}

export function isBlocked(t: Task, all: Task[]) {
  return isOpen(t) && t.dependsOn.some((id) => {
    const d = all.find((x) => x.id === id);
    return d && d.status !== "Completed";
  });
}
