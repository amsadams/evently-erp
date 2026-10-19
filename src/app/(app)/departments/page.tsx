"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Pencil, Plus, Power } from "lucide-react";
import { useDB } from "@/stores/db";
import { openCreate, openEdit } from "@/stores/ui";
import { useCurrentUser } from "@/hooks/use-app";
import { moveDepartment, saveDepartment } from "@/services/admin";
import { COMMITTED_STATUSES, assignmentTotal } from "@/lib/calculations/finance";
import { moneyCompact } from "@/lib/formatting";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Button, Card, Progress } from "@/components/ui/primitives";
import { toast } from "@/components/ui/overlays";
import type { DB } from "@/types";

export default function DepartmentsPage() {
  const db = useDB() as unknown as DB;
  const { can } = useCurrentUser();
  const list = [...db.departments].sort((a, b) => a.order - b.order);
  const admin = can("settings.manage");
  return (
    <>
      <PageHeader title="Departments" description="Configurable delivery departments. Requirements, vendors, tasks, documents, budgets and progress hang off each department per event — nothing is hardcoded."
        actions={admin && <Button onClick={() => openCreate("department")}><Plus className="h-4 w-4" />Add department</Button>} />
      {!admin && <p className="mb-3 text-xs text-muted">Only administrators can add, edit, deactivate or reorder departments.</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((d, idx) => {
          const tasks = db.tasks.filter((t) => t.departmentId === d.id && t.status !== "Archived");
          const done = tasks.filter((t) => t.status === "Completed").length;
          const vendors = db.vendors.filter((v) => v.departmentIds.includes(d.id));
          const events = db.events.filter((e) => e.plans.some((p) => p.departmentId === d.id));
          const spend = db.assignments.filter((a) => a.departmentId === d.id && COMMITTED_STATUSES.includes(a.status)).reduce((s, a) => s + assignmentTotal(a), 0);
          return (
            <Card key={d.id} className={d.active ? "" : "opacity-60"}>
              <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
                <div className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded" style={{ background: d.color }} /><h3 className="font-semibold">{d.name}</h3>{!d.active && <Badge>Inactive</Badge>}</div>
                {admin && <div className="flex">
                  <Button variant="ghost" size="icon" aria-label={`Move ${d.name} up`} disabled={idx === 0} onClick={() => moveDepartment(d.id, -1)}><ArrowUp className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label={`Move ${d.name} down`} disabled={idx === list.length - 1} onClick={() => moveDepartment(d.id, 1)}><ArrowDown className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label={`Edit ${d.name}`} onClick={() => openEdit("department", d.id)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label={d.active ? `Deactivate ${d.name}` : `Activate ${d.name}`} onClick={() => { saveDepartment({ id: d.id, name: d.name, active: !d.active }); toast.info(d.active ? "Department deactivated" : "Department activated", "Existing records keep their department."); }}><Power className="h-4 w-4" /></Button></div>}
              </div>
              <div className="space-y-3 p-4 text-sm">
                <p className="text-muted">{d.description || "No description."}</p>
                <div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-lg bg-canvas p-2"><p className="text-base font-semibold">{events.length}</p><p className="text-muted">Events</p></div><div className="rounded-lg bg-canvas p-2"><p className="text-base font-semibold">{vendors.length}</p><p className="text-muted">Vendors</p></div><div className="rounded-lg bg-canvas p-2"><p className="text-base font-semibold">{moneyCompact(spend)}</p><p className="text-muted">Committed</p></div></div>
                <div><div className="mb-1 flex justify-between text-xs"><span className="text-muted">Task completion</span><span className="font-medium">{done}/{tasks.length}</span></div><Progress value={tasks.length ? (done / tasks.length) * 100 : 0} tone="success" /></div>
                <Link href="/tasks" className="text-xs font-medium text-primary">View department tasks →</Link>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
