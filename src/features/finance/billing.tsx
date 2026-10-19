"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from "react";
import { z } from "zod";
import { addDays } from "date-fns";
import { useDB } from "@/stores/db";
import { createInvoice, issueCreditNote, recordClientPayment, recordRefund } from "@/services/sales";
import { invoiceBalance, invoicePaid } from "@/lib/calculations/finance";
import { computeInvoiceTotals } from "@/lib/calculations/invoice";
import { money, toISODate, todayISO } from "@/lib/formatting";
import { uid } from "@/lib/utils";
import { Modal, toast } from "@/components/ui/overlays";
import { Alert, Button, Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/primitives";
import { FormDialog } from "@/components/forms/form-dialog";
import type { DB, Invoice, InvoiceKind, InvoiceType, TaxMode } from "@/types";

/** Create an advance / milestone / partial / final invoice (or a proforma payment request) for an event. */
export function InvoiceDialog({ open, onOpenChange, eventId, milestoneId }: { open: boolean; onOpenChange: (o: boolean) => void; eventId: string; milestoneId?: string }) {
  const db = useDB() as unknown as DB;
  const so = db.salesOrders.find((s) => s.eventId === eventId);
  const ev = db.events.find((e) => e.id === eventId);
  const unbilled = so?.milestones.filter((m) => !m.invoiceId) ?? [];
  const taxOk = db.settings.taxRegistered;
  const [type, setType] = React.useState<InvoiceType>("Proforma");
  const [mid, setMid] = React.useState("");
  const [kind, setKind] = React.useState<InvoiceKind>("Milestone");
  const [desc, setDesc] = React.useState("");
  const [amount, setAmount] = React.useState(0);
  const [taxRate, setTaxRate] = React.useState(18);
  const [taxMode, setTaxMode] = React.useState<TaxMode>("exclusive");
  const [due, setDue] = React.useState(todayISO());
  const [note, setNote] = React.useState("");
  const [issue, setIssue] = React.useState(true);
  const [error, setError] = React.useState("");

  const milestone = unbilled.find((m) => m.id === mid);
  React.useEffect(() => {
    if (!open) return;
    setError(""); setNote(""); setIssue(true);
    const m = unbilled.find((x) => x.id === milestoneId) ?? unbilled[0];
    setMid(m?.id ?? "");
    setType(taxOk ? "Tax Invoice" : "Bill of Supply");
    setTaxMode(db.settings.invoiceDefaultTaxMode);
    setKind("Milestone"); setDesc(""); setAmount(0); setTaxRate(18);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!milestone) return;
    setDue(milestone.dueDate < todayISO() ? toISODate(addDays(new Date(), 7)) : milestone.dueDate);
    setKind(milestone.name.toLowerCase().includes("advance") ? "Advance" : milestone.name.toLowerCase().includes("final") ? "Final" : "Milestone");
    // advance milestones default to a proforma request (payment not yet received)
    if (milestone.name.toLowerCase().includes("advance")) setType("Proforma");
  }, [mid]); // eslint-disable-line react-hooks/exhaustive-deps

  const effRate = so && so.total - so.taxTotal > 0 ? (so.taxTotal / (so.total - so.taxTotal)) * 100 : 0;
  const lines = milestone && so
    ? [{ id: uid("il"), description: `${milestone.name} – ${ev?.title}`, amount: milestone.amount, taxRate: so.body.taxMode === "none" ? 0 : effRate }]
    : [{ id: uid("il"), description: desc || `Payment – ${ev?.title}`, amount, taxRate }];
  const mode: TaxMode = milestone && so ? (so.body.taxMode === "none" ? "none" : "inclusive") : type === "Bill of Supply" ? "none" : taxMode;
  const totals = computeInvoiceTotals(lines, mode);

  const submit = () => {
    const r = createInvoice({ eventId, clientId: ev!.clientId, type, kind, salesOrderId: milestone ? so?.id : so?.id, milestoneId: milestone?.id, lines, taxMode: mode, dueDate: due, note, issue });
    if (!r.ok) { setError(r.error); return; }
    toast.success(issue ? `${type} issued` : "Draft saved", issue ? "PDF stored in Documents." : undefined);
    onOpenChange(false);
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Create invoice / payment request" description={`${ev?.ref} · ${ev?.title}`}
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit} disabled={totals.total <= 0}>{issue ? "Issue document" : "Save draft"}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        {error && <Alert tone="danger" className="sm:col-span-2">{error}</Alert>}
        <Field label="Document type" hint={type === "Proforma" ? "Payment request — not a tax invoice, not proof of payment." : type === "Tax Invoice" ? "Statutory document. Confirm tax settings with your accountant." : "For exempt / non-taxable supply."}>
          <Select value={type} onChange={(e) => setType(e.target.value as InvoiceType)}><option value="Proforma">Proforma (payment request)</option>{taxOk && <option value="Tax Invoice">Tax invoice</option>}<option value="Bill of Supply">Bill of supply</option></Select></Field>
        <Field label="Bill for"><Select value={mid} onChange={(e) => setMid(e.target.value)}>{unbilled.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.pct}% · {money(m.amount)}</option>)}<option value="">Custom amount…</option></Select></Field>
        {!milestone && <>
          <Field label="Kind"><Select value={kind} onChange={(e) => setKind(e.target.value as InvoiceKind)}>{["Advance", "Milestone", "Partial", "Final", "Adjustment"].map((k) => <option key={k}>{k}</option>)}</Select></Field>
          <Field label="Description"><Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Additional decor requested" /></Field>
          <Field label="Amount"><MoneyInput value={amount} onChange={setAmount} /></Field>
          <Field label="Tax treatment"><Select value={taxMode} disabled={type === "Bill of Supply"} onChange={(e) => setTaxMode(e.target.value as TaxMode)}><option value="exclusive">Tax exclusive</option><option value="inclusive">Tax inclusive</option><option value="none">No tax</option></Select></Field>
          {mode !== "none" && <Field label="GST rate %"><Select value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))}>{db.settings.taxRates.filter((t) => t.active).map((t) => <option key={t.id} value={t.rate}>{t.name}</option>)}</Select></Field>}
        </>}
        <Field label="Due date"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <Field label="Note to client" className="sm:col-span-2"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="rounded-lg bg-canvas p-3 text-sm sm:col-span-2">
          <div className="flex justify-between"><span className="text-muted">Taxable value</span><span className="tabular-nums">{money(totals.subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-muted">Tax</span><span className="tabular-nums">{money(totals.tax)}</span></div>
          <div className="mt-1 flex justify-between border-t border-line pt-1 font-semibold"><span>Total</span><span className="tabular-nums">{money(totals.total)}</span></div>
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="accent-primary" checked={issue} onChange={(e) => setIssue(e.target.checked)} />Issue immediately (uncheck to keep as draft)</label>
      </div>
    </Modal>
  );
}

export function PaymentDialog({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  const db = useDB() as unknown as DB;
  const bal = invoice ? invoiceBalance(db, invoice) : 0;
  return (
    <FormDialog open={!!invoice} onOpenChange={(o) => !o && onClose()} title="Record client payment" size="sm" submitLabel="Record payment"
      description={invoice ? `${invoice.ref} · balance ${money(bal)}. Simulated entry — no real payment is processed.` : undefined}
      schema={z.object({ amount: z.number().int().positive("Enter an amount").max(Math.max(bal, 1), "Amount exceeds the invoice balance"), method: z.enum(["Cash", "Bank Transfer", "UPI", "Cheque", "Card"]), date: z.string().min(1), reference: z.string().optional(), note: z.string().optional() })}
      fields={[{ name: "amount", label: "Amount received", type: "money", required: true }, { name: "method", label: "Method", type: "select", required: true, options: db.settings.paymentMethods.map((m) => ({ value: m, label: m })) }, { name: "date", label: "Received on", type: "date", required: true }, { name: "reference", label: "Reference / UTR" }, { name: "note", label: "Note", type: "textarea" }]}
      defaultValues={{ amount: bal, method: "Bank Transfer", date: todayISO(), reference: "", note: "" }}
      onSubmit={(v: any) => {
        if (!invoice) return;
        const r = recordClientPayment({ invoiceId: invoice.id, eventId: invoice.eventId, clientId: invoice.clientId, ...v, reference: v.reference ?? "", note: v.note ?? "" });
        if (!r.ok) return r.error;
        toast.success("Payment recorded", "Receipt created. Balances and event profit updated.");
      }} />
  );
}

export function RefundDialog({ eventId, open, onOpenChange }: { eventId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const db = useDB() as unknown as DB;
  const ev = db.events.find((e) => e.id === eventId);
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Refund / cancellation adjustment" size="sm" submitLabel="Record refund" description="Refunds are recorded as separate outgoing entries; the original payments are never edited."
      schema={z.object({ amount: z.number().int().positive("Enter an amount"), method: z.enum(["Cash", "Bank Transfer", "UPI", "Cheque", "Card"]), reference: z.string().optional(), note: z.string().min(3, "Give a reason") })}
      fields={[{ name: "amount", label: "Refund amount", type: "money", required: true }, { name: "method", label: "Method", type: "select", required: true, options: db.settings.paymentMethods.map((m) => ({ value: m, label: m })) }, { name: "reference", label: "Reference" }, { name: "note", label: "Reason", type: "textarea", required: true }]}
      defaultValues={{ amount: 0, method: "Bank Transfer", reference: "", note: "" }}
      onSubmit={(v: any) => { if (!ev) return; const r = recordRefund({ eventId, clientId: ev.clientId, amount: v.amount, method: v.method, reference: v.reference ?? "", note: v.note }); if (!r.ok) return r.error; toast.success("Refund recorded"); }} />
  );
}

export function CreditNoteDialog({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  return (
    <FormDialog open={!!invoice} onOpenChange={(o) => !o && onClose()} title="Issue credit note" size="sm" submitLabel="Issue credit note" description={invoice ? `Against ${invoice.ref} (${money(invoice.total)})` : undefined}
      schema={z.object({ amount: z.number().int().positive("Enter an amount"), reason: z.string().min(3, "Give a reason") })}
      fields={[{ name: "amount", label: "Credit amount", type: "money", required: true }, { name: "reason", label: "Reason / adjustment", type: "textarea", required: true }]}
      defaultValues={{ amount: invoice?.total ?? 0, reason: "" }}
      onSubmit={(v: any) => { if (!invoice) return; const r = issueCreditNote(invoice.id, v.amount, v.reason); if (!r.ok) return r.error; toast.success("Credit note issued"); }} />
  );
}

void invoicePaid;
