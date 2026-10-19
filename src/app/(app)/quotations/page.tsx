"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useDB } from "@/stores/db";
import { openCreate } from "@/stores/ui";
import { useCurrentUser } from "@/hooks/use-app";
import { quoteTotal } from "@/lib/calculations/finance";
import { fmtDate, money, moneyCompact } from "@/lib/formatting";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable } from "@/components/tables/data-table";
import { Button, Stat, StatusBadge } from "@/components/ui/primitives";
import type { DB, Quotation } from "@/types";

export default function QuotationsPage() {
  const db = useDB() as unknown as DB;
  const router = useRouter();
  const { can } = useCurrentUser();
  const cols: ColumnDef<Quotation, unknown>[] = [
    { accessorKey: "ref", header: "Quotation", cell: ({ row: { original: q } }) => <div><p className="font-medium">{q.ref} <span className="text-xs text-muted">v{q.version}</span></p><p className="text-xs text-muted">{q.title}</p></div> },
    { id: "client", accessorFn: (q) => db.clients.find((c) => c.id === q.clientId)?.name ?? "", header: "Client" },
    { id: "event", accessorFn: (q) => db.events.find((e) => e.id === q.eventId)?.ref ?? "", header: "Event" },
    { accessorKey: "validUntil", header: "Valid until", cell: ({ row }) => fmtDate(row.original.validUntil) },
    { id: "total", accessorFn: (q) => quoteTotal(q), header: "Total", cell: ({ row }) => <span className="font-medium tabular-nums">{money(row.getValue("total") as number)}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  ];
  const sum = (st: string[]) => db.quotations.filter((q) => st.includes(q.status)).reduce((a, q) => a + quoteTotal(q), 0);
  return (
    <>
      <PageHeader title="Quotations" description="Client proposals with versioning, internal approval, PDF export and conversion to bookings and invoices."
        actions={can("quotes.write") && <Button onClick={() => openCreate("quotation")}><Plus className="h-4 w-4" />New quotation</Button>} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="In draft / review" value={moneyCompact(sum(["Draft", "Internal Review"]))} basis="Estimated" />
        <Stat label="Awaiting client" value={moneyCompact(sum(["Sent"]))} basis="Estimated" tone="warning" />
        <Stat label="Approved (to convert)" value={moneyCompact(sum(["Approved"]))} basis="Estimated" />
        <Stat label="Converted to bookings" value={moneyCompact(sum(["Converted"]))} basis="Booked" tone="success" />
      </div>
      <DataTable data={db.quotations} columns={cols} csvName="quotations" onRowClick={(q) => router.push(`/quotations/${q.id}`)} searchText={(q) => `${q.ref} ${q.title} ${db.clients.find((c) => c.id === q.clientId)?.name}`}
        filters={[{ key: "status", label: "Status", options: ["Draft", "Internal Review", "Sent", "Approved", "Rejected", "Expired", "Converted"], get: (q) => q.status }]}
        empty={{ title: "No quotations", action: <Button onClick={() => openCreate("quotation")}>New quotation</Button> }} />
    </>
  );
}
