import { Star } from "lucide-react";
import { assignmentTotal, billPaid } from "@/lib/calculations/finance";
import type { DB, Vendor } from "@/types";

export function vendorStats(db: DB, v: Vendor) {
  const ass = db.assignments.filter((a) => a.vendorId === v.id && a.status !== "Cancelled" && a.status !== "Draft");
  const agreed = ass.filter((a) => ["Confirmed", "Approved", "Ordered", "Partially Completed", "Completed"].includes(a.status)).reduce((s, a) => s + assignmentTotal(a), 0);
  const bills = db.bills.filter((b) => b.vendorId === v.id && b.status === "Approved");
  const outstanding = bills.reduce((s, b) => s + Math.max(0, b.amount - billPaid(db, b.id)), 0);
  const rating = v.feedback.length ? v.feedback.reduce((s, f) => s + f.rating, 0) / v.feedback.length : 0;
  return { events: new Set(ass.map((a) => a.eventId)).size, agreed, outstanding, rating };
}

export function Stars({ value }: { value: number }) {
  return <span className="inline-flex items-center gap-0.5 text-[#d98a1f]" aria-label={`Rating ${value.toFixed(1)} of 5`}><Star className="h-3.5 w-3.5 fill-current" /><span className="text-xs font-medium text-ink">{value ? value.toFixed(1) : "—"}</span></span>;
}

