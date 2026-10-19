"use client";
import * as React from "react";
import { Boxes, Plus } from "lucide-react";
import { z } from "zod";
import { useDB } from "@/stores/db";
import { useCurrentUser } from "@/hooks/use-app";
import { allocateStock, dispatchStock, recordLoss, releaseAllocation, returnStock } from "@/services/ops";
import { availableFor } from "@/lib/calculations/inventory";
import { stockConflicts } from "@/lib/calculations/conflicts";
import { FormDialog } from "@/components/forms/form-dialog";
import { Alert, Button, Card, EmptyState, Field, NumberInput, Select } from "@/components/ui/primitives";
import { ActionMenu, Modal, toast } from "@/components/ui/overlays";
import type { DB, StockAllocation } from "@/types";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function EventInventoryTab({ eventId }: { eventId: string }) {
  const db = useDB() as unknown as DB;
  const { can } = useCurrentUser();
  const ev = db.events.find((e) => e.id === eventId)!;
  const allocs = db.allocations.filter((a) => a.eventId === eventId);
  const [addOpen, setAddOpen] = React.useState(false);
  const [act, setAct] = React.useState<{ kind: "dispatch" | "return" | "damaged" | "missing"; a: StockAllocation } | null>(null);
  const conflicts = stockConflicts(db, eventId);
  const w = can("inventory.write");
  const out = (a: StockAllocation) => a.dispatched - a.returned - a.damaged - a.missing;
  const maxFor = (k: string, a: StockAllocation) => (k === "dispatch" ? a.reserved - a.dispatched : out(a));

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Required vs reserved vs dispatched vs returned for {ev.startDate} → {ev.endDate}. Reservations are refused if stock is already held by overlapping events.</p>
        {w && <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" />Allocate stock</Button>}
      </div>
      {conflicts.map((c, i) => <Alert key={i} tone={c.severity === "critical" ? "danger" : "warning"} className="mb-2">{c.message}</Alert>)}
      <Card>
        {allocs.length === 0 ? <EmptyState icon={<Boxes className="h-5 w-5" />} title="No stock allocated" description="Check availability and reserve equipment, furniture and rentals for this event." /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-canvas text-xs text-muted"><tr>{["Item", "Required", "Reserved", "Dispatched", "Returned", "Damaged / missing", "Remaining to reserve", ""].map((h) => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">{allocs.map((a) => {
              const item = db.inventory.find((i) => i.id === a.itemId)!;
              const rem = Math.max(0, a.required - a.reserved);
              return (
                <tr key={a.id}><td className="px-3 py-2"><p className="font-medium">{item.name}</p><p className="text-xs text-muted">{item.sku}{item.rental ? " · rental" : ""}</p></td>
                  <td className="px-3 py-2 tabular-nums">{a.required}</td><td className="px-3 py-2 tabular-nums">{a.reserved}</td><td className="px-3 py-2 tabular-nums">{a.dispatched}</td><td className="px-3 py-2 tabular-nums">{a.returned}</td>
                  <td className={cn("px-3 py-2 tabular-nums", a.damaged + a.missing > 0 && "font-medium text-danger")}>{a.damaged} / {a.missing}</td><td className={cn("px-3 py-2 tabular-nums", rem > 0 && "font-medium text-warning")}>{rem}</td>
                  <td className="px-3 py-2 text-right">{w && <ActionMenu trigger={<Button size="sm" variant="outline">Actions</Button>} items={[
                    { label: "Dispatch", disabled: a.reserved - a.dispatched <= 0, onSelect: () => setAct({ kind: "dispatch", a }) },
                    { label: "Record return", disabled: out(a) <= 0, onSelect: () => setAct({ kind: "return", a }) },
                    { label: "Record damaged", disabled: out(a) <= 0, onSelect: () => setAct({ kind: "damaged", a }) },
                    { label: "Record missing", disabled: out(a) <= 0, onSelect: () => setAct({ kind: "missing", a }) },
                    { label: "Release reservation", disabled: a.dispatched > 0, danger: true, separatorBefore: true, onSelect: () => { releaseAllocation(a.id); toast.info("Reservation released"); } },
                  ]} />}</td></tr>
              );
            })}</tbody></table></div>
        )}
      </Card>

      <AllocateDialog eventId={eventId} open={addOpen} onOpenChange={setAddOpen} />
      <FormDialog open={!!act} onOpenChange={(o) => !o && setAct(null)} size="sm" title={act ? { dispatch: "Dispatch stock", return: "Record return", damaged: "Record damaged stock", missing: "Record missing stock" }[act.kind] : ""} submitLabel="Save"
        schema={z.object({ qty: z.number().int().min(1, "Enter a quantity").max(act ? Math.max(1, maxFor(act.kind, act.a)) : 1, "More than available to move"), note: z.string().optional() })}
        fields={[{ name: "qty", label: `Quantity (max ${act ? maxFor(act.kind, act.a) : 0})`, type: "number", min: 1, required: true }, { name: "note", label: "Note", type: "textarea" }]}
        defaultValues={{ qty: act ? Math.max(1, maxFor(act.kind, act.a)) : 1, note: "" }}
        onSubmit={(v: any) => {
          if (!act) return;
          const r = act.kind === "dispatch" ? dispatchStock(act.a.id, v.qty) : act.kind === "return" ? returnStock(act.a.id, v.qty) : recordLoss(act.a.id, v.qty, act.kind, v.note ?? "");
          if (!r.ok) return r.error;
          toast.success("Stock updated", act.kind === "dispatch" ? "Rental costs (if any) were added as pending expenses." : undefined);
        }} />
    </>
  );
}

export function AllocateDialog({ eventId, open, onOpenChange }: { eventId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const db = useDB() as unknown as DB;
  const ev = db.events.find((e) => e.id === eventId)!;
  const [itemId, setItemId] = React.useState('');
  const [req, setReq] = React.useState(1);
  const [res, setRes] = React.useState(1);
  const [err, setErr] = React.useState('');
  React.useEffect(() => { if (open) { setItemId(db.inventory[0]?.id ?? ''); setReq(1); setRes(1); setErr(''); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const existing = db.allocations.find((a) => a.eventId === eventId && a.itemId === itemId);
  const avail = itemId ? availableFor(db, itemId, ev.startDate, ev.endDate, existing?.id) : 0;
  const item = db.inventory.find((i) => i.id === itemId);
  const reserve = Math.min(res, req);
  const save = () => {
    const r = allocateStock(eventId, itemId, req, reserve);
    if (!r.ok) { setErr(r.error); return; }
    toast.success('Stock reserved', reserve < req ? 'Shortfall of ' + (req - reserve) + ' remains to be sourced.' : undefined);
    onOpenChange(false);
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} title='Allocate stock' size='sm' description={'Availability is checked for ' + ev.startDate + ' to ' + ev.endDate}
      footer={<><Button variant='outline' onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} disabled={!itemId || reserve > avail || req < 1}>Reserve {reserve} {item?.unit}</Button></>}>
      <div className='space-y-3'>
        <Field label='Item'><Select value={itemId} onChange={(e) => setItemId(e.target.value)}>{db.inventory.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.sku})</option>)}</Select></Field>
        <p className={cn('text-xs', avail === 0 ? 'font-medium text-danger' : 'text-muted')}>Available for the event dates: <strong>{avail} {item?.unit}</strong></p>
        <div className='grid grid-cols-2 gap-3'>
          <Field label='Required'><NumberInput min={1} value={req} onChange={(n) => { setReq(n); setRes(Math.min(n, avail)); }} /></Field>
          <Field label='Reserve now'><NumberInput min={0} value={res} onChange={setRes} /></Field>
        </div>
        {reserve > avail && <Alert tone='danger'>Only {avail} available — reserving {reserve} would double-book stock.</Alert>}
        {err && <Alert tone='danger'>{err}</Alert>}
      </div>
    </Modal>
  );
}
