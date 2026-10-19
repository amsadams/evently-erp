"use client";
import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { create } from "zustand";
import { cn } from "@/lib/utils";
import { Button } from "./primitives";

/* ---------- Modal / Sheet ---------- */
export function Modal({ open, onOpenChange, title, description, children, footer, size = "md" }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode; size?: "sm" | "md" | "lg" | "xl";
}) {
  const w = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" }[size];
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-overlay fixed inset-0 z-50 bg-ink/40 backdrop-blur-[1px]" />
        <Dialog.Content
          className={cn("animate-pop fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[calc(100vw-1.5rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-line bg-surface shadow-2xl", w)}
          aria-describedby={description ? undefined : undefined}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
              <Dialog.Description className={cn("mt-0.5 text-xs text-muted", !description && "sr-only")}>{description ?? title}</Dialog.Description>
            </div>
            <Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close" className="-mr-2 -mt-1"><X className="h-4 w-4" /></Button></Dialog.Close>
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-canvas/60 px-5 py-3">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Sheet({ open, onOpenChange, title, description, children, footer, width = "max-w-lg" }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode; width?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-overlay fixed inset-0 z-50 bg-ink/30" />
        <Dialog.Content className={cn("animate-sheet fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line bg-surface shadow-2xl", width)}>
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
              <Dialog.Description className={cn("mt-0.5 text-xs text-muted", !description && "sr-only")}>{description ?? title}</Dialog.Description>
            </div>
            <Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close" className="-mr-2 -mt-1"><X className="h-4 w-4" /></Button></Dialog.Close>
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-canvas/60 px-5 py-3">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ---------- Confirm ---------- */
interface ConfirmState { open: boolean; title: string; message: string; confirmLabel: string; danger: boolean; resolve?: (v: boolean) => void }
const useConfirmStore = create<ConfirmState>(() => ({ open: false, title: "", message: "", confirmLabel: "Confirm", danger: false }));

/** Promise-based confirmation dialog. */
export function confirm(opts: { title: string; message: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirmStore.setState({ open: true, title: opts.title, message: opts.message, confirmLabel: opts.confirmLabel ?? "Confirm", danger: !!opts.danger, resolve });
  });
}
export function ConfirmHost() {
  const s = useConfirmStore();
  const close = (v: boolean) => { s.resolve?.(v); useConfirmStore.setState({ open: false, resolve: undefined }); };
  return (
    <Modal open={s.open} onOpenChange={(o) => { if (!o) close(false); }} title={s.title} size="sm"
      footer={<><Button variant="outline" onClick={() => close(false)}>Cancel</Button><Button variant={s.danger ? "danger" : "primary"} onClick={() => close(true)}>{s.confirmLabel}</Button></>}>
      <p className="text-sm text-muted">{s.message}</p>
    </Modal>
  );
}

/* ---------- Toasts ---------- */
interface ToastItem { id: number; tone: "success" | "error" | "info" | "warning"; title: string; body?: string }
const useToastStore = create<{ items: ToastItem[] }>(() => ({ items: [] }));
let toastId = 0;
export function toast(tone: ToastItem["tone"], title: string, body?: string) {
  const id = ++toastId;
  useToastStore.setState((s) => ({ items: [...s.items, { id, tone, title, body }].slice(-4) }));
  setTimeout(() => useToastStore.setState((s) => ({ items: s.items.filter((t) => t.id !== id) })), tone === "error" ? 7000 : 4200);
}
toast.success = (t: string, b?: string) => toast("success", t, b);
toast.error = (t: string, b?: string) => toast("error", t, b);
toast.info = (t: string, b?: string) => toast("info", t, b);
toast.warning = (t: string, b?: string) => toast("warning", t, b);

export function Toaster() {
  const items = useToastStore((s) => s.items);
  const icon = { success: <CheckCircle2 className="h-4 w-4 text-success" />, error: <XCircle className="h-4 w-4 text-danger" />, warning: <AlertTriangle className="h-4 w-4 text-warning" />, info: <Info className="h-4 w-4 text-info" /> };
  return (
    <div className="pointer-events-none fixed bottom-20 right-3 z-[100] flex w-[calc(100vw-1.5rem)] max-w-sm flex-col gap-2 md:bottom-4 md:right-4" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="animate-fade pointer-events-auto flex gap-2.5 rounded-lg border border-line bg-surface p-3 shadow-lg" role={t.tone === "error" ? "alert" : "status"}>
          <span className="mt-0.5">{icon[t.tone]}</span>
          <div className="min-w-0 flex-1"><p className="text-sm font-medium">{t.title}</p>{t.body && <p className="mt-0.5 text-xs text-muted">{t.body}</p>}</div>
          <button aria-label="Dismiss" className="text-muted hover:text-ink" onClick={() => useToastStore.setState((s) => ({ items: s.items.filter((x) => x.id !== t.id) }))}><X className="h-3.5 w-3.5" /></button>
        </div>
      ))}
    </div>
  );
}

/* ---------- Tabs ---------- */
export function TabsRoot({ value, onValueChange, tabs, children, className }: {
  value: string; onValueChange: (v: string) => void; tabs: { value: string; label: string; count?: number }[]; children: React.ReactNode; className?: string;
}) {
  return (
    <Tabs.Root value={value} onValueChange={onValueChange} className={className}>
      <Tabs.List className="scroll-thin -mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-line px-1" aria-label="Sections">
        {tabs.map((t) => (
          <Tabs.Trigger key={t.value} value={t.value} className="relative flex h-10 shrink-0 items-center gap-1.5 px-3 text-sm font-medium text-muted transition-colors hover:text-ink data-[state=active]:text-primary data-[state=active]:after:absolute data-[state=active]:after:inset-x-2 data-[state=active]:after:-bottom-px data-[state=active]:after:h-0.5 data-[state=active]:after:rounded-full data-[state=active]:after:bg-primary">
            {t.label}
            {t.count !== undefined && <span className="rounded-full bg-subtle px-1.5 text-[10px] font-semibold text-muted">{t.count}</span>}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {children}
    </Tabs.Root>
  );
}
export const TabPanel = ({ value, children }: { value: string; children: React.ReactNode }) => (
  <Tabs.Content value={value} className="animate-fade focus:outline-none">{children}</Tabs.Content>
);

/* ---------- Menu ---------- */
export interface MenuItem { label: string; icon?: React.ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean; separatorBefore?: boolean }
export function ActionMenu({ items, trigger, align = "end" }: { items: MenuItem[]; trigger: React.ReactNode; align?: "start" | "end" }) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>{trigger}</Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align={align} sideOffset={6} className="animate-fade z-[60] min-w-[11rem] overflow-hidden rounded-lg border border-line bg-surface p-1 shadow-xl">
          {items.map((it) => (
            <React.Fragment key={it.label}>
              {it.separatorBefore && <Dropdown.Separator className="my-1 h-px bg-line" />}
              <Dropdown.Item
                disabled={it.disabled} onSelect={() => it.onSelect()}
                className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 data-[highlighted]:bg-subtle", it.danger ? "text-danger" : "text-ink")}
              >
                {it.icon && <span className="text-muted">{it.icon}</span>}{it.label}
              </Dropdown.Item>
            </React.Fragment>
          ))}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
