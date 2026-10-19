"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useDB } from "@/stores/db";
import { openCreate } from "@/stores/ui";
import { useCurrentUser } from "@/hooks/use-app";
import { eventFinancials, invoiceBalance } from "@/lib/calculations/finance";
import { money, fmtDate } from "@/lib/formatting";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable } from "@/components/tables/data-table";
import { Badge, Button } from "@/components/ui/primitives";
import type { Client, DB } from "@/types";

interface Row extends Client { events: number; outstanding: number }

export default function ClientsPage() {
  const db = useDB() as unknown as DB;
  const router = useRouter();
  const { can } = useCurrentUser();
  const [showArchived, setShowArchived] = React.useState(false);
  const rows = React.useMemo<Row[]>(() => db.clients.filter((c) => showArchived || !c.archived).map((c) => ({
    ...c, events: db.events.filter((e) => e.clientId === c.id).length,
    outstanding: db.invoices.filter((i) => i.clientId === c.id && i.type !== "Proforma").reduce((a, i) => a + invoiceBalance(db, i), 0),
  })), [db, showArchived]);
  void eventFinancials;
  const columns: ColumnDef<Row, unknown>[] = [
    { accessorKey: "name", header: "Client", cell: ({ row: { original: c } }) => <div><p className="font-medium">{c.name}</p><p className="text-xs text-muted">{c.email || c.phone}</p></div> },
    { accessorKey: "type", header: "Type", cell: ({ row }) => <Badge tone={row.original.type === "corporate" ? "info" : "primary"} dot={false} className="capitalize">{row.original.type}</Badge> },
    { accessorKey: "phone", header: "Phone" },
    { accessorKey: "events", header: "Events", cell: ({ row }) => <span className="tabular-nums">{row.original.events}</span> },
    { accessorKey: "outstanding", header: "Outstanding", cell: ({ row }) => <span className={row.original.outstanding ? "font-medium tabular-nums text-danger" : "tabular-nums text-muted"}>{money(row.original.outstanding)}</span> },
    { accessorKey: "createdAt", header: "Since", cell: ({ row }) => <span className="text-muted">{fmtDate(row.original.createdAt)}</span> },
    { id: "status", accessorFn: (c) => (c.archived ? "Archived" : "Active"), header: "Status", cell: ({ row }) => <Badge tone={row.original.archived ? "neutral" : "success"}>{row.original.archived ? "Archived" : "Active"}</Badge> },
  ];
  return (
    <>
      <PageHeader title="Clients" description="Individual and corporate clients, their events, communications and outstanding balances."
        actions={<>
          <label className="flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" className="accent-primary" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />Show archived</label>
          {can("clients.write") && <Button onClick={() => openCreate("client")}><Plus className="h-4 w-4" />New client</Button>}
        </>} />
      <DataTable data={rows} columns={columns} onRowClick={(c) => router.push(`/clients/${c.id}`)} csvName="clients" searchPlaceholder="Search clients by name, phone, email…"
        searchText={(c) => `${c.name} ${c.company ?? ""} ${c.email} ${c.phone} ${c.tags.join(" ")}`}
        filters={[{ key: "type", label: "Type", options: ["individual", "corporate"], get: (c) => c.type }]}
        empty={{ title: "No clients yet", description: "Create your first client to start planning events.", action: <Button onClick={() => openCreate("client")}>New client</Button> }} />
    </>
  );
}
