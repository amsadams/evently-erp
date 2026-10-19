"use client";
import * as React from "react";
import { Paperclip, Pencil, Plus, Trash2 } from "lucide-react";
import { useDB } from "@/stores/db";
import { openEdit } from "@/stores/ui";
import { useCurrentUser } from "@/hooks/use-app";
import { addAttachment, addChecklistItem, addTaskComment, deleteTask, saveTask, setTaskStatus, toggleChecklist } from "@/services/ops";
import { isBlocked, isOverdue } from "@/lib/calculations/tasks";
import { fmtDate, fmtDateTime } from "@/lib/formatting";
import { Sheet, confirm, toast } from "@/components/ui/overlays";
import { Alert, Avatar, Badge, Button, Field, Input, Select, StatusBadge, Textarea } from "@/components/ui/primitives";
import { TASK_STATUSES, type DB, type Task } from "@/types";
import { cn } from "@/lib/utils";

export function TaskSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const db = useDB() as unknown as DB;
  const { can } = useCurrentUser();
  const t = db.tasks.find((x) => x.id === id);
  const [comment, setComment] = React.useState("");
  const [item, setItem] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement>(null);
  if (!t) return <Sheet open={false} onOpenChange={onClose} title="Task">{null}</Sheet>;
  const w = can("tasks.write");
  const blocked = isBlocked(t, db.tasks as Task[]);
  const deps = db.tasks.filter((x) => x.id !== t.id && x.status !== "Archived");
  const done = t.checklist.filter((c) => c.done).length;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={t.title} description={`${db.events.find((e) => e.id === t.eventId)?.ref ?? "General task"} · ${db.departments.find((d) => d.id === t.departmentId)?.name ?? "No department"}`}
      footer={w ? <><Button variant="ghost" onClick={async () => { if (await confirm({ title: "Archive task?", message: "Archived tasks are hidden from boards but kept in history.", confirmLabel: "Archive", danger: true })) { deleteTask(t.id); onClose(); toast.info("Task archived"); } }}><Trash2 className="h-4 w-4" />Archive</Button><Button variant="outline" onClick={() => { onClose(); openEdit("task", t.id); }}><Pencil className="h-4 w-4" />Edit details</Button></> : undefined}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2"><StatusBadge status={t.status} /><StatusBadge status={t.priority} />{isOverdue(t) && <Badge tone="danger">Overdue</Badge>}{blocked && <Badge tone="warning">Blocked by dependency</Badge>}<span className="ml-auto flex items-center gap-1.5 text-xs text-muted"><Avatar name={db.users.find((u) => u.id === t.assigneeId)?.name ?? "?"} className="h-6 w-6 text-[10px]" />{db.users.find((u) => u.id === t.assigneeId)?.name}</span></div>
        {blocked && <Alert tone="warning">Waiting on: {t.dependsOn.map((d) => db.tasks.find((x) => x.id === d)?.title).filter(Boolean).join(", ")}. This task cannot start or complete until those are done.</Alert>}
        <div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-muted">Start</p><p className="font-medium">{fmtDate(t.start)}</p></div><div><p className="text-xs text-muted">Due</p><p className={cn("font-medium", isOverdue(t) && "text-danger")}>{fmtDate(t.due)}</p></div></div>
        {t.description && <p className="rounded-lg bg-canvas p-3 text-sm text-muted">{t.description}</p>}
        {w && <Field label="Status"><Select value={t.status} onChange={(e) => { const r = setTaskStatus(t.id, e.target.value as Task["status"]); if (!r.ok) toast.error("Cannot change status", r.error); else toast.success("Status updated", t.eventId ? "Event timeline updated." : undefined); }}>{TASK_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select></Field>}

        <section>
          <h4 className="mb-2 text-sm font-semibold">Checklist {t.checklist.length > 0 && <span className="font-normal text-muted">{done}/{t.checklist.length}</span>}</h4>
          <ul className="space-y-1">{t.checklist.map((c) => <li key={c.id}><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-primary" checked={c.done} disabled={!w} onChange={() => toggleChecklist(t.id, c.id)} /><span className={cn(c.done && "text-muted line-through")}>{c.text}</span></label></li>)}</ul>
          {w && <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (item.trim()) { addChecklistItem(t.id, item.trim()); setItem(""); } }}><Input aria-label="New checklist item" placeholder="Add checklist item" value={item} onChange={(e) => setItem(e.target.value)} /><Button type="submit" variant="outline" size="icon" aria-label="Add checklist item"><Plus className="h-4 w-4" /></Button></form>}
        </section>

        {w && (
          <section><h4 className="mb-2 text-sm font-semibold">Depends on</h4>
            <Select aria-label="Add dependency" value="" onChange={(e) => { if (e.target.value) saveTask({ id: t.id, title: t.title, dependsOn: [...new Set([...t.dependsOn, e.target.value])] }); }}><option value="">Add dependency…</option>{deps.filter((x) => !t.dependsOn.includes(x.id)).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</Select>
            <ul className="mt-2 space-y-1">{t.dependsOn.map((d) => { const dt = db.tasks.find((x) => x.id === d); return dt ? <li key={d} className="flex items-center justify-between text-sm"><span>{dt.title} <StatusBadge status={dt.status} /></span><button className="text-xs text-muted hover:text-danger" onClick={() => saveTask({ id: t.id, title: t.title, dependsOn: t.dependsOn.filter((x) => x !== d) })}>Remove</button></li> : null; })}</ul></section>
        )}

        <section>
          <h4 className="mb-2 text-sm font-semibold">Attachments</h4>
          <ul className="space-y-1">{t.attachments.map((a, i) => <li key={i} className="flex items-center gap-2 text-sm"><Paperclip className="h-3.5 w-3.5 text-muted" />{a}</li>)}{t.attachments.length === 0 && <li className="text-xs text-muted">No files attached.</li>}</ul>
          {w && <><input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { addAttachment(t.id, f.name); toast.info("Attachment recorded", "Demo stores the file name only; file storage needs the backend."); } e.target.value = ""; }} /><Button variant="outline" size="sm" className="mt-2" onClick={() => fileRef.current?.click()}><Paperclip className="h-3.5 w-3.5" />Attach file</Button></>}
        </section>

        <section>
          <h4 className="mb-2 text-sm font-semibold">Comments</h4>
          <ul className="space-y-2">{t.comments.map((c) => <li key={c.id} className="rounded-lg bg-canvas p-2.5 text-sm"><p>{c.text}</p><p className="mt-1 text-[11px] text-muted">{db.users.find((u) => u.id === c.userId)?.name} · {fmtDateTime(c.at)}</p></li>)}</ul>
          {w && <form className="mt-2 space-y-2" onSubmit={(e) => { e.preventDefault(); if (comment.trim()) { addTaskComment(t.id, comment.trim()); setComment(""); } }}><Textarea aria-label="Comment" placeholder="Write a comment…" value={comment} onChange={(e) => setComment(e.target.value)} /><Button type="submit" size="sm" disabled={!comment.trim()}>Post comment</Button></form>}
        </section>

        <section><h4 className="mb-2 text-sm font-semibold">Activity</h4><ol className="space-y-1 border-l border-line pl-3 text-xs text-muted">{[...t.history].reverse().map((h, i) => <li key={i}>{h.text} · {fmtDateTime(h.at)}</li>)}</ol></section>
      </div>
    </Sheet>
  );
}
