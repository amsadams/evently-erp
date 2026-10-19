"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { useDB } from "@/stores/db";
import { assignmentTotal, billPaid } from "@/lib/calculations/finance";
import { agreementQuotedTotal } from "@/lib/calculations/quote";
import { fmtDate, money } from "@/lib/formatting";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable } from "@/components/tables/data-table";
import { Stat, StatusBadge } from "@/components/ui/primitives";
import { AGREEMENT_STATUSES, type DB, type VendorAssignment } from "@/types";

export default function ProcurementPage() {
  const db = useDB() as unknown as DB;
  const router = useRouter();
  const rows = db.assignments;
  const sum = (st: string[]) => rows.filter((a) => st.includes(a.status)).reduce((s, a) => s + assignmentTotal(a), 0);
  const unpaidBills = db.bills.filter((b) => b.status === "Approved").reduce((s, b) => s + Math.max(0, b.amount - billPaid(db, b.id)), 0);
  const cols: ColumnDef<VendorAssignment, unknown>[] = [
    { accessorKey: "ref", header: "Agreement", cell: ({ row: { original: a } }) => <div><p className="font-medium">{a.ref} <span className="text-xs text-muted">v{a.version}</span></p><p className="text-xs text-muted">{a.poRef ?? "No PO yet"}</p></div> },
    { id: "vendor", accessorFn: (a) => db.vendors.find((v) => v.id === a.vendorId)?.name ?? "", header: "Vendor" },
    { id: "event", accessorFn: (a) => { const e = db.events.find((x) => x.id === a.eventId); return e ? `${e.ref} ${e.title}` : ""; }, header: "Event" },
    { id: "dept", accessorFn: (a) => db.departments.find((d) => d.id === a.departmentId)?.name ?? "", header: "Department" },
    { id: "quoted", accessorFn: (a) => agreementQuotedTotal(a.lines), header: "Quoted", cell: ({ row }) => <span className="tabular-nums text-muted">{money(row.getValue("quoted") as number)}</span> },
    { id: "agreed", accessorFn: (a) => assignmentTotal(a), header: "Agreed", cell: ({ row }) => <span className="font-medium tabular-nums">{money(row.getValue("agreed") as number)}</span> },
    { accessorKey: "deadline", header: "Deadline", cell: ({ row }) => fmtDate(row.original.deadline, "dd MMM yy") },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  ];
  return (
    <>
      <PageHeader title="Vendor work orders" description="All vendor agreements across events: requirement → agreed scope → purchase / work order → delivery → bill → payment." />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Awaiting vendor reply" value={rows.filter((a) => a.status === "Sent" || a.status === "Awaiting Confirmation").length} tone="warning" />
        <Stat label="Committed value" value={money(sum(["Confirmed", "Approved", "Ordered", "Partially Completed", "Completed"]))} basis="Committed" />
        <Stat label="Work orders in delivery" value={rows.filter((a) => ["Ordered", "Partially Completed"].includes(a.status)).length} />
        <Stat label="Approved bills unpaid" value={money(unpaidBills)} basis="Outstanding" tone={unpaidBills ? "warning" : undefined} />
      </div>
      <DataTable data={rows} columns={cols} csvName="vendor-agreements" onRowClick={(a) => router.push(`/events/${a.eventId}?tab=vendors`)} searchText={(a) => `${a.ref} ${a.poRef ?? ""} ${db.vendors.find((v) => v.id === a.vendorId)?.name} ${db.events.find((e) => e.id === a.eventId)?.title}`}
        filters={[{ key: "status", label: "Status", options: [...AGREEMENT_STATUSES], get: (a) => a.status }, { key: "dept", label: "Department", options: db.departments.map((d) => d.name), get: (a) => db.departments.find((d) => d.id === a.departmentId)?.name ?? "" }]} />
    </>
  );
}
