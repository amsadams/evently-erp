"use client";
import * as React from "react";
import { AlertTriangle, BellOff, CheckCheck, CheckCircle2, Info, OctagonAlert } from "lucide-react";
import { useDB } from "@/stores/db";
import { markAllRead, markRead } from "@/services/ops";
import { ago } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { Button, EmptyState, Select } from "@/components/ui/primitives";
import type { NotificationType, Severity } from "@/types";

const SEV: Record<Severity, { icon: React.ReactNode; cls: string }> = {
  info: { icon: <Info className="h-4 w-4" />, cls: "bg-info-soft text-info" },
  success: { icon: <CheckCircle2 className="h-4 w-4" />, cls: "bg-success-soft text-success" },
  warning: { icon: <AlertTriangle className="h-4 w-4" />, cls: "bg-warning-soft text-warning" },
  critical: { icon: <OctagonAlert className="h-4 w-4" />, cls: "bg-danger-soft text-danger" },
};
const TYPES: NotificationType[] = ["event", "task", "quotation", "vendor", "payment", "inventory", "conflict", "document", "assignment", "system"];

export function NotificationList({ compact, limit, onNavigate }: { compact?: boolean; limit?: number; onNavigate: (href: string) => void }) {
  const items = useDB((s) => s.notifications);
  const [type, setType] = React.useState("");
  const [unreadOnly, setUnreadOnly] = React.useState(false);
  const list = items.filter((n) => (!type || n.type === type) && (!unreadOnly || !n.read)).slice(0, limit ?? 500);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)} className="w-auto">
          <option value="">All types</option>{TYPES.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
        </Select>
        <label className="flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" className="accent-primary" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />Unread only</label>
        <Button variant="outline" size="sm" className="ml-auto" onClick={markAllRead}><CheckCheck className="h-3.5 w-3.5" />Mark all read</Button>
      </div>
      {list.length === 0 ? <EmptyState icon={<BellOff className="h-5 w-5" />} title="You're all caught up" description="No notifications match these filters." /> : (
        <ul className="space-y-2">
          {list.map((n) => (
            <li key={n.id} className={cn("flex gap-3 rounded-lg border p-3", n.read ? "border-line bg-surface" : "border-primary/25 bg-primary-soft/40")}>
              <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", SEV[n.severity].cls)} aria-label={n.severity}>{SEV[n.severity].icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className={cn("text-sm", !n.read && "font-semibold")}>{n.title}</p>
                  <span className="shrink-0 text-[11px] text-muted">{ago(n.at)}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted">{n.body}</p>
                <div className="mt-2 flex items-center gap-3 text-xs">
                  {n.link && <button className="font-medium text-primary hover:underline" onClick={() => { markRead(n.id); onNavigate(n.link!); }}>Open record →</button>}
                  <button className="text-muted hover:text-ink" onClick={() => markRead(n.id, !n.read)}>{n.read ? "Mark unread" : "Mark read"}</button>
                  {!compact && <span className="ml-auto rounded bg-subtle px-1.5 py-0.5 text-[10px] font-medium capitalize text-muted">{n.type}</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
