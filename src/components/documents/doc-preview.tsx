"use client";
import * as React from "react";
import { Download, ExternalLink, Printer } from "lucide-react";
import type { DocSnapshot } from "@/types";
import { useDB } from "@/stores/db";
import { pdfBlob, pdfFileName } from "@/lib/pdf/render";
import { Modal, toast } from "@/components/ui/overlays";
import { Alert, Button, Skeleton } from "@/components/ui/primitives";

/** Renders a document snapshot into a real PDF (jsPDF) and shows it inline. */
export function DocPreview({ snapshot, open, onOpenChange }: { snapshot: DocSnapshot | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const settings = useDB((s) => s.settings);
  const [url, setUrl] = React.useState<string | null>(null);
  const [blob, setBlob] = React.useState<Blob | null>(null);
  const [error, setError] = React.useState("");
  const frame = React.useRef<HTMLIFrameElement>(null);

  React.useEffect(() => {
    if (!open || !snapshot) return;
    let revoked: string | null = null;
    setUrl(null); setError("");
    pdfBlob(snapshot, settings).then((b) => {
      const u = URL.createObjectURL(b);
      revoked = u; setBlob(b); setUrl(u);
    }).catch((e) => setError(String(e?.message ?? e)));
    return () => { if (revoked) URL.revokeObjectURL(revoked); };
  }, [open, snapshot, settings]);

  const download = () => {
    if (!blob || !snapshot) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = pdfFileName(snapshot); a.click();
    toast.success("PDF downloaded", pdfFileName(snapshot));
  };
  const print = () => { try { frame.current?.contentWindow?.focus(); frame.current?.contentWindow?.print(); } catch { if (url) window.open(url, "_blank"); } };

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="xl" title={snapshot?.title ?? "Document"} description={snapshot ? `${snapshot.docLabel} · ${snapshot.ref} · v${snapshot.version}` : undefined}
      footer={<>
        <Button variant="outline" onClick={() => url && window.open(url, "_blank")} disabled={!url}><ExternalLink className="h-4 w-4" />Open</Button>
        <Button variant="outline" onClick={print} disabled={!url}><Printer className="h-4 w-4" />Print</Button>
        <Button onClick={download} disabled={!blob}><Download className="h-4 w-4" />Download PDF</Button>
      </>}>
      {error ? <Alert tone="danger" title="Could not generate PDF">{error}</Alert>
        : url ? <iframe ref={frame} src={url} title="PDF preview" className="h-[68vh] w-full rounded-lg border border-line bg-subtle" />
          : <Skeleton className="h-[68vh] w-full" />}
    </Modal>
  );
}

/** Small hook to open a preview from anywhere. */
export function usePreview() {
  const [snap, setSnap] = React.useState<DocSnapshot | null>(null);
  const [open, setOpen] = React.useState(false);
  return {
    show: (s: DocSnapshot) => { setSnap(s); setOpen(true); },
    node: <DocPreview snapshot={snap} open={open} onOpenChange={setOpen} />,
  };
}
