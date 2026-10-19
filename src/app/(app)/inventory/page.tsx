"use client";
import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { addDays, eachDayOfInterval, format } from "date-fns";
import { z } from "zod";
import { AlertTriangle, History, Plus } from "lucide-react";
import { useDB } from "@/stores/db";
import { openCreate, openEdit } from "@/stores/ui";
import { useCurrentUser } from "@/hooks/use-app";
import { adjustStock } from "@/services/ops";
import { availableFor, held, stockSummary, usableStock } from "@/lib/calculations/inventory";
import { stockConflicts } from "@/lib/calculations/conflicts";
import { fmtDateTime, money, toISODate } from "@/lib/formatting";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable } from "@/components/tables/data-table";
import { Modal, Sheet, TabPanel, TabsRoot, toast } from "@/components/ui/overlays";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Select, Stat } from "@/components/ui/primitives";
import { FormDialog } from "@/components/forms/form-dialog";
import { AllocateDialog } from "@/features/events/inventory-tab";
import type { DB, InventoryItem } from "@/types";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function InventoryPage() {
  const db = useDB() as unknown as DB;
  const { can } = useCurrentUser();
  const [tab, setTab] = React.useState("stock");
  const [hist, setHist] = React.useState<InventoryItem | null>(null);
  const [adj, setAdj] = React.useState<InventoryItem | null>(null);
  const [alloc, setAlloc] = React.useState(false);
  const [allocEvent, setAllocEvent] = React.useState("");
  const [calItem, setCalItem] = React.useState(db.inventory[0]?.id ?? "");
  const w = can("inventory.write");

  const rows = db.inventory.map((i) => ({ ...i, ...stockSummary(db, i) }));
  type Row = (typeof rows)[number];
  const conflicts = stockConflicts(db);
  const low = rows.filter((r) => r.lowStock);
  const cols: ColumnDef<Row, unknown>[] = [
    { accessorKey: "name", header: "Item", cell: ({ row: { original: i } }) => <div><p className="font-medium">{i.name} {i.rental && <Badge tone="info" dot={false}>Rental</Badge>}</p><p className="text-xs text-muted">{i.sku} · {i.category} · {i.location}</p></div> },
    { accessorKey: "total", header: "Total" }, { accessorKey: "reserved", header: "Reserved" }, { accessorKey: "dispatched", header: "Dispatched" },
    { accessorKey: "damaged", header: "Damaged", cell: ({ row }) => <span className={row.original.damaged ? "text-danger" : ""}>{row.original.damaged}</span> },
    { accessorKey: "available", header: "Available", cell: ({ row }) => <span className={cn("font-semibold tabular-nums", row.original.lowStock && "text-danger")}>{row.original.available} {row.original.lowStock && <AlertTriangle className="ml-0.5 inline h-3.5 w-3.5" aria-label="Low stock" />}</span> },
    { accessorKey: "reorderLevel", header: "Reorder at" },
    { id: "act", header: "", enableSorting: false, cell: ({ row: { original: i } }) => (
      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}><Button size="sm" variant="ghost" onClick={() => setHist(i)}><History className="h-3.5 w-3.5" />History</Button>{w && <><Button size="sm" variant="ghost" onClick={() => setAdj(i)}>Adjust</Button><Button size="sm" variant="ghost" onClick={() => openEdit("inventory", i.id)}>Edit</Button></>}</div>
    ) },
  ];

  const days = eachDayOfInterval({ start: new Date(), end: addDays(new Date(), 27) });
  const item = db.inventory.find((i) => i.id === calItem);

  return (
    <>
      <PageHeader title="Inventory & rentals" description="Reusable assets and rentals with event allocation, dispatch/return tracking and double-booking protection."
        actions={w && <><Button variant="outline" onClick={() => setAlloc(true)}>Allocate to event</Button><Button onClick={() => openCreate("inventory")}><Plus className="h-4 w-4" />New item</Button></>} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Items" value={db.inventory.length} /><Stat label="Units out in field" value={rows.reduce((a, r) => a + r.dispatched, 0)} /><Stat label="Reorder alerts" value={low.length} tone={low.length ? "warning" : undefined} /><Stat label="Conflicts" value={conflicts.length} tone={conflicts.length ? "danger" : undefined} />
      </div>
      {conflicts.map((c, i) => <Alert key={i} tone={c.severity === "critical" ? "danger" : "warning"} className="mb-2">{c.message}{c.eventId && <> — <Link className="font-medium underline" href={`/events/${c.eventId}?tab=inventory`}>Open event</Link></>}</Alert>)}
      <TabsRoot value={tab} onValueChange={setTab} className="mt-3" tabs={[{ value: "stock", label: "Stock", count: rows.length }, { value: "calendar", label: "Availability calendar" }, { value: "movements", label: "Movement history", count: db.movements.length }, { value: "events", label: "By event" }]}>
        <TabPanel value="stock"><DataTable data={rows} columns={cols} csvName="inventory" searchText={(i) => `${i.name} ${i.sku} ${i.category}`} pageSize={12}
          filters={[{ key: "cat", label: "Category", options: [...new Set(db.inventory.map((i) => i.category))], get: (i) => i.category }, { key: "loc", label: "Location", options: [...new Set(db.inventory.map((i) => i.location))], get: (i) => i.location }, { key: "rent", label: "Rental", options: ["Yes", "No"], get: (i) => (i.rental ? "Yes" : "No") }]} /></TabPanel>
        <TabPanel value="calendar">
          <div className="mb-3 max-w-xs"><Field label="Item"><Select value={calItem} onChange={(e) => setCalItem(e.target.value)}>{db.inventory.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select></Field></div>
          {item && (
            <Card className="p-3">
              <p className="mb-2 text-xs text-muted">Usable stock {usableStock(item)} {item.unit}. Each day shows how many are free after reservations overlapping that day.</p>
              <div className="grid grid-cols-7 gap-1.5">
                {days.map((d) => {
                  const iso = toISODate(d); const free = availableFor(db, item.id, iso, iso); const heldQty = usableStock(item) - free;
                  return <div key={iso} className={cn("rounded-lg border p-1.5 text-center", free === 0 ? "border-danger/40 bg-danger-soft" : heldQty > 0 ? "border-warning/30 bg-warning-soft" : "border-line bg-surface")} title={`${heldQty} held`}>
                    <p className="text-[10px] text-muted">{format(d, "EEE d MMM")}</p><p className={cn("text-base font-semibold tabular-nums", free === 0 && "text-danger")}>{free}</p><p className="text-[10px] text-muted">free</p></div>;
                })}
              </div>
            </Card>
          )}
        </TabPanel>
        <TabPanel value="movements">
          <Card>{db.movements.length === 0 ? <EmptyState title="No movements yet" /> : <ul className="divide-y divide-line">{db.movements.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm"><Badge tone={m.type === "Damaged" || m.type === "Missing" ? "danger" : m.type === "Return" || m.type === "Purchase" ? "success" : "primary"}>{m.type}</Badge>
              <span className="min-w-0 flex-1"><span className="block truncate font-medium">{m.qty} × {db.inventory.find((i) => i.id === m.itemId)?.name}</span><span className="text-xs text-muted">{m.note}{m.eventId ? ` · ${db.events.find((e) => e.id === m.eventId)?.ref}` : ""}</span></span><span className="text-xs text-muted">{fmtDateTime(m.at)}</span></li>))}</ul>}</Card>
        </TabPanel>
        <TabPanel value="events">
          <div className="grid gap-3 md:grid-cols-2">{db.events.filter((e) => db.allocations.some((a) => a.eventId === e.id)).map((e) => (
            <Card key={e.id}><CardHeader title={<Link className="hover:text-primary" href={`/events/${e.id}?tab=inventory`}>{e.title}</Link>} description={`${e.ref} · ${e.startDate}`} />
              <ul className="divide-y divide-line">{db.allocations.filter((a) => a.eventId === e.id).map((a) => <li key={a.id} className="flex justify-between px-4 py-2 text-sm"><span>{db.inventory.find((i) => i.id === a.itemId)?.name}</span><span className="tabular-nums text-muted">{held(a)} held · {a.dispatched} out / {a.required} req.</span></li>)}</ul></Card>
          ))}</div>
        </TabPanel>
      </TabsRoot>

      <Sheet open={!!hist} onOpenChange={(o) => !o && setHist(null)} title={hist?.name ?? ""} description="Stock movement history" width="max-w-md">
        <ul className="divide-y divide-line">{db.movements.filter((m) => m.itemId === hist?.id).map((m) => <li key={m.id} className="py-2.5 text-sm"><div className="flex justify-between"><span className="font-medium">{m.type} · {m.qty}</span><span className="text-xs text-muted">{fmtDateTime(m.at)}</span></div><p className="text-xs text-muted">{m.note}</p></li>)}</ul>
        {db.movements.filter((m) => m.itemId === hist?.id).length === 0 && <EmptyState title="No movements recorded" />}
      </Sheet>
      <FormDialog open={!!adj} onOpenChange={(o) => !o && setAdj(null)} size="sm" title={`Adjust stock — ${adj?.name}`} description="Positive adds stock (purchase), negative removes it (write-off)." schema={z.object({ delta: z.number().int().refine((n) => n !== 0, "Enter a non-zero change"), note: z.string().min(3, "Add a reason") })}
        fields={[{ name: "delta", label: "Change in quantity", type: "number" }, { name: "note", label: "Reason", type: "textarea", required: true }]} defaultValues={{ delta: 0, note: "" }}
        onSubmit={(v: any) => { adjustStock(adj!.id, v.delta, v.note); toast.success("Stock adjusted"); }} />
      <Modalish open={alloc} onClose={() => setAlloc(false)} events={db.events.filter((e) => !["Cancelled", "Completed"].includes(e.status))} value={allocEvent} onChange={setAllocEvent} />
      <span className="sr-only">{money(0)}</span>
    </>
  );
}

function Modalish({ open, onClose, events, value, onChange }: { open: boolean; onClose: () => void; events: { id: string; ref: string; title: string }[]; value: string; onChange: (v: string) => void }) {
  const [step, setStep] = React.useState<'pick' | 'alloc'>('pick');
  React.useEffect(() => { if (open) setStep('pick'); }, [open]);
  if (!open) return null;
  if (step === 'alloc' && value) return <AllocateDialog eventId={value} open onOpenChange={(o) => !o && onClose()} />;
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size='sm' title='Allocate stock to event' footer={<><Button variant='outline' onClick={onClose}>Cancel</Button><Button disabled={!value} onClick={() => setStep('alloc')}>Continue</Button></>}>
      <Field label='Event'><Select value={value} onChange={(e) => onChange(e.target.value)}><option value=''>Select event…</option>{events.map((e) => <option key={e.id} value={e.id}>{e.ref} · {e.title}</option>)}</Select></Field>
    </Modal>
  );
}
