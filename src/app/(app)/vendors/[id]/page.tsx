"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { z } from "zod";
import { History, Pencil, Plus, ShieldAlert, Star } from "lucide-react";
import { useDB } from "@/stores/db";
import { openEdit } from "@/stores/ui";
import { useCurrentUser } from "@/hooks/use-app";
import { addVendorFeedback, priceHistory, saveCatalogueItem, saveVendor } from "@/services/vendors";
import { assignmentTotal, billPaid } from "@/lib/calculations/finance";
import { fmtDate, fmtDateTime, money, todayISO } from "@/lib/formatting";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { Sheet, TabPanel, TabsRoot, toast } from "@/components/ui/overlays";
import { Alert, Badge, Button, Card, CardHeader, DefinitionList, EmptyState, Stat, StatusBadge } from "@/components/ui/primitives";
import { FormDialog } from "@/components/forms/form-dialog";
import { Stars, vendorStats } from "@/features/vendors/shared";
import type { CatalogueItem, DB } from "@/types";

export default function VendorDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const db = useDB() as unknown as DB;
  const { can } = useCurrentUser();
  const [tab, setTab] = React.useState("overview");
  const [itemDlg, setItemDlg] = React.useState<{ item?: CatalogueItem } | null>(null);
  const [fbOpen, setFbOpen] = React.useState(false);
  const [hist, setHist] = React.useState<CatalogueItem | null>(null);
  const [showBank, setShowBank] = React.useState(false);
  const [blockOpen, setBlockOpen] = React.useState(false);
  const v = db.vendors.find((x) => x.id === id);
  if (!v) return <EmptyState title="Vendor not found" action={<Button onClick={() => router.push("/vendors")}>Back to vendors</Button>} />;
  const s = vendorStats(db, v);
  const items = db.catalogue.filter((c) => c.vendorId === id);
  const ass = db.assignments.filter((a) => a.vendorId === id);
  const bills = db.bills.filter((b) => b.vendorId === id);
  const pays = db.payments.filter((p) => p.partyId === id && p.category === "vendor");
  const w = can("vendors.write");
  const today = todayISO();

  return (
    <>
      <BackLink href="/vendors">Vendors</BackLink>
      <PageHeader title={v.name} description={`${db.settings.vendorCategories.find((c) => c.id === v.categoryId)?.name} · ${v.city}`}
        meta={<><StatusBadge status={v.status === "Active" ? "Active" : v.status} /><Stars value={s.rating} /></>}
        actions={w && <><Button variant="outline" onClick={() => openEdit("vendor", id)}><Pencil className="h-4 w-4" />Edit</Button><Button variant="outline" onClick={() => setFbOpen(true)}><Star className="h-4 w-4" />Add feedback</Button></>} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Events served" value={s.events} /><Stat label="Agreed value" value={money(s.agreed)} basis="Committed" />
        <Stat label="Outstanding" value={money(s.outstanding)} basis="Outstanding" tone={s.outstanding ? "warning" : undefined} /><Stat label="Paid to date" value={money(pays.reduce((a, p) => a + p.amount, 0))} basis="Paid" />
      </div>
      <TabsRoot value={tab} onValueChange={setTab} tabs={[{ value: "overview", label: "Overview" }, { value: "catalogue", label: "Catalogue & pricing", count: items.length }, { value: "events", label: "Event assignments", count: ass.length }, { value: "payments", label: "Bills & payments", count: bills.length }, { value: "docs", label: "Documents" }, { value: "feedback", label: "Feedback", count: v.feedback.length }]}>
        <TabPanel value="overview">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2"><CardHeader title="Profile" /><div className="p-4"><DefinitionList items={[["Phone", v.phone], ["Email", v.email], ["GSTIN", v.gstin ?? ""], ["Payment terms", v.paymentTerms], ["Service locations", v.serviceLocations.join(", ")], ["Departments", v.departmentIds.map((d) => db.departments.find((x) => x.id === d)?.name).join(", ")]]} /></div></Card>
            <Card><CardHeader title="Contacts" /><ul className="divide-y divide-line">{v.contacts.map((c) => <li key={c.id} className="px-4 py-2.5 text-sm"><p className="font-medium">{c.name} <span className="text-xs text-muted">· {c.role}</span></p><p className="text-xs text-muted">{c.phone} · {c.email}</p></li>)}</ul></Card>
            <Card className="lg:col-span-2"><CardHeader title="Services offered" /><div className="flex flex-wrap gap-2 p-4">{v.services.map((x) => <Badge key={x} tone="primary" dot={false}>{x}</Badge>)}</div></Card>
            <Card><CardHeader title="Availability" description="Dates the vendor is unavailable" />
              <div className="p-4 text-sm">{v.unavailableDates.length ? v.unavailableDates.map((d) => <Badge key={d} tone="danger" dot={false} className="mr-1">{fmtDate(d)}</Badge>) : <span className="text-muted">No blocked dates.</span>}
                {w && <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => setBlockOpen(true)}>Block a date</Button>}</div></Card>
            <Card className="lg:col-span-3">
              <CardHeader title="Bank & payment details" description="Restricted — visible to finance roles only" />
              {can("finance.read") ? (
                <div className="p-4">{showBank ? <DefinitionList cols={3} items={[["Account holder", v.bank.holder], ["Bank", v.bank.bankName], ["Account no.", v.bank.account], ["IFSC", v.bank.ifsc], ["UPI", v.bank.upi ?? ""]]} /> : <Button variant="outline" size="sm" onClick={() => setShowBank(true)}>Reveal bank details</Button>}</div>
              ) : <div className="p-4"><Alert tone="warning"><span className="flex items-center gap-2"><ShieldAlert className="h-4 w-4" />Your role cannot view payment details.</span></Alert></div>}
            </Card>
          </div>
        </TabPanel>

        <TabPanel value="catalogue">
          <div className="mb-3 flex items-center justify-between gap-2"><p className="text-sm text-muted">Catalogue rates are defaults only. Event agreements keep their own snapshot, so editing a rate never changes past events.</p>{w && <Button onClick={() => setItemDlg({})}><Plus className="h-4 w-4" />Add item</Button>}</div>
          <Card><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="bg-canvas text-xs text-muted"><tr>{["Item / service", "Unit", "Catalogue rate", "Last agreed", "Tax", "Status", ""].map((h) => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">{items.map((c) => { const last = priceHistory(db, id, c.name, c.id)[0]; return (
              <tr key={c.id}><td className="px-3 py-2 font-medium">{c.name}</td><td className="px-3 py-2">{c.unit}</td><td className="px-3 py-2 tabular-nums">{money(c.rate)}</td><td className="px-3 py-2 tabular-nums">{last ? <span className={last.rate > c.rate ? "text-danger" : "text-success"}>{money(last.rate)}</span> : <span className="text-muted">No history</span>}</td><td className="px-3 py-2">{c.taxRate}%</td><td className="px-3 py-2"><Badge tone={c.active ? "success" : "neutral"}>{c.active ? "Active" : "Inactive"}</Badge></td>
                <td className="whitespace-nowrap px-3 py-2 text-right"><Button size="sm" variant="ghost" onClick={() => setHist(c)}><History className="h-3.5 w-3.5" />History</Button>{w && <Button size="sm" variant="ghost" onClick={() => setItemDlg({ item: c })}>Edit</Button>}</td></tr>); })}</tbody></table>
            {items.length === 0 && <EmptyState title="No catalogue items" />}</div></Card>
        </TabPanel>

        <TabPanel value="events">
          <Card>{ass.length === 0 ? <EmptyState title="Not assigned to any event" /> : <ul className="divide-y divide-line">{ass.map((a) => { const e = db.events.find((x) => x.id === a.eventId); return (
            <li key={a.id}><Link href={`/events/${a.eventId}?tab=vendors`} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas"><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{e?.title}</span><span className="text-xs text-muted">{a.ref} · v{a.version} · {fmtDate(e?.startDate)}</span></span><span className="text-sm tabular-nums">{money(assignmentTotal(a))}</span><StatusBadge status={a.status} /></Link></li>); })}</ul>}</Card>
        </TabPanel>

        <TabPanel value="payments">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader title="Vendor bills" />{bills.length === 0 ? <EmptyState title="No bills" /> : <ul className="divide-y divide-line">{bills.map((b) => <li key={b.id} className="flex items-center gap-3 px-4 py-2.5 text-sm"><span className="min-w-0 flex-1"><span className="block font-medium">{b.vendorBillNo}</span><span className="text-xs text-muted">due {fmtDate(b.dueDate)} · {db.events.find((e) => e.id === b.eventId)?.ref}</span></span><span className="tabular-nums">{money(b.amount)}</span><StatusBadge status={b.status === "Approved" && billPaid(db, b.id) >= b.amount ? "Paid" : b.status} /></li>)}</ul>}</Card>
            <Card><CardHeader title="Payment history" />{pays.length === 0 ? <EmptyState title="No payments" /> : <ul className="divide-y divide-line">{pays.map((p) => <li key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm"><span><span className="font-medium">{p.ref}</span><span className="block text-xs text-muted">{fmtDate(p.date)} · {p.method} · {p.billId ? "bill settlement" : "advance"}</span></span><span className="font-semibold tabular-nums">{money(p.amount)}</span></li>)}</ul>}</Card>
          </div>
        </TabPanel>

        <TabPanel value="docs">
          <Card>{v.documents.length === 0 ? <EmptyState title="No compliance documents" /> : <ul className="divide-y divide-line">{v.documents.map((d) => <li key={d.id} className="flex items-center justify-between px-4 py-2.5 text-sm"><span><span className="font-medium">{d.name}</span><span className="block text-xs text-muted">{d.type}</span></span>{d.expiry ? <Badge tone={d.expiry < today ? "danger" : "neutral"}>Expires {fmtDate(d.expiry)}</Badge> : <Badge tone="success">On file</Badge>}</li>)}</ul>}</Card>
          <p className="mt-2 text-xs text-muted">Demo: documents are metadata only. File storage requires the backend (private object storage).</p>
        </TabPanel>

        <TabPanel value="feedback">
          <Card>{v.feedback.length === 0 ? <EmptyState title="No feedback yet" /> : <ul className="divide-y divide-line">{v.feedback.map((f) => <li key={f.id} className="px-4 py-3"><div className="flex items-center justify-between"><Stars value={f.rating} /><span className="text-xs text-muted">{fmtDateTime(f.at)} · {db.users.find((u) => u.id === f.byUserId)?.name}</span></div><p className="mt-1 text-sm">{f.comment}</p></li>)}</ul>}</Card>
        </TabPanel>
      </TabsRoot>

      <FormDialog open={!!itemDlg} onOpenChange={(o) => !o && setItemDlg(null)} title={itemDlg?.item ? "Edit catalogue item" : "Add catalogue item"} size="sm"
        schema={z.object({ name: z.string().min(2, "Name is required"), unit: z.string().min(1), rate: z.number().int().min(0), taxRate: z.number().min(0).max(40), active: z.boolean().optional() })}
        fields={[{ name: "name", label: "Item / service", required: true, span: 2 }, { name: "unit", label: "Unit", required: true }, { name: "rate", label: "Rate", type: "money" }, { name: "taxRate", label: "GST %", type: "number", min: 0 }, { name: "active", label: "Active", type: "checkbox" }]}
        defaultValues={{ name: itemDlg?.item?.name ?? "", unit: itemDlg?.item?.unit ?? "piece", rate: itemDlg?.item?.rate ?? 0, taxRate: itemDlg?.item?.taxRate ?? 18, active: itemDlg?.item?.active ?? true }}
        onSubmit={(f: any) => { saveCatalogueItem({ ...f, id: itemDlg?.item?.id, scope: "vendor", vendorId: id, departmentId: v.departmentIds[0] ?? "dp1" }); toast.success("Catalogue updated", "Existing event agreements keep their own agreed prices."); }} />
      <FormDialog open={fbOpen} onOpenChange={setFbOpen} title="Add vendor feedback" size="sm"
        schema={z.object({ rating: z.number().int().min(1).max(5), comment: z.string().min(3, "Add a comment"), eventId: z.string().optional() })}
        fields={[{ name: "rating", label: "Rating (1–5)", type: "number", min: 1, required: true }, { name: "eventId", label: "Event", type: "select", options: ass.map((a) => ({ value: a.eventId, label: db.events.find((e) => e.id === a.eventId)?.title ?? "" })) }, { name: "comment", label: "Internal feedback", type: "textarea", required: true }]}
        defaultValues={{ rating: 4, comment: "", eventId: "" }}
        onSubmit={(f: any) => { addVendorFeedback(id, f.rating, f.comment, f.eventId || undefined); toast.success("Feedback saved"); }} />
      <FormDialog open={blockOpen} onOpenChange={setBlockOpen} size="sm" title="Block a date" description="The vendor will be flagged as unavailable when an event overlaps this date." submitLabel="Block date"
        schema={z.object({ date: z.string().min(1, "Select a date") })} fields={[{ name: "date", label: "Date", type: "date", required: true, span: 2 }]} defaultValues={{ date: today }}
        onSubmit={(f: any) => { saveVendor({ id, name: v.name, categoryId: v.categoryId, unavailableDates: [...new Set([...v.unavailableDates, f.date])] }); toast.success("Date blocked"); }} />
      <Sheet open={!!hist} onOpenChange={(o) => !o && setHist(null)} title="Price history" description={hist?.name} width="max-w-md">
        {hist && (() => { const rows = priceHistory(db, id, hist.name, hist.id); return rows.length === 0 ? <EmptyState title="No history" description="No comparable confirmed agreement yet." /> : (
          <div><p className="mb-3 text-sm text-muted">Current catalogue rate <strong className="text-ink">{money(hist.rate)}</strong>. History comes from confirmed event agreements — never from catalogue edits.</p>
            <ul className="divide-y divide-line rounded-lg border border-line">{rows.map((r, i) => <li key={i} className="flex items-center justify-between px-3 py-2.5 text-sm"><span><span className="font-medium">{db.events.find((e) => e.id === r.eventId)?.title}</span><span className="block text-xs text-muted">{r.qty} units · {r.status}</span></span><span className="text-right"><span className="block font-semibold tabular-nums">{money(r.rate)}</span><span className={r.rate > hist.rate ? "text-xs text-danger" : "text-xs text-success"}>{Math.round(((r.rate - hist.rate) / hist.rate) * 100)}% vs catalogue</span></span></li>)}</ul></div>); })()}
      </Sheet>
    </>
  );
}
