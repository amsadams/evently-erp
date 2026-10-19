"use client";
import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { z } from "zod";
import { Archive, FileText, Mail, MessageCircle, Phone, Pencil, Plus, RotateCcw, Users2 } from "lucide-react";
import { useDB } from "@/stores/db";
import { openEdit } from "@/stores/ui";
import { useCurrentUser } from "@/hooks/use-app";
import { addCommunication, archiveClient } from "@/services/events";
import { eventFinancials, invoiceBalance, invoiceStatus, quoteTotal } from "@/lib/calculations/finance";
import { money, fmtDate, fmtDateTime } from "@/lib/formatting";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { Badge, Button, Card, CardHeader, DefinitionList, EmptyState, Stat, StatusBadge } from "@/components/ui/primitives";
import { TabPanel, TabsRoot, confirm, toast } from "@/components/ui/overlays";
import { FormDialog } from "@/components/forms/form-dialog";
import { usePreview } from "@/components/documents/doc-preview";
import type { CommKind, DB } from "@/types";

const commIcon: Record<CommKind, React.ReactNode> = { call: <Phone className="h-4 w-4" />, email: <Mail className="h-4 w-4" />, meeting: <Users2 className="h-4 w-4" />, whatsapp: <MessageCircle className="h-4 w-4" />, note: <FileText className="h-4 w-4" /> };

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const db = useDB() as unknown as DB;
  const { can } = useCurrentUser();
  const [tab, setTab] = React.useState("overview");
  const [logOpen, setLogOpen] = React.useState(false);
  const preview = usePreview();
  const client = db.clients.find((c) => c.id === id);
  if (!client) return <EmptyState title="Client not found" action={<Button onClick={() => router.push("/clients")}>Back to clients</Button>} />;

  const events = db.events.filter((e) => e.clientId === id);
  const quotes = db.quotations.filter((q) => q.clientId === id);
  const invoices = db.invoices.filter((i) => i.clientId === id);
  const comms = db.communications.filter((c) => c.clientId === id);
  const docs = db.documents.filter((d) => events.some((e) => e.id === d.eventId) && !d.superseded);
  const outstanding = invoices.filter((i) => i.type !== "Proforma").reduce((a, i) => a + invoiceBalance(db, i), 0);
  const booked = events.reduce((a, e) => a + eventFinancials(db, e).estimatedRevenue, 0);
  const received = events.reduce((a, e) => a + eventFinancials(db, e).received, 0);

  return (
    <>
      <BackLink href="/clients">Clients</BackLink>
      <PageHeader title={client.name} description={client.company ?? client.address} meta={<><Badge tone={client.type === "corporate" ? "info" : "primary"} dot={false} className="capitalize">{client.type}</Badge>{client.archived && <Badge>Archived</Badge>}{client.tags.map((t) => <Badge key={t} tone="neutral" dot={false}>{t}</Badge>)}</>}
        actions={can("clients.write") && <>
          <Button variant="outline" onClick={() => openEdit("client", id)}><Pencil className="h-4 w-4" />Edit</Button>
          <Button variant="outline" onClick={async () => { if (client.archived || await confirm({ title: "Archive client?", message: "The client stays on existing events and documents but is hidden from the default list.", confirmLabel: "Archive" })) { archiveClient(id, !client.archived); toast.success(client.archived ? "Client restored" : "Client archived"); } }}>
            {client.archived ? <><RotateCcw className="h-4 w-4" />Restore</> : <><Archive className="h-4 w-4" />Archive</>}</Button>
          <Button onClick={() => router.push(`/events/new?client=${id}`)}><Plus className="h-4 w-4" />New event</Button>
        </>} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Events" value={events.length} /><Stat label="Booked value" value={money(booked)} basis="Estimated" />
        <Stat label="Received" value={money(received)} basis="Paid" tone="success" /><Stat label="Outstanding" value={money(outstanding)} basis="Outstanding" tone={outstanding ? "danger" : undefined} />
      </div>
      <TabsRoot value={tab} onValueChange={setTab} tabs={[{ value: "overview", label: "Overview" }, { value: "events", label: "Events", count: events.length }, { value: "comms", label: "Communication", count: comms.length }, { value: "billing", label: "Quotes & invoices", count: quotes.length + invoices.length }, { value: "docs", label: "Documents", count: docs.length }]}>
        <TabPanel value="overview">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2"><CardHeader title="Details" /><div className="p-4"><DefinitionList items={[["Phone", client.phone], ["Email", client.email], ["Address", client.address], ["GSTIN", client.gstin ?? ""], ["Client since", fmtDate(client.createdAt)]]} /></div></Card>
            <Card><CardHeader title="Contacts" />
              {client.contacts.length === 0 ? <EmptyState title="No additional contacts" /> : <ul className="divide-y divide-line">{client.contacts.map((c) => <li key={c.id} className="px-4 py-2.5 text-sm"><p className="font-medium">{c.name} <span className="text-xs font-normal text-muted">· {c.role}</span></p><p className="text-xs text-muted">{c.phone} · {c.email}</p></li>)}</ul>}
            </Card>
            <Card className="lg:col-span-3"><CardHeader title="Preferences & requirements" /><p className="p-4 text-sm text-muted">{client.preferences || "No preferences recorded."}</p></Card>
          </div>
        </TabPanel>
        <TabPanel value="events">
          <Card>{events.length === 0 ? <EmptyState title="No events yet" action={<Button onClick={() => router.push(`/events/new?client=${id}`)}>Create event</Button>} /> :
            <ul className="divide-y divide-line">{events.map((e) => <li key={e.id}><Link href={`/events/${e.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas"><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{e.title}</span><span className="text-xs text-muted">{e.ref} · {fmtDate(e.startDate)} · {e.venue}</span></span><span className="text-sm tabular-nums">{money(eventFinancials(db, e).estimatedRevenue)}</span><StatusBadge status={e.status} /></Link></li>)}</ul>}</Card>
        </TabPanel>
        <TabPanel value="comms">
          <div className="mb-3 flex justify-end">{can("clients.write") && <Button onClick={() => setLogOpen(true)}><Plus className="h-4 w-4" />Log communication</Button>}</div>
          <Card>{comms.length === 0 ? <EmptyState title="No communication logged" description="Record calls, meetings, emails and minutes here. Follow-ups become tasks automatically." /> :
            <ul className="divide-y divide-line">{comms.map((c) => (
              <li key={c.id} className="flex gap-3 px-4 py-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-subtle text-muted">{commIcon[c.kind]}</span>
                <div className="min-w-0 flex-1"><p className="text-sm"><span className="font-medium capitalize">{c.kind}</span> · {c.summary}</p>{c.minutes && <p className="mt-1 whitespace-pre-line rounded-md bg-canvas p-2 text-xs text-muted"><strong>Minutes:</strong> {c.minutes}</p>}
                  <p className="mt-1 text-xs text-muted">{fmtDateTime(c.at)} · {db.users.find((u) => u.id === c.byUserId)?.name}{c.followUpAt ? ` · follow-up ${fmtDate(c.followUpAt)}` : ""}</p></div>
              </li>))}</ul>}</Card>
        </TabPanel>
        <TabPanel value="billing">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader title="Quotations" /><ul className="divide-y divide-line">{quotes.map((q) => <li key={q.id}><Link href={`/quotations/${q.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-canvas"><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{q.ref} <span className="text-xs text-muted">v{q.version}</span></span><span className="text-xs text-muted">{db.events.find((e) => e.id === q.eventId)?.title}</span></span><span className="text-sm tabular-nums">{money(quoteTotal(q))}</span><StatusBadge status={q.status} /></Link></li>)}{!quotes.length && <EmptyState title="No quotations" />}</ul></Card>
            <Card><CardHeader title="Invoices" /><ul className="divide-y divide-line">{invoices.map((i) => <li key={i.id}><Link href="/invoices" className="flex items-center gap-3 px-4 py-2.5 hover:bg-canvas"><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{i.ref}</span><span className="text-xs text-muted">{i.type} · due {fmtDate(i.dueDate)}</span></span><span className="text-sm tabular-nums">{money(i.total)}</span><StatusBadge status={invoiceStatus(db, i)} /></Link></li>)}{!invoices.length && <EmptyState title="No invoices" />}</ul></Card>
          </div>
        </TabPanel>
        <TabPanel value="docs">
          <Card>{docs.length === 0 ? <EmptyState title="No documents" /> : <ul className="divide-y divide-line">{docs.map((d) => <li key={d.id}><button onClick={() => preview.show(d.snapshot)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-canvas"><FileText className="h-4 w-4 text-muted" /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{d.title}</span><span className="text-xs text-muted">{d.kind} · {d.ref} · v{d.version}</span></span><span className="text-xs text-primary">Preview PDF</span></button></li>)}</ul>}</Card>
        </TabPanel>
      </TabsRoot>
      <FormDialog open={logOpen} onOpenChange={setLogOpen} title="Log communication" submitLabel="Save" size="sm"
        schema={z.object({ kind: z.enum(["call", "email", "meeting", "whatsapp", "note"]), summary: z.string().min(3, "Add a short summary"), minutes: z.string().optional(), followUpAt: z.string().optional() })}
        fields={[{ name: "kind", label: "Type", type: "select", required: true, options: ["call", "email", "meeting", "whatsapp", "note"].map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) })) }, { name: "followUpAt", label: "Follow-up date", type: "date" }, { name: "summary", label: "Summary", type: "textarea", required: true }, { name: "minutes", label: "Meeting minutes (optional)", type: "textarea" }]}
        defaultValues={{ kind: "call", summary: "", minutes: "", followUpAt: "" }}
        onSubmit={(v: { kind: CommKind; summary: string; minutes?: string; followUpAt?: string }) => { addCommunication({ clientId: id, kind: v.kind, summary: v.summary, minutes: v.minutes || undefined, followUpAt: v.followUpAt || undefined }); toast.success("Communication logged", v.followUpAt ? "A follow-up task was created." : undefined); }} />
      {preview.node}
    </>
  );
}
