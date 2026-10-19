"use client";
import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, Eye, History } from "lucide-react";
import { useDB } from "@/stores/db";
import { pdfBlob, pdfFileName } from "@/lib/pdf/render";
import { fmtDateTime } from "@/lib/formatting";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable } from "@/components/tables/data-table";
import { Sheet, toast } from "@/components/ui/overlays";
import { Alert, Badge, Button, EmptyState } from "@/components/ui/primitives";
import { usePreview } from "@/components/documents/doc-preview";
import type { DB, DocumentRecord } from "@/types";

export default function DocumentsPage() {
  const db = useDB() as unknown as DB;
  const preview = usePreview();
  const [showAll, setShowAll] = React.useState(false);
  const [versions, setVersions] = React.useState<DocumentRecord | null>(null);
  const docs = db.documents.filter((d) => showAll || !d.superseded);

  const download = async (d: DocumentRecord) => {
    const blob = await pdfBlob(d.snapshot, db.settings);
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = pdfFileName(d.snapshot); a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast.success("PDF downloaded", pdfFileName(d.snapshot));
  };

  const cols: ColumnDef<DocumentRecord, unknown>[] = [
    { accessorKey: "ref", header: "Number", cell: ({ row: { original: d } }) => <div><p className="font-medium">{d.ref}</p><p className="text-xs text-muted">v{d.version}{d.superseded ? " · superseded" : ""}</p></div> },
    { accessorKey: "kind", header: "Type", cell: ({ row }) => <Badge tone="primary" dot={false}>{row.original.kind}</Badge> },
    { accessorKey: "title", header: "Title", cell: ({ row }) => <span className="line-clamp-1">{row.original.title}</span> },
    { id: "event", accessorFn: (d) => db.events.find((e) => e.id === d.eventId)?.ref ?? "—", header: "Event" },
    { accessorKey: "partyName", header: "Party" },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <Badge tone="neutral">{row.original.status}</Badge> },
    { accessorKey: "createdAt", header: "Generated", cell: ({ row }) => <span className="whitespace-nowrap text-muted">{fmtDateTime(row.original.createdAt)}</span> },
    { id: "act", header: "", enableSorting: false, cell: ({ row: { original: d } }) => (
      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        <Button size="sm" variant="ghost" onClick={() => preview.show(d.snapshot)} aria-label={`Preview ${d.ref}`}><Eye className="h-3.5 w-3.5" />Preview</Button>
        <Button size="sm" variant="ghost" onClick={() => void download(d)} aria-label={`Download ${d.ref}`}><Download className="h-3.5 w-3.5" /></Button>
        <Button size="sm" variant="ghost" onClick={() => setVersions(d)} aria-label={`Versions of ${d.ref}`}><History className="h-3.5 w-3.5" /></Button>
      </div>) },
  ];

  const related = versions ? db.documents.filter((d) => d.sourceId === versions.sourceId && d.kind === versions.kind).sort((a, b) => b.version - a.version) : [];
  return (
    <>
      <PageHeader title="Documents" description="Every generated PDF is stored as an immutable, versioned snapshot with its own number. Reissuing creates a new version; earlier versions are kept."
        actions={<label className="flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" className="accent-primary" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />Include superseded versions</label>} />
      <Alert tone="info" className="mb-4">Documents are generated in your browser with real PDF output (jsPDF). Quotations, work orders, invoices and receipts are created from their own screens; this centre indexes everything.</Alert>
      <DataTable data={docs} columns={cols} csvName="documents" searchText={(d) => `${d.ref} ${d.title} ${d.partyName} ${d.kind}`} onRowClick={(d) => preview.show(d.snapshot)} pageSize={12}
        initialSort={[{ id: "createdAt", desc: true }]}
        filters={[{ key: "kind", label: "Type", options: [...new Set(db.documents.map((d) => d.kind))], get: (d) => d.kind }, { key: "event", label: "Event", options: db.events.map((e) => e.ref), get: (d) => db.events.find((e) => e.id === d.eventId)?.ref ?? "" }]}
        empty={{ title: "No documents yet", description: "Generate a quotation, work order or invoice to see it here." }} />
      <Sheet open={!!versions} onOpenChange={(o) => !o && setVersions(null)} title="Version history" description={versions?.ref} width="max-w-md">
        {related.length === 0 ? <EmptyState title="No versions" /> : <ul className="divide-y divide-line rounded-lg border border-line">{related.map((d) => (
          <li key={d.id} className="flex items-center gap-3 px-3 py-2.5 text-sm"><span className="min-w-0 flex-1"><span className="block font-medium">Version {d.version} {d.superseded ? <Badge tone="neutral" dot={false}>superseded</Badge> : <Badge tone="success" dot={false}>current</Badge>}</span><span className="text-xs text-muted">{fmtDateTime(d.createdAt)} · {db.users.find((u) => u.id === d.byUserId)?.name}</span></span>
            <Button size="sm" variant="outline" onClick={() => preview.show(d.snapshot)}>Preview</Button></li>))}</ul>}
      </Sheet>
      {preview.node}
    </>
  );
}
