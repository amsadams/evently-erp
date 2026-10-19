"use client";
import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { FileText, Plus } from "lucide-react";
import { useDB } from "@/stores/db";
import { useCurrentUser } from "@/hooks/use-app";
import { invoiceBalance, invoicePaid, invoiceStatus } from "@/lib/calculations/finance";
import { generateInvoiceDoc, generateReceiptDoc } from "@/services/documents";
import { issueInvoice, voidInvoice } from "@/services/sales";
import { fmtDate, money, todayISO } from "@/lib/formatting";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable } from "@/components/tables/data-table";
import { ActionMenu, TabPanel, TabsRoot, confirm, toast } from "@/components/ui/overlays";
import { Alert, Button, Stat, StatusBadge } from "@/components/ui/primitives";
import { usePreview } from "@/components/documents/doc-preview";
import { CreditNoteDialog, InvoiceDialog, PaymentDialog } from "@/features/finance/billing";
import { Modal } from "@/components/ui/overlays";
import { Field, Select } from "@/components/ui/primitives";
import type { DB, Invoice, Payment } from "@/types";
import { differenceInCalendarDays, parseISO } from "date-fns";

export default function InvoicesPage() {
  const db = useDB() as unknown as DB;
  const { can } = useCurrentUser();
  const preview = usePreview();
  const [tab, setTab] = React.useState("invoices");
  const [pay, setPay] = React.useState<Invoice | null>(null);
  const [cn, setCn] = React.useState<Invoice | null>(null);
  const [newInv, setNewInv] = React.useState<string | null>(null);
  const [pickEvent, setPickEvent] = React.useState(false);
  const [evSel, setEvSel] = React.useState("");
  const w = can("finance.write");

  const rows = db.invoices;
  const open = rows.filter((i) => i.status === "Issued" && i.type !== "Credit Note" && i.type !== "Proforma");
  const receivable = open.reduce((a, i) => a + invoiceBalance(db, i), 0);
  const overdue = open.filter((i) => invoiceStatus(db, i) === "Overdue").reduce((a, i) => a + invoiceBalance(db, i), 0);
  const requested = rows.filter((i) => i.status === "Issued" && i.type === "Proforma").reduce((a, i) => a + invoiceBalance(db, i), 0);
  const received = db.payments.filter((p) => p.category === "client").reduce((a, p) => a + p.amount, 0);

  const cols: ColumnDef<Invoice, unknown>[] = [
    { accessorKey: "ref", header: "Document", cell: ({ row: { original: i } }) => <div><p className="font-medium">{i.ref}</p><p className="text-xs text-muted">{i.type} · {i.kind}</p></div> },
    { id: "client", accessorFn: (i) => db.clients.find((c) => c.id === i.clientId)?.name ?? "", header: "Client" },
    { id: "event", accessorFn: (i) => db.events.find((e) => e.id === i.eventId)?.ref ?? "", header: "Event" },
    { accessorKey: "dueDate", header: "Due", cell: ({ row }) => fmtDate(row.original.dueDate, "dd MMM yy") },
    { accessorKey: "total", header: "Total", cell: ({ row }) => <span className="tabular-nums">{money(row.original.total)}</span> },
    { id: "paid", accessorFn: (i) => invoicePaid(db, i.id), header: "Paid", cell: ({ row }) => <span className="tabular-nums text-muted">{row.original.type === "Credit Note" ? "—" : money(row.getValue("paid") as number)}</span> },
    { id: "balance", accessorFn: (i) => invoiceBalance(db, i), header: "Balance", cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.type === "Credit Note" ? "—" : money(row.getValue("balance") as number)}</span> },
    { id: "status", accessorFn: (i) => invoiceStatus(db, i), header: "Status", cell: ({ row }) => <StatusBadge status={row.getValue("status") as string} /> },
    { id: "actions", header: "", enableSorting: false, cell: ({ row: { original: i } }) => (
      <div onClick={(e) => e.stopPropagation()}><ActionMenu trigger={<Button variant="ghost" size="sm">Actions</Button>} items={[
        { label: "Preview PDF", icon: <FileText className="h-4 w-4" />, onSelect: () => { const d = generateInvoiceDoc(i.id); if (d) preview.show(d.snapshot); } },
        ...(w && i.status === "Draft" ? [{ label: "Issue", onSelect: () => { issueInvoice(i.id); toast.success("Issued"); } }] : []),
        ...(w && i.status === "Issued" && i.type !== "Credit Note" && invoiceBalance(db, i) > 0 ? [{ label: "Record payment", onSelect: () => setPay(i) }] : []),
        ...(w && i.status === "Issued" && (i.type === "Tax Invoice" || i.type === "Bill of Supply") ? [{ label: "Issue credit note", onSelect: () => setCn(i) }] : []),
        ...(w && i.status !== "Void" ? [{ label: "Void", danger: true, separatorBefore: true, onSelect: async () => { if (await confirm({ title: `Void ${i.ref}?`, message: "Voiding keeps the document in history. If payments exist, issue a credit note instead.", confirmLabel: "Void", danger: true })) { const r = voidInvoice(i.id, "Voided by user"); if (r.ok) toast.success("Invoice voided"); else toast.error(r.error); } } }] : []),
      ]} /></div>
    ) },
  ];

  const payCols: ColumnDef<Payment, unknown>[] = [
    { accessorKey: "ref", header: "Ref", cell: ({ row }) => <span className="font-medium">{row.original.ref}</span> },
    { accessorKey: "date", header: "Date", cell: ({ row }) => fmtDate(row.original.date, "dd MMM yy") },
    { id: "party", accessorFn: (p) => (p.category === "vendor" ? db.vendors.find((v) => v.id === p.partyId)?.name : db.clients.find((c) => c.id === p.partyId)?.name) ?? "", header: "Party" },
    { accessorKey: "category", header: "Type", cell: ({ row }) => <span className="capitalize">{row.original.category === "client" ? "Client receipt" : row.original.category === "vendor" ? "Vendor payment" : "Refund"}</span> },
    { accessorKey: "method", header: "Method" }, { accessorKey: "reference", header: "Reference" },
    { accessorKey: "amount", header: "Amount", cell: ({ row }) => <span className={row.original.direction === "in" ? "font-semibold tabular-nums text-success" : "tabular-nums"}>{row.original.direction === "in" ? "+" : "−"}{money(row.original.amount)}</span> },
    { id: "pdf", header: "", enableSorting: false, cell: ({ row }) => <Button size="sm" variant="ghost" onClick={() => { const d = generateReceiptDoc(row.original.id); if (d) preview.show(d.snapshot); }}>Receipt</Button> },
  ];

  const aging = React.useMemo(() => {
    const buckets = { "Current": 0, "1–30 days": 0, "31–60 days": 0, "60+ days": 0 };
    for (const i of open) {
      const bal = invoiceBalance(db, i); if (!bal) continue;
      const d = differenceInCalendarDays(parseISO(todayISO()), parseISO(i.dueDate));
      if (d <= 0) buckets["Current"] += bal; else if (d <= 30) buckets["1–30 days"] += bal; else if (d <= 60) buckets["31–60 days"] += bal; else buckets["60+ days"] += bal;
    }
    return buckets;
  }, [db, open]);

  return (
    <>
      <PageHeader title="Invoices & payments" description="Proforma payment requests, tax invoices, receipts, credit notes and the receivables ledger. Document types are labelled — a proforma is never a tax invoice."
        actions={w && <Button onClick={() => setPickEvent(true)}><Plus className="h-4 w-4" />New invoice</Button>} />
      <Alert tone="info" className="mb-4">Demo mode: payments are recorded manually and no money is processed. Confirm tax document rules with your accountant before production use.</Alert>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Receivable (tax invoices)" value={money(receivable)} basis="Outstanding" /><Stat label="Overdue" value={money(overdue)} basis="Outstanding" tone={overdue ? "danger" : undefined} />
        <Stat label="Proforma requests open" value={money(requested)} basis="Requested" sub="Not revenue" /><Stat label="Total received" value={money(received)} basis="Paid" tone="success" />
      </div>
      <TabsRoot value={tab} onValueChange={setTab} tabs={[{ value: "invoices", label: "Documents", count: rows.length }, { value: "payments", label: "Payments & receipts", count: db.payments.length }, { value: "aging", label: "Receivables ageing" }]}>
        <TabPanel value="invoices">
          <DataTable data={rows} columns={cols} csvName="invoices" searchText={(i) => `${i.ref} ${db.clients.find((c) => c.id === i.clientId)?.name}`}
            filters={[{ key: "type", label: "Type", options: ["Proforma", "Tax Invoice", "Bill of Supply", "Credit Note"], get: (i) => i.type }, { key: "status", label: "Status", options: ["Draft", "Issued", "Partially Paid", "Paid", "Overdue", "Void"], get: (i) => invoiceStatus(db, i) }]}
            initialSort={[{ id: "dueDate", desc: false }]} />
        </TabPanel>
        <TabPanel value="payments"><DataTable data={[...db.payments].sort((a, b) => b.date.localeCompare(a.date))} columns={payCols} csvName="payments" searchText={(p) => `${p.ref} ${p.reference} ${p.method}`}
          filters={[{ key: "cat", label: "Type", options: ["client", "vendor", "refund"], get: (p) => p.category }, { key: "method", label: "Method", options: db.settings.paymentMethods, get: (p) => p.method }]} /></TabPanel>
        <TabPanel value="aging">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Object.entries(aging).map(([k, v]) => <Stat key={k} label={k} value={money(v)} tone={k !== "Current" && v ? "danger" : undefined} basis="Outstanding" />)}</div>
          <p className="mt-3 text-xs text-muted">Based on issued tax invoices and bills of supply; proforma payment requests are excluded from receivables until a tax invoice is raised.</p>
        </TabPanel>
      </TabsRoot>
      <PaymentDialog invoice={pay} onClose={() => setPay(null)} />
      <CreditNoteDialog invoice={cn} onClose={() => setCn(null)} />
      <Modal open={pickEvent} onOpenChange={setPickEvent} title="Select event" size="sm" footer={<><Button variant="outline" onClick={() => setPickEvent(false)}>Cancel</Button><Button disabled={!evSel} onClick={() => { setNewInv(evSel); setPickEvent(false); }}>Continue</Button></>}>
        <Field label="Event to bill"><Select value={evSel} onChange={(e) => setEvSel(e.target.value)}><option value="">Select event…</option>{db.events.filter((e) => e.status !== "Cancelled").map((e) => <option key={e.id} value={e.id}>{e.ref} · {e.title}</option>)}</Select></Field>
      </Modal>
      {newInv && <InvoiceDialog open onOpenChange={(o) => !o && setNewInv(null)} eventId={newInv} />}
      {preview.node}
    </>
  );
}
