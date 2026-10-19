import type { CompanySettings, DocSnapshot } from "@/types";

/** Render a document snapshot to a real PDF (client-side, via jsPDF). Dynamic import keeps jsPDF out of the main bundle. */
export async function renderPdf(snap: DocSnapshot, company: Pick<CompanySettings, "name" | "legalName" | "primary" | "logoText">) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  const brand = hexToRgb(company.primary || "#6D4AFF");
  const ink: [number, number, number] = [24, 32, 51];
  const muted: [number, number, number] = [104, 112, 133];

  // Header
  doc.setFillColor(...brand);
  doc.roundedRect(M, 34, 30, 30, 6, 6, "F");
  doc.setTextColor(255, 255, 255).setFont("helvetica", "bold").setFontSize(15);
  doc.text((company.logoText || company.name).slice(0, 1).toUpperCase(), M + 15, 54, { align: "center" });
  doc.setTextColor(...ink).setFontSize(14).text(company.name, M + 40, 47);
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...muted).text(company.legalName, M + 40, 59);
  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(...brand).text(snap.docLabel, W - M, 47, { align: "right", maxWidth: 300 });
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...muted);
  doc.text(`${snap.ref}  |  v${snap.version}  |  ${snap.date}  |  ${snap.status}`, W - M, 62, { align: "right" });
  doc.setDrawColor(229, 232, 240).line(M, 76, W - M, 76);

  let y = 94;
  // Parties
  const colW = (W - 2 * M - 20) / Math.max(snap.parties.length, 1);
  let maxY = y;
  snap.parties.forEach((p, i) => {
    const x = M + i * (colW + 20);
    doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(...muted).text(p.label.toUpperCase(), x, y);
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...ink);
    let yy = y + 13;
    p.lines.forEach((ln, j) => {
      const wrapped = doc.splitTextToSize(ln, colW) as string[];
      if (j === 0) doc.setFont("helvetica", "bold"); else doc.setFont("helvetica", "normal");
      doc.text(wrapped, x, yy);
      yy += wrapped.length * 11;
    });
    maxY = Math.max(maxY, yy);
  });
  y = maxY + 6;

  // Meta
  if (snap.meta.length) {
    autoTable(doc, {
      startY: y, theme: "plain", margin: { left: M, right: M },
      body: chunk(snap.meta, 2).map((pair) => pair.flatMap(([k, v]) => [k, v]).concat(pair.length === 1 ? ["", ""] : [])),
      styles: { fontSize: 8.5, cellPadding: { top: 2, bottom: 2, left: 0, right: 6 }, textColor: ink },
      columnStyles: { 0: { textColor: muted, cellWidth: 70 }, 1: { fontStyle: "bold" }, 2: { textColor: muted, cellWidth: 70 }, 3: { fontStyle: "bold" } },
    });
    y = lastY(doc) + 12;
  }

  // Tables
  for (const t of snap.tables) {
    if (t.heading) {
      doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...ink).text(t.heading, M, y + 4);
      y += 10;
    }
    autoTable(doc, {
      startY: y + 2, margin: { left: M, right: M }, head: [t.columns],
      body: t.rows.map((r) => (r[0]?.startsWith("**") ? [{ content: r[0].slice(2), colSpan: t.columns.length, styles: { fontStyle: "bold" as const, fillColor: [241, 243, 249] as [number, number, number], textColor: brand } }] : r)),
      styles: { fontSize: 8.5, cellPadding: 5, textColor: ink, lineColor: [229, 232, 240], lineWidth: 0.4 },
      headStyles: { fillColor: brand, textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 250, 253] },
      columnStyles: Object.fromEntries((t.align ?? []).map((a, i) => [i, { halign: a }])),
    });
    y = lastY(doc) + 14;
  }

  // Totals
  if (snap.totals.length) {
    const boxW = 260;
    const need = snap.totals.length * 16 + 10;
    if (y + need > H - 120) { doc.addPage(); y = 50; }
    snap.totals.forEach(([k, v, strong]) => {
      doc.setFont("helvetica", strong ? "bold" : "normal").setFontSize(strong ? 10.5 : 9).setTextColor(...(strong ? ink : muted));
      doc.text(k, W - M - boxW, y, { maxWidth: boxW - 90 });
      doc.setTextColor(...ink).text(v, W - M, y, { align: "right" });
      if (strong) doc.setDrawColor(...brand).setLineWidth(0.8).line(W - M - boxW, y + 5, W - M, y + 5);
      y += 16;
    });
    y += 8;
  }

  // Notes
  for (const n of snap.notes.filter((n) => n.text.trim())) {
    const lines = doc.splitTextToSize(n.text, W - 2 * M) as string[];
    if (y + 14 + lines.length * 10.5 > H - 90) { doc.addPage(); y = 50; }
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...ink).text(n.heading, M, y);
    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...muted).text(lines, M, y + 12);
    y += 18 + lines.length * 10.5;
  }

  // Signatures
  if (snap.signatures.length) {
    if (y + 70 > H - 70) { doc.addPage(); y = 50; }
    y += 30;
    const w = (W - 2 * M - 30 * (snap.signatures.length - 1)) / snap.signatures.length;
    snap.signatures.forEach((s, i) => {
      const x = M + i * (w + 30);
      doc.setDrawColor(...muted).setLineWidth(0.5).line(x, y, x + w, y);
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...muted).text(s, x, y + 11);
    });
    y += 24;
  }
  if (snap.disclaimer) {
    const lines = doc.splitTextToSize(snap.disclaimer, W - 2 * M) as string[];
    if (y + lines.length * 10 > H - 50) { doc.addPage(); y = 50; }
    doc.setFont("helvetica", "italic").setFontSize(8).setTextColor(...muted).text(lines, M, y + 8);
  }

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(150, 156, 170);
    doc.text(`${company.legalName}  |  ${snap.ref}  |  DEMO DATA - not a legal document`, M, H - 24);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 24, { align: "right" });
  }
  return doc;
}

export async function pdfBlob(snap: DocSnapshot, company: Pick<CompanySettings, "name" | "legalName" | "primary" | "logoText">): Promise<Blob> {
  const doc = await renderPdf(snap, company);
  return doc.output("blob");
}

export const pdfFileName = (snap: DocSnapshot) => `${snap.ref.replace(/[^\w.-]+/g, "_")}_v${snap.version}.pdf`;

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lastY(doc: unknown): number {
  return (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 100;
}
