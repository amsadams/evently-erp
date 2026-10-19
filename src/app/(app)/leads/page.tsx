"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Briefcase, CalendarClock, MoreHorizontal, Pencil, Plus, UserPlus } from "lucide-react";
import { useDB } from "@/stores/db";
import { openCreate, openEdit } from "@/stores/ui";
import { useCurrentUser } from "@/hooks/use-app";
import { convertLeadToClient, moveLead } from "@/services/events";
import { moneyCompact, fmtDate, todayISO } from "@/lib/formatting";
import { PageHeader } from "@/components/layout/page-header";
import { KanbanBoard } from "@/components/ui/kanban";
import { ActionMenu, TabPanel, TabsRoot, toast } from "@/components/ui/overlays";
import { Badge, Button, Card, Stat } from "@/components/ui/primitives";
import { DataTable } from "@/components/tables/data-table";
import { LEAD_STAGES, type Lead } from "@/types";
import { cn } from "@/lib/utils";

const STAGE_DOT: Record<string, string> = { New: "bg-info", Contacted: "bg-primary", Proposal: "bg-warning", Negotiation: "bg-[#d98a1f]", Won: "bg-success", Lost: "bg-danger" };

export default function LeadsPage() {
  const leads = useDB((s) => s.leads);
  const types = useDB((s) => s.eventTypes);
  const router = useRouter();
  const { can } = useCurrentUser();
  const [view, setView] = React.useState("board");
  const today = todayISO();
  const open = leads.filter((l) => !["Won", "Lost"].includes(l.stage));
  const bySource = leads.reduce<Record<string, number>>((a, l) => ({ ...a, [l.source]: (a[l.source] ?? 0) + 1 }), {});

  const toEvent = (l: Lead) => {
    const cid = convertLeadToClient(l.id);
    if (cid) router.push(`/events/new?client=${cid}&lead=${l.id}`);
  };
  const card = (l: Lead) => (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-tight">{l.name}</p>
        {can("clients.write") && <span onPointerDown={(e) => e.stopPropagation()}><ActionMenu trigger={<button aria-label="Lead actions" className="rounded p-0.5 text-muted hover:bg-subtle"><MoreHorizontal className="h-4 w-4" /></button>} items={[
          { label: "Edit lead", icon: <Pencil className="h-4 w-4" />, onSelect: () => openEdit("lead", l.id) },
          { label: l.clientId ? "Open client" : "Convert to client", icon: <UserPlus className="h-4 w-4" />, onSelect: () => { const c = convertLeadToClient(l.id); if (c) { toast.success("Client ready", l.name); router.push(`/clients/${c}`); } } },
          { label: l.eventId ? "Open event" : "Create event from lead", icon: <Briefcase className="h-4 w-4" />, onSelect: () => (l.eventId ? router.push(`/events/${l.eventId}`) : toEvent(l)) },
          ...LEAD_STAGES.filter((s) => s !== l.stage).map((s, i) => ({ label: `Move to ${s}`, onSelect: () => moveLead(l.id, s), separatorBefore: i === 0 })),
        ]} /></span>}
      </div>
      <p className="text-xs text-muted">{types.find((t) => t.id === l.eventTypeId)?.name} · {l.guests} guests · {fmtDate(l.expectedDate, "dd MMM yy")}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral" dot={false}>{l.source}</Badge>
        {l.budget > 0 && <Badge tone="primary" dot={false}>{moneyCompact(l.budget)}</Badge>}
        {l.followUpAt && <Badge tone={l.followUpAt < today && !["Won", "Lost"].includes(l.stage) ? "danger" : "info"} dot={false}><CalendarClock className="mr-1 inline h-3 w-3" />{fmtDate(l.followUpAt, "dd MMM")}</Badge>}
      </div>
    </div>
  );

  return (
    <>
      <PageHeader title="Leads & enquiries" description="Track enquiries from first contact to a confirmed client. Drag cards between stages."
        actions={can("clients.write") && <Button onClick={() => openCreate("lead")}><Plus className="h-4 w-4" />Capture lead</Button>} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Open leads" value={open.length} /><Stat label="Pipeline value" value={moneyCompact(open.reduce((a, l) => a + l.budget, 0))} basis="Estimated" />
        <Stat label="Follow-ups due" value={open.filter((l) => l.followUpAt && l.followUpAt <= today).length} tone={open.some((l) => l.followUpAt && l.followUpAt < today) ? "danger" : undefined} />
        <Stat label="Top source" value={Object.entries(bySource).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—"} sub={`${Object.keys(bySource).length} sources tracked`} />
      </div>
      <TabsRoot value={view} onValueChange={setView} tabs={[{ value: "board", label: "Pipeline board" }, { value: "list", label: "List" }]}>
        <TabPanel value="board">
          <KanbanBoard columns={LEAD_STAGES.map((s) => ({ id: s, label: s, tone: STAGE_DOT[s] }))} items={leads} columnOf={(l) => l.stage} renderCard={card}
            onMove={(l, stage) => { moveLead(l.id, stage as Lead["stage"]); toast.success(`${l.name} → ${stage}`); }} />
        </TabPanel>
        <TabPanel value="list">
          <DataTable data={leads} csvName="leads" searchText={(l) => `${l.name} ${l.source} ${l.notes}`} onRowClick={(l) => openEdit("lead", l.id)}
            filters={[{ key: "stage", label: "Stage", options: [...LEAD_STAGES], get: (l) => l.stage }, { key: "source", label: "Source", options: Object.keys(bySource), get: (l) => l.source }]}
            columns={[
              { accessorKey: "name", header: "Lead", cell: ({ row: { original: l } }) => <div><p className="font-medium">{l.name}</p><p className="text-xs text-muted">{l.phone}</p></div> },
              { accessorKey: "source", header: "Source" },
              { accessorKey: "stage", header: "Stage", cell: ({ row }) => <Badge className={cn()} tone={row.original.stage === "Won" ? "success" : row.original.stage === "Lost" ? "danger" : "primary"}>{row.original.stage}</Badge> },
              { accessorKey: "expectedDate", header: "Event date", cell: ({ row }) => fmtDate(row.original.expectedDate) },
              { accessorKey: "budget", header: "Budget", cell: ({ row }) => moneyCompact(row.original.budget) },
              { accessorKey: "followUpAt", header: "Follow-up", cell: ({ row }) => fmtDate(row.original.followUpAt) },
            ]} />
        </TabPanel>
      </TabsRoot>
      <Card className="mt-4 p-4 text-xs text-muted">Lead sources shown: {Object.entries(bySource).map(([k, v]) => `${k} (${v})`).join(" · ")}</Card>
    </>
  );
}
