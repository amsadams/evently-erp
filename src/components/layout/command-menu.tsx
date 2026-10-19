"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Briefcase, CornerDownLeft, FileText, Search, Store, Users, CheckSquare, Receipt, FileSignature, LayoutGrid } from "lucide-react";
import { useDB } from "@/stores/db";
import { useUI } from "@/stores/ui";
import { cn } from "@/lib/utils";
import { NAV } from "./nav";

interface Hit { id: string; label: string; sub: string; href: string; group: string; icon: React.ReactNode }

export function CommandMenu() {
  const open = useUI((s) => s.commandOpen);
  const router = useRouter();
  const db = useDB();
  const [q, setQ] = React.useState("");
  const [idx, setIdx] = React.useState(0);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); useUI.setState((s) => ({ commandOpen: !s.commandOpen })); }
      if (e.key === "/" && !/input|textarea|select/i.test((e.target as HTMLElement)?.tagName ?? "")) { e.preventDefault(); useUI.setState({ commandOpen: true }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  React.useEffect(() => { if (open) { setQ(""); setIdx(0); } }, [open]);

  const hits = React.useMemo<Hit[]>(() => {
    const all: Hit[] = [];
    for (const g of NAV) for (const i of g.items) all.push({ id: i.href, label: i.label, sub: "Go to page", href: i.href, group: "Pages", icon: <LayoutGrid className="h-4 w-4" /> });
    for (const e of db.events) all.push({ id: e.id, label: e.title, sub: `${e.ref} · ${e.status} · ${e.venue}`, href: `/events/${e.id}`, group: "Events", icon: <Briefcase className="h-4 w-4" /> });
    for (const c of db.clients) all.push({ id: c.id, label: c.name, sub: `${c.type} client · ${c.phone}`, href: `/clients/${c.id}`, group: "Clients", icon: <Users className="h-4 w-4" /> });
    for (const v of db.vendors) all.push({ id: v.id, label: v.name, sub: `Vendor · ${v.city}`, href: `/vendors/${v.id}`, group: "Vendors", icon: <Store className="h-4 w-4" /> });
    for (const t of db.tasks) all.push({ id: t.id, label: t.title, sub: `Task · ${t.status}`, href: "/tasks", group: "Tasks", icon: <CheckSquare className="h-4 w-4" /> });
    for (const x of db.quotations) all.push({ id: x.id, label: x.ref, sub: `Quotation · ${x.title}`, href: `/quotations/${x.id}`, group: "Documents", icon: <FileSignature className="h-4 w-4" /> });
    for (const x of db.invoices) all.push({ id: x.id, label: x.ref, sub: `${x.type} · ${x.status}`, href: "/invoices", group: "Documents", icon: <Receipt className="h-4 w-4" /> });
    for (const x of db.documents.filter((d) => !d.superseded)) all.push({ id: x.id, label: x.ref, sub: `${x.kind} v${x.version}`, href: "/documents", group: "Documents", icon: <FileText className="h-4 w-4" /> });
    const n = q.trim().toLowerCase();
    const res = n ? all.filter((h) => (h.label + " " + h.sub).toLowerCase().includes(n)) : all.filter((h) => h.group === "Pages").slice(0, 8);
    return res.slice(0, 30);
  }, [db, q]);

  const go = (h: Hit) => { useUI.setState({ commandOpen: false }); router.push(h.href); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, hits.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && hits[idx]) go(hits[idx]);
  };

  let lastGroup = "";
  return (
    <Dialog.Root open={open} onOpenChange={(o) => useUI.setState({ commandOpen: o })}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-overlay fixed inset-0 z-[70] bg-ink/40" />
        <Dialog.Content className="animate-fade fixed left-1/2 top-[12vh] z-[70] w-[calc(100vw-1.5rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-surface shadow-2xl" style={{ transform: "translateX(-50%)" }}>
          <Dialog.Title className="sr-only">Global search</Dialog.Title>
          <Dialog.Description className="sr-only">Search events, clients, vendors, tasks and document numbers</Dialog.Description>
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search className="h-4 w-4 text-muted" aria-hidden />
            <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setIdx(0); }} onKeyDown={onKeyDown} placeholder="Search events, clients, vendors, tasks, document numbers…" aria-label="Global search"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-[#9aa1b4]" />
            <kbd className="hidden rounded border border-line px-1.5 py-0.5 text-[10px] text-muted sm:block">Esc</kbd>
          </div>
          <ul className="scroll-thin max-h-[52vh] overflow-y-auto p-1.5" role="listbox">
            {hits.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">No matches for “{q}”.</li>}
            {hits.map((h, i) => {
              const header = h.group !== lastGroup ? (lastGroup = h.group) : null;
              return (
                <React.Fragment key={h.group + h.id}>
                  {header && <li className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted" role="presentation">{header}</li>}
                  <li role="option" aria-selected={i === idx}>
                    <button onMouseEnter={() => setIdx(i)} onClick={() => go(h)} className={cn("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left", i === idx ? "bg-primary-soft" : "")}>
                      <span className="text-muted">{h.icon}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{h.label}</span><span className="block truncate text-xs text-muted">{h.sub}</span></span>
                      {i === idx && <CornerDownLeft className="h-3.5 w-3.5 text-primary" />}
                    </button>
                  </li>
                </React.Fragment>
              );
            })}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
