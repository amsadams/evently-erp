"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { MapPin, Plus } from "lucide-react";
import { useDB } from "@/stores/db";
import { openCreate } from "@/stores/ui";
import { useCurrentUser } from "@/hooks/use-app";
import { money } from "@/lib/formatting";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable } from "@/components/tables/data-table";
import { TabPanel, TabsRoot } from "@/components/ui/overlays";
import { Badge, Button, Card, StatusBadge } from "@/components/ui/primitives";
import type { DB } from "@/types";
import { Stars, vendorStats } from "@/features/vendors/shared";

export default function VendorsPage() {
  const db = useDB() as unknown as DB;
  const router = useRouter();
  const { can } = useCurrentUser();
  const [view, setView] = React.useState("table");
  const rows = db.vendors.map((v) => ({ ...v, ...vendorStats(db, v), category: db.settings.vendorCategories.find((c) => c.id === v.categoryId)?.name ?? "" }));
  type Row = (typeof rows)[number];
  const columns: ColumnDef<Row, unknown>[] = [
    { accessorKey: "name", header: "Vendor", cell: ({ row: { original: v } }) => <div><p className="font-medium">{v.name}</p><p className="text-xs text-muted">{v.contacts[0]?.name} · {v.phone}</p></div> },
    { accessorKey: "category", header: "Category" }, { accessorKey: "city", header: "City" },
    { accessorKey: "rating", header: "Rating", cell: ({ row }) => <Stars value={row.original.rating} /> },
    { accessorKey: "events", header: "Events" },
    { accessorKey: "agreed", header: "Agreed (committed)", cell: ({ row }) => <span className="tabular-nums">{money(row.original.agreed)}</span> },
    { accessorKey: "outstanding", header: "Outstanding", cell: ({ row }) => <span className={row.original.outstanding ? "font-medium tabular-nums text-warning" : "tabular-nums text-muted"}>{money(row.original.outstanding)}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status === "Archived" ? "Archived" : row.original.status === "On Hold" ? "On Hold" : "Active"} /> },
  ];
  return (
    <>
      <PageHeader title="Vendors" description="Directory of suppliers, catalogues, agreed pricing history, outstanding balances and performance."
        actions={can("vendors.write") && <Button onClick={() => openCreate("vendor", { redirect: true })}><Plus className="h-4 w-4" />New vendor</Button>} />
      <TabsRoot value={view} onValueChange={setView} tabs={[{ value: "table", label: "List" }, { value: "grid", label: "Grid" }]}>
        <TabPanel value="table">
          <DataTable data={rows} columns={columns} csvName="vendors" onRowClick={(v) => router.push(`/vendors/${v.id}`)} searchText={(v) => `${v.name} ${v.category} ${v.city} ${v.services.join(" ")}`} searchPlaceholder="Search vendors, services, cities…"
            filters={[{ key: "cat", label: "Category", options: db.settings.vendorCategories.map((c) => c.name), get: (v) => v.category }, { key: "city", label: "City", options: [...new Set(db.vendors.map((v) => v.city))], get: (v) => v.city }, { key: "status", label: "Status", options: ["Active", "On Hold", "Archived"], get: (v) => v.status }]} />
        </TabPanel>
        <TabPanel value="grid">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((v) => (
              <Link key={v.id} href={`/vendors/${v.id}`}><Card className="h-full p-4 transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-2"><p className="font-semibold">{v.name}</p><Stars value={v.rating} /></div>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted"><MapPin className="h-3 w-3" />{v.city} · {v.category}</p>
                <div className="mt-3 flex flex-wrap gap-1">{v.services.slice(0, 3).map((s) => <Badge key={s} tone="neutral" dot={false}>{s}</Badge>)}</div>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-xs"><div><p className="text-muted">Events</p><p className="font-semibold">{v.events}</p></div><div><p className="text-muted">Agreed</p><p className="font-semibold tabular-nums">{money(v.agreed)}</p></div><div><p className="text-muted">Due</p><p className="font-semibold tabular-nums">{money(v.outstanding)}</p></div></div>
              </Card></Link>
            ))}
          </div>
        </TabPanel>
      </TabsRoot>
    </>
  );
}
