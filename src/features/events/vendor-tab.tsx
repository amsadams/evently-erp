"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CircleDollarSign, FileText, Plus, Receipt, Send, ShieldCheck, Trash2, Truck, Undo2 } from "lucide-react";
import { z } from "zod";
import { useDB } from "@/stores/db";
import { useCurrentUser } from "@/hooks/use-app";
import {
  EDITABLE, addAssignment, blankLine, cancelAgreement, createPurchaseOrder, payVendor, priceHistory, recordBill, recordDelivery, removeDraftAgreement, reviseAgreement, saveAgreement, setAgreementStatus, setBillStatus,
} from "@/services/vendors";
import { generatePODoc, generateRequirementDoc } from "@/services/documents";
import { agreementDeliveredValue, agreementLineAgreed, agreementQuotedTotal, agreementTotal } from "@/lib/calculations/quote";
import { billPaid } from "@/lib/calculations/finance";
import { vendorConflicts } from "@/lib/calculations/conflicts";
import { fmtDate, fmtDateTime, money, moneyCompact, todayISO } from "@/lib/formatting";
import { uid } from "@/lib/utils";
import { Sheet, TabPanel, TabsRoot, confirm, toast } from "@/components/ui/overlays";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, MoneyInput, NumberInput, Progress, Select, StatusBadge, Textarea } from "@/components/ui/primitives";
import { FormDialog } from "@/components/forms/form-dialog";
import { usePreview } from "@/components/documents/doc-preview";
import type { AgreementLine, DB, PayScheduleItem, VendorAssignment } from "@/types";
import { cn } from "@/lib/utils";

export function VendorTab({ eventId, readOnly }: { eventId: string; readOnly: boolean }) {
  const db = useDB() as unknown as DB;
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const list = db.assignments.filter((a) => a.eventId === eventId);
  const byDept = list.reduce<Record<string, VendorAssignment[]>>((acc, a) => { (acc[a.departmentId] ??= []).push(a); return acc; }, {});
  const committed = list.filter((a) => ["Confirmed", "Approved", "Ordered", "Partially Completed", "Completed"].includes(a.status)).reduce((s, a) => s + agreementTotal(a.lines), 0);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Multiple vendors can serve the same department. Agreed prices are stored per event and never change when a catalogue rate is edited. Committed: <strong className="text-ink">{money(committed)}</strong></p>
        {!readOnly && <Button onClick={() => setAssignOpen(true)}><Plus className="h-4 w-4" />Assign vendor</Button>}
      </div>
      {list.length === 0 ? (
        <Card><EmptyState icon={<Truck className="h-5 w-5" />} title="No vendors assigned" description="Assign vendors by department, add catalogue or custom items, negotiate prices, then issue a work order." action={!readOnly ? <Button onClick={() => setAssignOpen(true)}>Assign vendor</Button> : undefined} /></Card>
      ) : (
        <div className="space-y-5">
          {Object.entries(byDept).map(([dp, items]) => (
            <section key={dp}>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><span className="h-3 w-3 rounded-sm" style={{ background: db.departments.find((d) => d.id === dp)?.color }} />{db.departments.find((d) => d.id === dp)?.name}<Badge tone="neutral" dot={false}>{items.length} vendor{items.length > 1 ? "s" : ""}</Badge></h3>
              <div className="grid gap-3 lg:grid-cols-2">
                {items.map((a) => <AssignmentCard key={a.id} a={a} onOpen={() => setOpenId(a.id)} />)}
              </div>
            </section>
          ))}
        </div>
      )}
      <AssignDialog open={assignOpen} onOpenChange={setAssignOpen} eventId={eventId} onCreated={(id) => setOpenId(id)} />
      <AgreementSheet id={openId} onClose={() => setOpenId(null)} readOnly={readOnly} />
    </>
  );
}

function AssignmentCard({ a, onOpen }: { a: VendorAssignment; onOpen: () => void }) {
  const db = useDB() as unknown as DB;
  const v = db.vendors.find((x) => x.id === a.vendorId);
  const agreed = agreementTotal(a.lines), quoted = agreementQuotedTotal(a.lines);
  const billed = db.bills.filter((b) => b.assignmentId === a.id && b.status === "Approved").reduce((s, b) => s + b.amount, 0);
  const paid = db.payments.filter((p) => p.assignmentId === a.id && p.category === "vendor").reduce((s, p) => s + p.amount, 0);
  const delivered = a.lines.length ? a.lines.reduce((s, l) => s + (l.qty ? Math.min(1, l.deliveredQty / l.qty) : 0), 0) / a.lines.length * 100 : 0;
  return (
    <Card className="transition-shadow hover:shadow-md">
      <button onClick={onOpen} className="w-full p-4 text-left">
        <div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{v?.name}</p><p className="font-mono text-[11px] text-muted">{a.ref} · v{a.version}{a.poRef ? ` · ${a.poRef}` : ""}</p></div><StatusBadge status={a.status} /></div>
        <p className="mt-1 line-clamp-1 text-xs text-muted">{a.lines.map((l) => l.name).join(", ") || "No items yet"}</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div><p className="text-muted">Quoted</p><p className="font-medium tabular-nums">{moneyCompact(quoted)}</p></div>
          <div><p className="text-muted">Agreed</p><p className="font-semibold tabular-nums">{moneyCompact(agreed)}</p></div>
          <div><p className="text-muted">Paid / Billed</p><p className="font-medium tabular-nums">{moneyCompact(paid)} / {moneyCompact(billed)}</p></div>
        </div>
        {["Ordered", "Partially Completed", "Completed"].includes(a.status) && <div className="mt-3"><div className="mb-1 flex justify-between text-[11px] text-muted"><span>Delivery</span><span>{Math.round(delivered)}%</span></div><Progress value={delivered} tone="success" /></div>}
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">Open agreement <ArrowRight className="h-3 w-3" /></span>
      </button>
    </Card>
  );
}

function AssignDialog({ open, onOpenChange, eventId, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; eventId: string; onCreated: (id: string) => void }) {
  const db = useDB() as unknown as DB;
  const [vendorId, setVendorId] = React.useState("");
  const [dept, setDept] = React.useState("");
  const [scope, setScope] = React.useState("");
  React.useEffect(() => { if (open) { setVendorId(""); setDept(""); setScope(""); } }, [open]);
  const vendor = db.vendors.find((v) => v.id === vendorId);
  const conflicts = vendorId ? vendorConflicts(db, eventId, vendorId) : [];
  return (
    <Modal2 open={open} onOpenChange={onOpenChange} title="Assign vendor to event" onSubmit={() => {
      const r = addAssignment(eventId, vendorId, dept || vendor?.departmentIds[0] || "", scope);
      if (r.ok) { toast.success("Vendor assigned", "Add items and negotiated prices next."); onCreated(r.data); onOpenChange(false); } else toast.error(r.error);
    }} disabled={!vendorId}>
      <div className="space-y-4">
        <Field label="Vendor" required><Select value={vendorId} onChange={(e) => { setVendorId(e.target.value); setDept(db.vendors.find((v) => v.id === e.target.value)?.departmentIds[0] ?? ""); }}><option value="">Select vendor…</option>
          {db.vendors.filter((v) => v.status === "Active").map((v) => <option key={v.id} value={v.id}>{v.name} — {db.settings.vendorCategories.find((c) => c.id === v.categoryId)?.name}</option>)}</Select></Field>
        <Field label="Department"><Select value={dept} onChange={(e) => setDept(e.target.value)}>{db.departments.filter((d) => d.active).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
        <Field label="Scope summary" hint="Optional — describe what this vendor is responsible for."><Textarea value={scope} onChange={(e) => setScope(e.target.value)} /></Field>
        {conflicts.map((c, i) => <Alert key={i} tone={c.severity === "critical" ? "danger" : "warning"} title="Availability conflict">{c.message}</Alert>)}
      </div>
    </Modal2>
  );
}

import { Modal } from "@/components/ui/overlays";
function Modal2({ open, onOpenChange, title, children, onSubmit, disabled, submitLabel = "Assign" }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: React.ReactNode; onSubmit: () => void; disabled?: boolean; submitLabel?: string }) {
  return <Modal open={open} onOpenChange={onOpenChange} title={title} size="sm" footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={onSubmit} disabled={disabled}>{submitLabel}</Button></>}>{children}</Modal>;
}

/* ============================ Agreement editor ============================ */
function AgreementSheet({ id, onClose, readOnly }: { id: string | null; onClose: () => void; readOnly: boolean }) {
  const db = useDB() as unknown as DB;
  const a = db.assignments.find((x) => x.id === id);
  if (!a) return <Sheet open={false} onOpenChange={() => onClose()} title="Agreement">{null}</Sheet>;
  return <AgreementEditor key={a.id} a={a} onClose={onClose} readOnly={readOnly} />;
}

function AgreementEditor({ a, onClose, readOnly }: { a: VendorAssignment; onClose: () => void; readOnly: boolean }) {
  const db = useDB() as unknown as DB;
  const { can } = useCurrentUser();
  const preview = usePreview();
  const vendor = db.vendors.find((v) => v.id === a.vendorId)!;
  const event = db.events.find((e) => e.id === a.eventId)!;
  const [tab, setTab] = React.useState("items");
  const [lines, setLines] = React.useState<AgreementLine[]>(a.lines);
  const [meta, setMeta] = React.useState({ scope: a.scope, setupTime: a.setupTime, accessInstructions: a.accessInstructions, deliveryDetails: a.deliveryDetails, deadline: a.deadline ?? "", terms: a.terms });
  const [schedule, setSchedule] = React.useState<PayScheduleItem[]>(a.schedule);
  const [billOpen, setBillOpen] = React.useState(false);
  const [payFor, setPayFor] = React.useState<{ billId?: string } | null>(null);
  const [catPick, setCatPick] = React.useState("");
  const [reviseOpen, setReviseOpen] = React.useState(false);
  const editable = EDITABLE.includes(a.status) && !readOnly;
  const dirty = JSON.stringify(lines) !== JSON.stringify(a.lines) || meta.scope !== a.scope || meta.setupTime !== a.setupTime || meta.accessInstructions !== a.accessInstructions || meta.deliveryDetails !== a.deliveryDetails || meta.terms !== a.terms || (meta.deadline || undefined) !== a.deadline || JSON.stringify(schedule) !== JSON.stringify(a.schedule);
  const agreed = agreementTotal(lines), quoted = agreementQuotedTotal(lines);
  const catalogue = db.catalogue.filter((c) => c.scope === "vendor" && c.vendorId === a.vendorId && c.active);
  const bills = db.bills.filter((b) => b.assignmentId === a.id);
  const pays = db.payments.filter((p) => p.assignmentId === a.id && p.category === "vendor");
  const paid = pays.reduce((s, p) => s + p.amount, 0);
  const billed = bills.filter((b) => b.status === "Approved").reduce((s, b) => s + b.amount, 0);
  const pctSum = schedule.reduce((s, x) => s + x.pct, 0);
  const docs = db.documents.filter((d) => d.sourceId === a.id).sort((x, y) => y.createdAt.localeCompare(x.createdAt));

  const persist = (): boolean => {
    if (!editable) return true;
    if (schedule.length && Math.round(pctSum * 100) !== 10000) { toast.error("Payment schedule must total 100%", `Currently ${pctSum}%.`); setTab("terms"); return false; }
    const r = saveAgreement(a.id, { lines, ...meta, deadline: meta.deadline || undefined, schedule });
    if (!r.ok) { toast.error(r.error); return false; }
    return true;
  };
  const act = (status: Parameters<typeof setAgreementStatus>[1], okMsg: string, reason = "") => {
    if (!persist()) return;
    const r = setAgreementStatus(a.id, status, reason);
    if (r.ok) toast.success(okMsg); else toast.error("Could not update status", r.error);
  };
  const updLine = (i: number, patch: Partial<AgreementLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const addCatalogue = () => {
    const c = catalogue.find((x) => x.id === catPick); if (!c) return;
    const last = priceHistory(db, a.vendorId, c.name, c.id)[0];
    setLines((ls) => [...ls, { ...blankLine(), catalogueItemId: c.id, name: c.name, unit: c.unit, catalogueRate: c.rate, quotedRate: c.rate, agreedRate: last?.rate ?? c.rate }]);
    setCatPick(""); toast.info("Item added", last ? `Agreed rate pre-filled from last event (${money(last.rate)}). Adjust if negotiated.` : "Rate pre-filled from catalogue snapshot.");
  };

  const statusActions = (
    <div className="flex flex-wrap items-center gap-2">
      {editable && <Button variant="outline" disabled={!dirty} onClick={() => { if (persist()) toast.success("Draft saved"); }}>Save draft</Button>}
      {!readOnly && a.status === "Draft" && <Button onClick={() => act("Sent", "Marked as sent — requirement PDF generated")}><Send className="h-4 w-4" />Send to vendor</Button>}
      {!readOnly && a.status === "Sent" && <Button variant="outline" onClick={() => act("Awaiting Confirmation", "Waiting for vendor confirmation")}>Awaiting confirmation</Button>}
      {!readOnly && ["Draft", "Sent", "Awaiting Confirmation", "Revised"].includes(a.status) && a.status !== "Draft" && <Button onClick={() => act("Confirmed", "Scope confirmed & snapshot stored")}><ShieldCheck className="h-4 w-4" />Confirm scope</Button>}
      {!readOnly && a.status === "Draft" && <Button variant="outline" onClick={() => act("Confirmed", "Scope confirmed & snapshot stored")}>Confirm scope</Button>}
      {a.status === "Confirmed" && can("quotes.approve") && <Button onClick={() => act("Approved", "Agreement approved")}>Approve</Button>}
      {a.status === "Approved" && !readOnly && <Button onClick={() => { const r = createPurchaseOrder(a.id); if (r.ok) toast.success(`Work order ${r.data} issued`, "PDF stored in Documents."); else toast.error(r.error); }}><FileText className="h-4 w-4" />Issue work order</Button>}
      {!readOnly && !editable && !["Cancelled", "Completed"].includes(a.status) && <Button variant="outline" onClick={() => setReviseOpen(true)}><Undo2 className="h-4 w-4" />Revise</Button>}
      {!readOnly && a.status !== "Cancelled" && a.status !== "Completed" && <Button variant="ghost" onClick={async () => { if (a.status === "Draft") { if (await confirm({ title: "Delete draft agreement?", message: "This draft has no commitments.", danger: true, confirmLabel: "Delete" })) { removeDraftAgreement(a.id); onClose(); } } else if (await confirm({ title: "Cancel agreement?", message: "Cancelled agreements stop counting as committed cost. History is kept.", danger: true, confirmLabel: "Cancel agreement" })) cancelAgreement(a.id, "Cancelled by user"); }}>{a.status === "Draft" ? "Delete" : "Cancel"}</Button>}
    </div>
  );

  return (
    <>
      <Sheet open onOpenChange={(o) => !o && onClose()} width="max-w-4xl" title={`${vendor.name}`} description={`${a.ref} · version ${a.version} · ${event.ref} ${event.title}`} footer={statusActions}>
        <div className="mb-4 flex flex-wrap items-center gap-2"><StatusBadge status={a.status} /><Badge tone="neutral" dot={false}>v{a.version}</Badge>{a.poRef && <Badge tone="primary" dot={false}>{a.poRef}</Badge>}
          <span className="ml-auto text-xs text-muted">Quoted <strong className="text-ink">{money(quoted)}</strong> → Agreed <strong className="text-ink">{money(agreed)}</strong> {quoted > 0 && <span className={cn(agreed <= quoted ? "text-success" : "text-danger")}>({agreed <= quoted ? "−" : "+"}{Math.abs(Math.round(((agreed - quoted) / quoted) * 1000) / 10)}%)</span>}</span></div>
        {!editable && !readOnly && !["Cancelled", "Completed"].includes(a.status) && <Alert tone="info" className="mb-3">Confirmed scope is locked as a historical snapshot. Use <strong>Revise</strong> to create a new version.</Alert>}
        <TabsRoot value={tab} onValueChange={setTab} tabs={[{ value: "items", label: "Items & prices", count: lines.length }, { value: "terms", label: "Terms & schedule" }, { value: "delivery", label: "Delivery" }, { value: "billing", label: "Bills & payments", count: bills.length }, { value: "versions", label: "Versions", count: a.snapshots.length }, { value: "docs", label: "Documents", count: docs.length }]}>
          <TabPanel value="items">
            {editable && (
              <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg bg-canvas p-3">
                <div className="min-w-[14rem] flex-1"><Field label="Add from vendor catalogue"><Select value={catPick} onChange={(e) => setCatPick(e.target.value)}><option value="">Select service / item…</option>{catalogue.map((c) => <option key={c.id} value={c.id}>{c.name} — {money(c.rate)}/{c.unit}</option>)}</Select></Field></div>
                <Button variant="outline" onClick={addCatalogue} disabled={!catPick}><Plus className="h-4 w-4" />Add</Button>
                <Button variant="outline" onClick={() => setLines((ls) => [...ls, blankLine()])}><Plus className="h-4 w-4" />Custom item</Button>
              </div>
            )}
            {lines.length === 0 ? <EmptyState title="No items yet" description="Add catalogue services or custom items, then record the vendor's quote and the agreed rate." /> : (
              <div className="scroll-thin overflow-x-auto rounded-lg border border-line">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="bg-canvas text-xs text-muted"><tr>{["Item / service", "Qty", "Unit", "Vendor quote", "Agreed rate", "Disc %", "By", "Line total", ""].map((h) => <th key={h} className="px-2 py-2 text-left font-medium">{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-line">
                    {lines.map((l, i) => {
                      const hist = priceHistory(db, a.vendorId, l.name, l.catalogueItemId)[0];
                      const diff = l.catalogueRate && l.agreedRate ? Math.round(((l.agreedRate - l.catalogueRate) / l.catalogueRate) * 100) : 0;
                      return (
                        <tr key={l.id} className="align-top">
                          <td className="min-w-[200px] px-2 py-2">{editable ? <Input aria-label="Item name" value={l.name} onChange={(e) => updLine(i, { name: e.target.value })} placeholder="Item description" /> : <span className="font-medium">{l.name}</span>}
                            <p className="mt-1 text-[11px] text-muted">{l.catalogueItemId ? `Catalogue ${money(l.catalogueRate)}` : "Custom item"}{hist ? ` · last agreed ${money(hist.rate)}` : ""}{diff !== 0 && l.catalogueItemId ? ` · ${diff > 0 ? "+" : ""}${diff}% vs catalogue` : ""}</p>
                            {editable ? <Input aria-label="Remarks" className="mt-1 h-7 text-xs" value={l.remarks} onChange={(e) => updLine(i, { remarks: e.target.value })} placeholder="Remarks / spec" /> : l.remarks && <p className="text-[11px] text-muted">{l.remarks}</p>}</td>
                          <td className="w-20 px-2 py-2">{editable ? <NumberInput aria-label="Quantity" value={l.qty} step={0.5} onChange={(n) => updLine(i, { qty: n })} /> : <span className="tabular-nums">{l.qty}</span>}</td>
                          <td className="w-24 px-2 py-2">{editable ? <Input aria-label="Unit" value={l.unit} onChange={(e) => updLine(i, { unit: e.target.value })} /> : l.unit}</td>
                          <td className="w-32 px-2 py-2">{editable ? <MoneyInput aria-label="Quoted rate" value={l.quotedRate} onChange={(m) => updLine(i, { quotedRate: m })} /> : <span className="tabular-nums">{money(l.quotedRate)}</span>}</td>
                          <td className="w-32 px-2 py-2">{editable ? <MoneyInput aria-label="Agreed rate" value={l.agreedRate} onChange={(m) => updLine(i, { agreedRate: m })} /> : <span className="font-medium tabular-nums">{money(l.agreedRate)}</span>}</td>
                          <td className="w-20 px-2 py-2">{editable ? <NumberInput aria-label="Discount percent" value={l.discountPct} onChange={(n) => updLine(i, { discountPct: Math.min(100, n) })} /> : <span className="tabular-nums">{l.discountPct}%</span>}</td>
                          <td className="w-28 px-2 py-2">{editable ? <Select aria-label="Responsible" value={l.responsible} onChange={(e) => updLine(i, { responsible: e.target.value as any })}><option value="vendor">Vendor</option><option value="internal">Internal</option></Select> : <span className="capitalize">{l.responsible}</span>}</td>
                          <td className="w-28 px-2 py-2 text-right font-semibold tabular-nums">{money(agreementLineAgreed(l))}</td>
                          <td className="w-10 px-1 py-2">{editable && <Button variant="ghost" size="icon" aria-label="Remove item" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-canvas text-sm"><tr><td colSpan={3} className="px-2 py-2 text-right text-xs text-muted">Totals (excl. applicable taxes)</td><td className="px-2 py-2 text-right tabular-nums text-muted">{money(quoted)}</td><td colSpan={3} /><td className="px-2 py-2 text-right text-xs text-muted">Agreed</td><td className="px-2 py-2 text-right font-bold tabular-nums">{money(agreed)}</td></tr></tfoot>
                </table>
              </div>
            )}
          </TabPanel>

          <TabPanel value="terms">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Scope of work" className="sm:col-span-2"><Textarea disabled={!editable} value={meta.scope} onChange={(e) => setMeta({ ...meta, scope: e.target.value })} /></Field>
              <Field label="Setup / arrival time"><Input disabled={!editable} value={meta.setupTime} onChange={(e) => setMeta({ ...meta, setupTime: e.target.value })} placeholder="e.g. D-1 14:00" /></Field>
              <Field label="Deadline"><Input type="date" disabled={!editable} value={meta.deadline} onChange={(e) => setMeta({ ...meta, deadline: e.target.value })} /></Field>
              <Field label="Access instructions"><Textarea disabled={!editable} value={meta.accessInstructions} onChange={(e) => setMeta({ ...meta, accessInstructions: e.target.value })} /></Field>
              <Field label="Delivery details"><Textarea disabled={!editable} value={meta.deliveryDetails} onChange={(e) => setMeta({ ...meta, deliveryDetails: e.target.value })} /></Field>
              <Field label="Terms & responsibilities" className="sm:col-span-2"><Textarea disabled={!editable} value={meta.terms} onChange={(e) => setMeta({ ...meta, terms: e.target.value })} /></Field>
            </div>
            <h4 className="mb-2 mt-5 text-sm font-semibold">Payment schedule <span className={cn("ml-2 text-xs font-normal", Math.round(pctSum * 100) === 10000 ? "text-success" : "text-danger")}>{pctSum}% allocated</span></h4>
            <div className="space-y-2">
              {schedule.map((s, i) => (
                <div key={s.id} className="grid grid-cols-[1.4fr_.6fr_1fr_auto_auto] items-center gap-2">
                  <Input aria-label="Milestone label" disabled={!editable} value={s.label} onChange={(e) => setSchedule((x) => x.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} />
                  <NumberInput aria-label="Percent" disabled={!editable} value={s.pct} onChange={(n) => setSchedule((x) => x.map((y, j) => (j === i ? { ...y, pct: n } : y)))} />
                  <Input aria-label="Due date" type="date" disabled={!editable} value={s.dueDate} onChange={(e) => setSchedule((x) => x.map((y, j) => (j === i ? { ...y, dueDate: e.target.value } : y)))} />
                  <span className="text-right text-xs tabular-nums text-muted">{money(Math.round((agreed * s.pct) / 100))}</span>
                  {editable && <Button variant="ghost" size="icon" aria-label="Remove milestone" onClick={() => setSchedule((x) => x.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>}
                </div>
              ))}
              {editable && <Button variant="outline" size="sm" onClick={() => setSchedule((x) => [...x, { id: uid("ps"), label: "Milestone", pct: 0, dueDate: event.startDate }])}><Plus className="h-3.5 w-3.5" />Add milestone</Button>}
            </div>
          </TabPanel>

          <TabPanel value="delivery">
            <DeliveryPanel a={a} readOnly={readOnly} />
          </TabPanel>

          <TabPanel value="billing">
            <div className="mb-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              {[["Agreed (order value)", money(agreed)], ["Delivered value", money(agreementDeliveredValue(a.lines))], ["Billed (approved)", money(billed)], ["Paid", money(paid)]].map(([k, v]) => <div key={k} className="rounded-lg border border-line p-3"><p className="text-xs text-muted">{k}</p><p className="font-semibold tabular-nums">{v}</p></div>)}
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {can("finance.write") && ["Ordered", "Partially Completed", "Completed"].includes(a.status) && <Button variant="outline" onClick={() => setBillOpen(true)}><Receipt className="h-4 w-4" />Record vendor bill</Button>}
              {can("finance.write") && a.status !== "Draft" && a.status !== "Cancelled" && <Button variant="outline" onClick={() => setPayFor({})}><CircleDollarSign className="h-4 w-4" />Record advance / payment</Button>}
            </div>
            <Card>
              <CardHeader title="Vendor bills" description="Vendor-issued documents recorded against this work order" />
              {bills.length === 0 ? <EmptyState title="No bills yet" description="Bills can be recorded once a work order is issued." /> : (
                <ul className="divide-y divide-line">{bills.map((b) => {
                  const bp = billPaid(db, b.id);
                  return (
                    <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1"><p className="text-sm font-medium">{b.vendorBillNo} <span className="font-mono text-[11px] text-muted">{b.ref}</span></p><p className="text-xs text-muted">Billed {fmtDate(b.date)} · due {fmtDate(b.dueDate)}{b.note ? ` · ${b.note}` : ""}</p></div>
                      <div className="text-right text-sm tabular-nums"><p className="font-semibold">{money(b.amount)}</p><p className="text-xs text-muted">paid {money(bp)}</p></div>
                      <StatusBadge status={b.status === "Approved" && bp >= b.amount ? "Paid" : b.status} />
                      {can("finance.write") && <div className="flex gap-1">
                        {b.status === "Pending" || b.status === "Disputed" ? <Button size="sm" variant="outline" onClick={() => { setBillStatus(b.id, "Approved"); toast.success("Bill approved", "It now counts as vendor payable."); }}>Approve</Button> : null}
                        {b.status === "Pending" && <Button size="sm" variant="ghost" onClick={() => setBillStatus(b.id, "Disputed")}>Dispute</Button>}
                        {b.status === "Approved" && bp < b.amount && <Button size="sm" onClick={() => setPayFor({ billId: b.id })}>Pay</Button>}
                      </div>}
                    </li>
                  );
                })}</ul>
              )}
            </Card>
            <Card className="mt-3">
              <CardHeader title="Payment history" />
              {pays.length === 0 ? <EmptyState title="No payments yet" /> : <ul className="divide-y divide-line">{pays.map((p) => <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"><span><span className="font-medium">{p.ref}</span> <span className="text-xs text-muted">{fmtDate(p.date)} · {p.method} · {p.reference}{p.billId ? " · against bill" : " · advance"}</span></span><span className="font-semibold tabular-nums">{money(p.amount)}</span></li>)}</ul>}
            </Card>
          </TabPanel>

          <TabPanel value="versions">
            {a.snapshots.length === 0 ? <EmptyState title="No confirmed snapshots yet" description="When the scope is confirmed, an immutable copy of the lines and prices is stored here." /> : (
              <ol className="space-y-3">{[...a.snapshots].reverse().map((s, i) => (
                <li key={i} className="rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">Version {s.version} <span className="font-normal text-muted">· {s.status} · {fmtDateTime(s.at)}</span></p><p className="text-sm tabular-nums">Agreed <strong>{money(s.lines.reduce((t, l) => t + agreementLineAgreed(l), 0))}</strong></p></div>
                  <p className="text-xs text-muted">{s.reason} — {db.users.find((u) => u.id === s.byUserId)?.name}</p>
                  <ul className="mt-2 grid gap-1 text-xs text-muted sm:grid-cols-2">{s.lines.map((l) => <li key={l.id} className="flex justify-between gap-2"><span className="truncate">{l.qty} × {l.name}</span><span className="tabular-nums">{money(agreementLineAgreed(l))}</span></li>)}</ul>
                </li>))}</ol>
            )}
          </TabPanel>

          <TabPanel value="docs">
            <div className="mb-3 flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => { if (dirty && !persist()) return; const d = generateRequirementDoc(a.id); if (d) { toast.success(`Requirement PDF v${d.version} generated`); preview.show(d.snapshot); } }}><FileText className="h-4 w-4" />Generate requirement PDF</Button>
              {a.poRef && <Button variant="outline" onClick={() => { const d = generatePODoc(a.id); if (d) preview.show(d.snapshot); }}><FileText className="h-4 w-4" />Regenerate work order PDF</Button>}
            </div>
            <Card>{docs.length === 0 ? <EmptyState title="No documents generated" /> : <ul className="divide-y divide-line">{docs.map((d) => <li key={d.id}><button onClick={() => preview.show(d.snapshot)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-canvas"><FileText className="h-4 w-4 text-muted" /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{d.kind} <span className="text-muted">v{d.version}</span> {d.superseded && <Badge tone="neutral" dot={false}>superseded</Badge>}</span><span className="text-xs text-muted">{d.ref} · {fmtDateTime(d.createdAt)}</span></span><span className="text-xs font-medium text-primary">Preview PDF</span></button></li>)}</ul>}</Card>
            <p className="mt-2 text-xs text-muted">The requirement list is an RFQ / scope document until the scope is confirmed — only then are agreed rates included. Work orders are issued from approved agreements.</p>
          </TabPanel>
        </TabsRoot>
        {preview.node}
      </Sheet>

      <FormDialog open={reviseOpen} onOpenChange={setReviseOpen} title="Revise agreement" description="Creates a new version; the confirmed snapshot is preserved." size="sm" submitLabel="Create revision"
        schema={z.object({ reason: z.string().min(5, "Describe what is changing") })} fields={[{ name: "reason", label: "Reason for revision", type: "textarea", required: true }]} defaultValues={{ reason: "" }}
        onSubmit={(v: any) => { const r = reviseAgreement(a.id, v.reason); if (!r.ok) return r.error; toast.success(`Version ${a.version + 1} drafted`, "Edit the items, then re-confirm with the vendor."); }} />

      <FormDialog open={billOpen} onOpenChange={setBillOpen} title="Record vendor bill" description={`Matched against ${a.ref}. Agreed order value ${money(agreed)}.`} size="sm" submitLabel="Record bill"
        schema={z.object({ vendorBillNo: z.string().min(2, "Vendor's invoice number is required"), date: z.string().min(1), dueDate: z.string().min(1), amount: z.number().int().positive("Enter the bill amount"), note: z.string().optional() })}
        fields={[{ name: "vendorBillNo", label: "Vendor invoice no.", required: true }, { name: "amount", label: "Bill amount", type: "money", required: true }, { name: "date", label: "Bill date", type: "date", required: true }, { name: "dueDate", label: "Due date", type: "date", required: true }, { name: "note", label: "Note", type: "textarea" }]}
        defaultValues={{ vendorBillNo: "", amount: Math.max(0, agreed - bills.filter((b) => b.status !== "Cancelled").reduce((s, b) => s + b.amount, 0)), date: todayISO(), dueDate: todayISO(), note: "" }}
        onSubmit={(v: any) => { const r = recordBill({ assignmentId: a.id, ...v, note: v.note ?? "" }); if (!r.ok) return r.error; toast.success("Vendor bill recorded", "Approve it to include it in payables."); }} />

      <FormDialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)} title={payFor?.billId ? "Pay vendor bill" : "Record vendor advance / payment"} description="Simulated entry — no money moves. Total payments cannot exceed the agreed value." size="sm" submitLabel="Record payment"
        schema={z.object({ amount: z.number().int().positive("Enter an amount"), method: z.enum(["Cash", "Bank Transfer", "UPI", "Cheque", "Card"]), date: z.string().min(1), reference: z.string().optional(), note: z.string().optional() })}
        fields={[{ name: "amount", label: "Amount", type: "money", required: true }, { name: "method", label: "Method", type: "select", required: true, options: db.settings.paymentMethods.map((m) => ({ value: m, label: m })) }, { name: "date", label: "Payment date", type: "date", required: true }, { name: "reference", label: "Reference / UTR" }, { name: "note", label: "Note", type: "textarea" }]}
        defaultValues={{ amount: payFor?.billId ? (() => { const b = bills.find((x) => x.id === payFor.billId); return b ? b.amount - billPaid(db, b.id) : 0; })() : Math.max(0, Math.round((agreed * (schedule[0]?.pct ?? 50)) / 100) - paid), method: "Bank Transfer", date: todayISO(), reference: "", note: payFor?.billId ? "" : "Advance" }}
        onSubmit={(v: any) => { const r = payVendor({ assignmentId: a.id, billId: payFor?.billId, ...v, reference: v.reference ?? "", note: v.note ?? "" }); if (!r.ok) return r.error; toast.success("Payment recorded", "Payables and event profitability updated."); }} />
      <span className="sr-only"><AlertTriangle />{vendor.name}<Link href="/">.</Link></span>
    </>
  );
}

function DeliveryPanel({ a, readOnly }: { a: VendorAssignment; readOnly: boolean }) {
  const [vals, setVals] = React.useState<Record<string, number>>(() => Object.fromEntries(a.lines.map((l) => [l.id, l.deliveredQty])));
  const active = ["Ordered", "Partially Completed", "Completed"].includes(a.status);
  if (!active) return <EmptyState icon={<Truck className="h-5 w-5" />} title="Delivery tracking starts after the work order" description="Approve the agreement and issue a purchase / work order to track partial delivery and completion." />;
  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[520px] text-sm"><thead className="bg-canvas text-xs text-muted"><tr><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-right">Ordered</th><th className="px-3 py-2 text-right">Delivered</th><th className="px-3 py-2 text-right">Outstanding</th></tr></thead>
          <tbody className="divide-y divide-line">{a.lines.map((l) => (
            <tr key={l.id}><td className="px-3 py-2">{l.name}</td><td className="px-3 py-2 text-right tabular-nums">{l.qty} {l.unit}</td>
              <td className="w-32 px-3 py-2"><NumberInput aria-label={`Delivered ${l.name}`} disabled={readOnly} value={vals[l.id] ?? 0} onChange={(n) => setVals((v) => ({ ...v, [l.id]: Math.min(l.qty, n) }))} /></td>
              <td className={cn("px-3 py-2 text-right tabular-nums", l.qty - (vals[l.id] ?? 0) > 0 ? "text-warning" : "text-success")}>{Math.max(0, l.qty - (vals[l.id] ?? 0))}</td></tr>))}</tbody></table>
      </div>
      {!readOnly && <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" onClick={() => setVals(Object.fromEntries(a.lines.map((l) => [l.id, l.qty])))}>Mark all delivered</Button>
        <Button onClick={() => { const r = recordDelivery(a.id, vals); if (r.ok) toast.success("Delivery updated"); else toast.error(r.error); }}>Save delivery</Button></div>}
    </>
  );
}
