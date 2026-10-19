"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Check, Copy, Eye, FileText, Plus, Receipt, Send, Trash2, Undo2, Wand2 } from "lucide-react";
import { addDays } from "date-fns";
import { useDB } from "@/stores/db";
import { useCurrentUser } from "@/hooks/use-app";
import { approveQuoteInternally, convertToBooking, createInvoice, DEFAULT_MILESTONES, importVendorLines, reviseQuotation, saveQuotation, setQuoteStatus } from "@/services/sales";
import { generateQuotationDoc } from "@/services/documents";
import { computeQuote } from "@/lib/calculations/quote";
import { COMMITTED_STATUSES, assignmentTotal } from "@/lib/calculations/finance";
import { fmtDate, fmtDateTime, money, toISODate } from "@/lib/formatting";
import { quotationDoc } from "@/lib/documents/builders";
import { uid } from "@/lib/utils";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { Modal, confirm, toast } from "@/components/ui/overlays";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, MoneyInput, NumberInput, Select, StatusBadge, Textarea } from "@/components/ui/primitives";
import { FormDialog } from "@/components/forms/form-dialog";
import { usePreview } from "@/components/documents/doc-preview";
import type { DB, Quotation, QuoteBody, QuoteLine, TaxMode } from "@/types";
import { cn } from "@/lib/utils";

const EDITABLE = ["Draft", "Internal Review"];

export function QuotationEditor({ id }: { id: string }) {
  const db = useDB() as unknown as DB;
  const q = db.quotations.find((x) => x.id === id);
  const router = useRouter();
  if (!q) return <EmptyState title="Quotation not found" action={<Button onClick={() => router.push("/quotations")}>Back to quotations</Button>} />;
  return <Editor key={q.id + ":" + q.version} q={q} />;
}

function Editor({ q }: { q: Quotation }) {
  const db = useDB() as unknown as DB;
  const router = useRouter();
  const { can } = useCurrentUser();
  const preview = usePreview();
  const [body, setBody] = React.useState<QuoteBody>(q.body);
  const [title, setTitle] = React.useState(q.title);
  const [validUntil, setValidUntil] = React.useState(q.validUntil);
  const [pick, setPick] = React.useState("");
  const [reviseOpen, setReviseOpen] = React.useState(false);
  const [bookOpen, setBookOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const editable = EDITABLE.includes(q.status) && can("quotes.write");
  const dirty = JSON.stringify(body) !== JSON.stringify(q.body) || title !== q.title || validUntil !== q.validUntil;
  const t = computeQuote(body);
  const ev = db.events.find((e) => e.id === q.eventId);
  const client = db.clients.find((c) => c.id === q.clientId);
  const company = db.catalogue.filter((c) => c.scope === "company" && c.active);
  const committedCost = db.assignments.filter((a) => a.eventId === q.eventId && COMMITTED_STATUSES.includes(a.status)).reduce((s, a) => s + assignmentTotal(a), 0);
  const margin = t.taxable - committedCost;

  const upd = (patch: Partial<QuoteBody>) => setBody((b) => ({ ...b, ...patch }));
  const updLine = (i: number, patch: Partial<QuoteLine>) => setBody((b) => ({ ...b, lines: b.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const save = (silent = false) => {
    const r = saveQuotation(q.id, { body, title, validUntil });
    if (!r.ok) { toast.error(r.error); return false; }
    if (!silent) toast.success("Quotation saved");
    return true;
  };
  const addCatalogue = () => {
    const c = company.find((x) => x.id === pick); if (!c) return;
    upd({ lines: [...body.lines, { id: uid("ql"), departmentId: c.departmentId, catalogueItemId: c.id, name: c.name, description: "", qty: 1, unit: c.unit, rate: c.rate, discountPct: 0, taxRate: c.taxRate }] });
    setPick("");
  };
  const status = (s: Quotation["status"], msg: string) => { if (dirty && !save(true)) return; const r = setQuoteStatus(q.id, s); if (r.ok) toast.success(msg); else toast.error(r.error); };
  const showPdf = () => { const snap = quotationDoc({ ...db, quotations: db.quotations.map((x) => (x.id === q.id ? { ...q, body, title, validUntil } : x)) } as DB, { ...q, body, title, validUntil }); preview.show(snap); };

  const grouped = React.useMemo(() => {
    const m = new Map<string, number[]>();
    body.lines.forEach((l, i) => m.set(l.departmentId, [...(m.get(l.departmentId) ?? []), i]));
    return [...m.entries()];
  }, [body.lines]);

  const convertInvoice = () => {
    const r = createInvoice({ eventId: q.eventId, clientId: q.clientId, type: db.settings.taxRegistered ? "Tax Invoice" : "Bill of Supply", kind: "Final", lines: [...t.lines.map((l, i) => ({ id: uid("il"), description: body.lines[i].name, amount: l.net, taxRate: body.lines[i].taxRate })), ...t.charges.map((c, i) => ({ id: uid("il"), description: body.charges[i].label, amount: c.net, taxRate: body.charges[i].taxRate }))], taxMode: body.taxMode, dueDate: toISODate(addDays(new Date(), 15)), note: `Raised from quotation ${q.ref} v${q.version}`, issue: false });
    if (r.ok) { toast.success("Draft invoice created", "Review and issue it from Invoices."); router.push("/invoices"); } else toast.error(r.error);
  };

  const actions = (
    <>
      <Button variant="outline" onClick={showPdf}><Eye className="h-4 w-4" />Preview PDF</Button>
      {editable && <Button variant="outline" disabled={!dirty} onClick={() => save()}>Save</Button>}
      {can("quotes.write") && q.status === "Draft" && <Button onClick={() => status("Internal Review", "Submitted for internal review")}>Submit for review</Button>}
      {can("quotes.approve") && ["Draft", "Internal Review"].includes(q.status) && !q.reviewApproved && <Button variant="outline" onClick={() => { if (dirty) save(true); approveQuoteInternally(q.id); toast.success("Approved internally"); }}><Check className="h-4 w-4" />Approve internally</Button>}
      {can("quotes.write") && q.reviewApproved && ["Draft", "Internal Review"].includes(q.status) && <Button onClick={() => status("Sent", "Marked as sent — PDF snapshot stored")}><Send className="h-4 w-4" />Mark as sent</Button>}
      {can("quotes.write") && q.status === "Sent" && <><Button variant="outline" onClick={() => status("Rejected", "Marked rejected")}>Client rejected</Button><Button onClick={() => status("Approved", "Client approval recorded")}><Check className="h-4 w-4" />Client approved</Button></>}
      {can("quotes.write") && q.status === "Approved" && <><Button variant="outline" onClick={() => convertInvoice()}><Receipt className="h-4 w-4" />To invoice</Button><Button onClick={() => setBookOpen(true)}>Convert to booking</Button></>}
      {can("quotes.write") && ["Sent", "Approved", "Rejected", "Expired"].includes(q.status) && <Button variant="outline" onClick={() => setReviseOpen(true)}><Undo2 className="h-4 w-4" />Revise</Button>}
    </>
  );

  return (
    <>
      <BackLink href="/quotations">Quotations</BackLink>
      <PageHeader title={<span className="flex flex-wrap items-center gap-2">{q.ref}<span className="text-base font-normal text-muted">v{q.version}</span><StatusBadge status={q.status} /></span>}
        description={<span>For <Link className="font-medium text-primary hover:underline" href={`/clients/${q.clientId}`}>{client?.name}</Link> · <Link className="font-medium text-primary hover:underline" href={`/events/${q.eventId}`}>{ev?.ref} {ev?.title}</Link></span>}
        meta={<>{q.reviewApproved && <Badge tone="success">Internally approved</Badge>}{q.convertedTo?.kind === "booking" && <Badge tone="primary">Booking {db.salesOrders.find((s) => s.id === (q.convertedTo as any).salesOrderId)?.ref}</Badge>}</>}
        actions={actions} />
      {!editable && <Alert tone="info" className="mb-4">This version is {q.status.toLowerCase()} and locked. {q.status !== "Converted" ? "Use Revise to create a new version — the issued version and its PDF are preserved." : "It was converted to a booking; raise a new quotation for additional scope."}</Alert>}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          <Card className="p-4"><div className="grid gap-3 sm:grid-cols-4">
            <Field label="Title" className="sm:col-span-2"><Input disabled={!editable} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
            <Field label="Valid until"><Input type="date" disabled={!editable} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></Field>
            <Field label="Tax treatment"><Select disabled={!editable} value={body.taxMode} onChange={(e) => upd({ taxMode: e.target.value as TaxMode })}><option value="exclusive">Tax exclusive</option><option value="inclusive">Tax inclusive</option><option value="none">No tax</option></Select></Field>
          </div></Card>

          <Card>
            <CardHeader title="Line items" description="Grouped by event department. Catalogue prices are copied into the line — later catalogue changes never alter this quotation." />
            {editable && (
              <div className="flex flex-wrap items-end gap-2 border-b border-line bg-canvas/60 p-3">
                <div className="min-w-[14rem] flex-1"><Field label="Add from company catalogue"><Select value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Select service…</option>{company.map((c) => <option key={c.id} value={c.id}>{c.name} — {money(c.rate)}</option>)}</Select></Field></div>
                <Button variant="outline" onClick={addCatalogue} disabled={!pick}><Plus className="h-4 w-4" />Add</Button>
                <Button variant="outline" onClick={() => upd({ lines: [...body.lines, { id: uid("ql"), departmentId: ev?.plans[0]?.departmentId ?? db.departments[1].id, name: "", description: "", qty: 1, unit: "lot", rate: 0, discountPct: 0, taxRate: 18 }] })}><Plus className="h-4 w-4" />Custom line</Button>
                <Button variant="outline" onClick={() => setImportOpen(true)}><Wand2 className="h-4 w-4" />Import vendor scope</Button>
              </div>
            )}
            {body.lines.length === 0 ? <EmptyState title="No line items yet" description="Add catalogue services, custom lines or import the committed vendor scope with a markup." /> : (
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead className="bg-canvas text-xs text-muted"><tr>{["Description", "Dept", "Qty", "Unit", "Rate", "Disc %", "Tax %", "Amount", ""].map((h) => <th key={h} className="px-2 py-2 text-left font-medium">{h}</th>)}</tr></thead>
                  <tbody>
                    {grouped.map(([dp, idxs]) => (
                      <React.Fragment key={dp}>
                        <tr><td colSpan={9} className="bg-subtle/60 px-2 py-1.5 text-xs font-semibold" style={{ color: db.departments.find((d) => d.id === dp)?.color }}>{db.departments.find((d) => d.id === dp)?.name ?? "General"}</td></tr>
                        {idxs.map((i) => { const l = body.lines[i]; return (
                          <tr key={l.id} className="border-b border-line align-top">
                            <td className="min-w-[220px] px-2 py-2">{editable ? <Input aria-label="Description" value={l.name} onChange={(e) => updLine(i, { name: e.target.value })} /> : <span className="font-medium">{l.name}</span>}{(editable || l.description) && (editable ? <Input aria-label="Detail" className="mt-1 h-7 text-xs" placeholder="Detail / inclusions" value={l.description} onChange={(e) => updLine(i, { description: e.target.value })} /> : <p className="text-xs text-muted">{l.description}</p>)}</td>
                            <td className="w-36 px-2 py-2">{editable ? <Select aria-label="Department" value={l.departmentId} onChange={(e) => updLine(i, { departmentId: e.target.value })}>{db.departments.filter((d) => d.active).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select> : <span className="text-xs">{db.departments.find((d) => d.id === l.departmentId)?.name}</span>}</td>
                            <td className="w-20 px-2 py-2">{editable ? <NumberInput aria-label="Quantity" value={l.qty} step={0.5} onChange={(n) => updLine(i, { qty: n })} /> : <span className="tabular-nums">{l.qty}</span>}</td>
                            <td className="w-24 px-2 py-2">{editable ? <Input aria-label="Unit" value={l.unit} onChange={(e) => updLine(i, { unit: e.target.value })} /> : l.unit}</td>
                            <td className="w-32 px-2 py-2">{editable ? <MoneyInput aria-label="Rate" value={l.rate} onChange={(m) => updLine(i, { rate: m })} /> : <span className="tabular-nums">{money(l.rate)}</span>}</td>
                            <td className="w-20 px-2 py-2">{editable ? <NumberInput aria-label="Discount" value={l.discountPct} onChange={(n) => updLine(i, { discountPct: Math.min(100, n) })} /> : <span className="tabular-nums">{l.discountPct}%</span>}</td>
                            <td className="w-20 px-2 py-2">{editable ? <Select aria-label="Tax rate" disabled={body.taxMode === "none"} value={l.taxRate} onChange={(e) => updLine(i, { taxRate: Number(e.target.value) })}>{db.settings.taxRates.filter((x) => x.active).map((x) => <option key={x.id} value={x.rate}>{x.rate}%</option>)}</Select> : <span className="tabular-nums">{body.taxMode === "none" ? "–" : l.taxRate + "%"}</span>}</td>
                            <td className="w-32 px-2 py-2 text-right font-medium tabular-nums">{money(t.lines[i].net)}</td>
                            <td className="w-10 px-1 py-2">{editable && <Button variant="ghost" size="icon" aria-label="Remove line" onClick={() => upd({ lines: body.lines.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>}</td>
                          </tr>); })}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="border-t border-line p-4">
              <div className="mb-2 flex items-center justify-between"><h4 className="text-sm font-semibold">Additional charges & fees</h4>{editable && <Button variant="outline" size="sm" onClick={() => upd({ charges: [...body.charges, { id: uid("qc"), label: "Service fee", amount: 0, taxRate: 18 }] })}><Plus className="h-3.5 w-3.5" />Add charge</Button>}</div>
              {body.charges.length === 0 ? <p className="text-xs text-muted">No additional charges.</p> : body.charges.map((c, i) => (
                <div key={c.id} className="mb-2 grid grid-cols-[1fr_9rem_5rem_auto] items-center gap-2">
                  <Input aria-label="Charge label" disabled={!editable} value={c.label} onChange={(e) => upd({ charges: body.charges.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                  <MoneyInput aria-label="Charge amount" disabled={!editable} value={c.amount} onChange={(m) => upd({ charges: body.charges.map((x, j) => (j === i ? { ...x, amount: m } : x)) })} />
                  <Select aria-label="Charge tax" disabled={!editable || body.taxMode === "none"} value={c.taxRate} onChange={(e) => upd({ charges: body.charges.map((x, j) => (j === i ? { ...x, taxRate: Number(e.target.value) } : x)) })}>{db.settings.taxRates.filter((x) => x.active).map((x) => <option key={x.id} value={x.rate}>{x.rate}%</option>)}</Select>
                  {editable && <Button variant="ghost" size="icon" aria-label="Remove charge" onClick={() => upd({ charges: body.charges.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>}
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4"><div className="grid gap-3 sm:grid-cols-2">
            <Field label="Advance to confirm (%)"><NumberInput disabled={!editable} value={body.advancePct} onChange={(n) => upd({ advancePct: Math.min(100, n) })} /></Field>
            <div className="flex items-end text-sm text-muted">Advance amount: <strong className="ml-1 text-ink">{money(t.advanceAmount)}</strong></div>
            <Field label="Payment terms" className="sm:col-span-2"><Textarea disabled={!editable} value={body.paymentTerms} onChange={(e) => upd({ paymentTerms: e.target.value })} /></Field>
            <Field label="Terms & conditions" className="sm:col-span-2"><Textarea className="min-h-[110px]" disabled={!editable} value={body.terms} onChange={(e) => upd({ terms: e.target.value })} /></Field>
            <Field label="Notes to client" className="sm:col-span-2"><Textarea disabled={!editable} value={body.notes} onChange={(e) => upd({ notes: e.target.value })} /></Field>
          </div></Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-[72px] lg:self-start">
          <Card>
            <CardHeader title="Totals" description={body.taxMode === "exclusive" ? "Taxes added on top" : body.taxMode === "inclusive" ? "Rates include tax" : "No tax applied"} />
            <dl className="space-y-1.5 p-4 text-sm">
              <Row k="Gross" v={money(t.grossTotal)} />{t.discountTotal > 0 && <Row k="Discounts" v={"− " + money(t.discountTotal)} />}{t.chargesTotal > 0 && <Row k="Charges / fees" v={money(t.charges.reduce((a, c) => a + c.net, 0))} />}
              <Row k="Taxable value" v={money(t.taxable)} />
              {t.taxBreakdown.filter((b) => b.rate > 0).map((b) => <Row key={b.rate} k={`GST @ ${b.rate}%`} v={money(b.tax)} muted />)}
              <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><dt>Total</dt><dd className="tabular-nums">{money(t.grandTotal)}</dd></div>
              <Row k={`Advance (${body.advancePct}%)`} v={money(t.advanceAmount)} />
            </dl>
          </Card>
          <Card>
            <CardHeader title="Internal margin" description="Never shown to the client" />
            <dl className="space-y-1.5 p-4 text-sm"><Row k="Taxable revenue" v={money(t.taxable)} /><Row k="Committed vendor cost" v={money(committedCost)} /><div className="flex justify-between border-t border-line pt-2 font-semibold"><dt>Gross margin</dt><dd className={cn("tabular-nums", margin < 0 && "text-danger")}>{money(margin)} <span className="text-xs font-normal text-muted">({t.taxable ? ((margin / t.taxable) * 100).toFixed(0) : 0}%)</span></dd></div></dl>
          </Card>
          <Card>
            <CardHeader title="Version history" />
            <ul className="divide-y divide-line text-sm">
              <li className="flex items-center justify-between px-4 py-2.5"><span className="font-medium">v{q.version} <span className="text-xs font-normal text-muted">current</span></span><span className="tabular-nums">{money(t.grandTotal)}</span></li>
              {[...q.versions].reverse().map((v) => <li key={v.version} className="px-4 py-2.5"><div className="flex items-center justify-between"><span className="font-medium">v{v.version} <span className="text-xs font-normal text-muted">{v.status}</span></span><span className="tabular-nums">{money(v.total)}</span></div><p className="text-xs text-muted">{fmtDateTime(v.at)} · {v.reason}</p></li>)}
            </ul>
          </Card>
          <Card className="p-4 text-xs text-muted">Valid until <strong className="text-ink">{fmtDate(validUntil)}</strong>{q.sentAt && <> · sent {fmtDateTime(q.sentAt)}</>}. {" "}
            <button className="inline-flex items-center gap-1 font-medium text-primary" onClick={() => { const d = generateQuotationDoc(q.id); if (d) { toast.success(`PDF v${d.version} stored in Documents`); preview.show(d.snapshot); } }}><FileText className="h-3 w-3" />Store PDF snapshot</button></Card>
        </aside>
      </div>

      <FormDialog open={reviseOpen} onOpenChange={setReviseOpen} title="Create revision" description="The current version is archived with its totals; you edit a new draft." size="sm" submitLabel="Create revision"
        schema={z.object({ reason: z.string().min(5, "Describe the change") })} fields={[{ name: "reason", label: "Reason for revision", type: "textarea", required: true }]} defaultValues={{ reason: "" }}
        onSubmit={(v: any) => { const r = reviseQuotation(q.id, v.reason); if (!r.ok) return r.error; toast.success("Revision drafted"); }} />
      <BookingDialog open={bookOpen} onOpenChange={setBookOpen} q={q} total={t.grandTotal} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} qid={q.id} onDone={(n) => { setBody(useDB.getState().quotations.find((x) => x.id === q.id)!.body); toast.success(n ? `${n} vendor scope line(s) imported` : "Nothing new to import", n ? "Review the rates — they include your markup." : "Confirm vendor agreements first."); }} />
      {preview.node}
      <span className="sr-only"><Copy /></span>
    </>
  );
}

function Row({ k, v, muted }: { k: string; v: string; muted?: boolean }) {
  return <div className={cn("flex justify-between", muted && "text-muted")}><dt className={muted ? "" : "text-muted"}>{k}</dt><dd className="tabular-nums">{v}</dd></div>;
}

function ImportDialog({ open, onOpenChange, qid, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; qid: string; onDone: (n: number) => void }) {
  const [pct, setPct] = React.useState(25);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Import vendor scope" size="sm" description="Adds one client-facing line per committed vendor agreement. Internal vendor rates are not exposed — only the marked-up price."
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => { onDone(importVendorLines(qid, pct)); onOpenChange(false); }}>Import</Button></>}>
      <Field label="Markup on vendor cost (%)"><NumberInput value={pct} onChange={setPct} /></Field>
    </Modal>
  );
}

function BookingDialog({ open, onOpenChange, q, total }: { open: boolean; onOpenChange: (o: boolean) => void; q: Quotation; total: number }) {
  const router = useRouter();
  const db = useDB() as unknown as DB;
  const ev = db.events.find((e) => e.id === q.eventId);
  const mk = () => DEFAULT_MILESTONES.map((m, i) => ({ id: uid("m"), name: m.name, pct: i === 0 ? q.body.advancePct : m.pct === 30 && i === 2 ? 100 - q.body.advancePct - 40 : m.pct, dueDate: toISODate(addDays(new Date(), m.offsetDays)) }));
  const [ms, setMs] = React.useState(mk);
  React.useEffect(() => { if (open) setMs(mk()); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const sum = ms.reduce((a, m) => a + m.pct, 0);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Convert to booking / sales order" description={`${q.ref} v${q.version} · ${money(total)} — creates an immutable sales order snapshot and confirms ${ev?.ref}.`}
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={Math.round(sum * 100) !== 10000} onClick={() => { const r = convertToBooking(q.id, ms); if (!r.ok) { toast.error(r.error); return; } toast.success("Booking confirmed", "Sales order created; template tasks and milestones generated."); onOpenChange(false); router.push(`/events/${q.eventId}?tab=finance`); }}>Confirm booking</Button></>}>
      <p className="mb-3 text-sm text-muted">Define the client payment schedule. Percentages are configurable per booking.</p>
      <div className="space-y-2">
        {ms.map((m, i) => (
          <div key={m.id} className="grid grid-cols-[1fr_5rem_9rem_auto] items-center gap-2">
            <Input aria-label="Milestone name" value={m.name} onChange={(e) => setMs((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} />
            <NumberInput aria-label="Percent" value={m.pct} onChange={(n) => setMs((x) => x.map((y, j) => (j === i ? { ...y, pct: n } : y)))} />
            <Input aria-label="Due date" type="date" value={m.dueDate} onChange={(e) => setMs((x) => x.map((y, j) => (j === i ? { ...y, dueDate: e.target.value } : y)))} />
            <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => setMs((x) => x.filter((_, j) => j !== i))} disabled={ms.length <= 1}><Trash2 className="h-4 w-4" /></Button>
            <p className="col-span-4 -mt-1 text-right text-xs text-muted tabular-nums">{money(Math.round((total * m.pct) / 100))}</p>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setMs((x) => [...x, { id: uid("m"), name: "Milestone", pct: 0, dueDate: toISODate(addDays(new Date(), 30)) }])}><Plus className="h-3.5 w-3.5" />Add milestone</Button>
        <p className={cn("text-xs font-medium", Math.round(sum * 100) === 10000 ? "text-success" : "text-danger")}>{sum}% allocated {Math.round(sum * 100) !== 10000 && "— must equal 100%"}</p>
      </div>
    </Modal>
  );
}
void confirm;
