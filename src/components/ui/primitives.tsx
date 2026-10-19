"use client";
import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------- Button ---------- */
type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "icon";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-[#5b3beb] shadow-sm",
  secondary: "bg-subtle text-ink hover:bg-[#e8ebf4]",
  outline: "border border-line bg-surface text-ink hover:bg-subtle",
  ghost: "text-muted hover:bg-subtle hover:text-ink",
  danger: "bg-danger text-white hover:bg-[#a82c42]",
};
const SIZES: Record<Size, string> = { sm: "h-8 px-3 text-xs gap-1.5", md: "h-9 px-3.5 text-sm gap-2", icon: "h-9 w-9" };

export const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }>(
  ({ className, variant = "primary", size = "md", loading, children, disabled, type = "button", ...props }, ref) => (
    <button
      ref={ref} type={type} disabled={disabled || loading}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50", VARIANTS[variant], SIZES[size], className)}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";

/* ---------- Inputs ---------- */
const FieldCtx = React.createContext<{ id?: string; invalid?: boolean }>({});
const inputBase = "w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-[#9aa1b4] transition-colors hover:border-[#cfd4e2] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-subtle disabled:text-muted";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => {
  const ctx = React.useContext(FieldCtx);
  return (
  <input ref={ref} id={p.id ?? ctx.id} aria-invalid={p["aria-invalid"] ?? ctx.invalid} className={cn(inputBase, "h-9", className)} {...p} />
  );
});
Input.displayName = "Input";
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => {
  const ctx = React.useContext(FieldCtx);
  return (
  <textarea ref={ref} id={p.id ?? ctx.id} aria-invalid={p["aria-invalid"] ?? ctx.invalid} className={cn(inputBase, "min-h-[76px] py-2", className)} {...p} />
  );
});
Textarea.displayName = "Textarea";
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => {
  const ctx = React.useContext(FieldCtx);
  return (
  <select ref={ref} id={p.id ?? ctx.id} aria-invalid={p["aria-invalid"] ?? ctx.invalid} className={cn(inputBase, "h-9 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23687085%22 stroke-width=%222.5%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:12px] bg-[right_10px_center] bg-no-repeat pr-8", className)} {...p}>
    {children}
  </select>
  );
});
Select.displayName = "Select";

export function Field({ label, error, hint, children, className, required }: { label: string; error?: string; hint?: string; children: React.ReactNode; className?: string; required?: boolean }) {
  const id = React.useId();
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-xs font-medium text-muted">
        {label}{required && <span className="text-danger"> *</span>}
      </label>
      <FieldCtx.Provider value={{ id, invalid: !!error }}>{children}</FieldCtx.Provider>
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}

/** Rupee input that emits integer paise. */
export function MoneyInput({ value, onChange, className, ...p }: { value: number; onChange: (minor: number) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [text, setText] = React.useState(value ? String(value / 100) : "");
  const last = React.useRef(value);
  React.useEffect(() => { if (value !== last.current) { setText(value ? String(value / 100) : ""); last.current = value; } }, [value]);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted">₹</span>
      <Input
        inputMode="decimal" className={cn("pl-6 text-right tabular-nums", className)} value={text} {...p}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9.]/g, "");
          setText(v);
          const [w, f = ""] = v.split(".");
          const minor = Number(w || 0) * 100 + Number((f + "00").slice(0, 2));
          last.current = minor; onChange(minor);
        }}
      />
    </div>
  );
}

export function NumberInput({ value, onChange, min = 0, step = 1, className, ...p }: { value: number; onChange: (n: number) => void; min?: number; step?: number } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "min" | "step">) {
  return <Input type="number" min={min} step={step} value={Number.isFinite(value) ? value : 0} className={cn("text-right tabular-nums", className)} onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))} {...p} />;
}

/* ---------- Badge ---------- */
export type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";
const TONES: Record<Tone, string> = {
  neutral: "bg-subtle text-muted", primary: "bg-primary-soft text-primary", success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning", danger: "bg-danger-soft text-danger", info: "bg-info-soft text-info",
};
export function Badge({ tone = "neutral", children, className, dot = true }: { tone?: Tone; children: React.ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  Enquiry: "info", Planning: "primary", Confirmed: "success", "In Progress": "warning", Completed: "neutral", Cancelled: "danger", "On Hold": "warning",
  Draft: "neutral", Sent: "info", "Awaiting Confirmation": "warning", Revised: "warning", Approved: "success", Ordered: "primary", "Partially Completed": "warning",
  "Internal Review": "warning", Rejected: "danger", Expired: "danger", Converted: "success", Issued: "info", "Partially Paid": "warning", Paid: "success", Overdue: "danger", Void: "neutral",
  Pending: "warning", Disputed: "danger", "To Do": "neutral", Ongoing: "warning", Archived: "neutral", Active: "success", "Low": "neutral", Medium: "info", High: "warning", Critical: "danger",
  New: "info", Contacted: "primary", Proposal: "warning", Negotiation: "warning", Won: "success", Lost: "danger",
};
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"} className={className}>{status}</Badge>;
}

/* ---------- Layout bits ---------- */
export function Card({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(24,32,51,0.04)]", className)} {...p}>{children}</div>;
}
export function CardHeader({ title, description, action, className }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-line px-4 py-3", className)}>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, sub, tone, basis, icon, href }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: Tone; basis?: string; icon?: React.ReactNode; href?: string }) {
  const inner = (
    <Card className={cn("h-full p-4 transition-shadow", href && "hover:shadow-md")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted">{label}</p>
        {icon && <span className="text-muted">{icon}</span>}
      </div>
      <p className={cn("mt-1.5 text-xl font-semibold tabular-nums", tone === "danger" && "text-danger", tone === "success" && "text-success", tone === "warning" && "text-warning")}>{value}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
        {basis && <span className="rounded bg-subtle px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">{basis}</span>}
        {sub}
      </div>
    </Card>
  );
  return href ? <a href={href} className="block rounded-xl focus-visible:outline-offset-0">{inner}</a> : inner;
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && <div className="flex h-11 w-11 items-center justify-center rounded-full bg-subtle text-muted">{icon}</div>}
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Progress({ value, tone = "primary", className }: { value: number; tone?: Tone; className?: string }) {
  const color = { primary: "bg-primary", success: "bg-success", warning: "bg-[#d98a1f]", danger: "bg-danger", info: "bg-info", neutral: "bg-muted" }[tone];
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-subtle", className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) { return <div className={cn("skeleton", className)} />; }

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name.split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  return <span className={cn("inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary", className)} title={name}>{initials}</span>;
}

export function Alert({ tone = "info", title, children, className }: { tone?: Tone; title?: string; children?: React.ReactNode; className?: string }) {
  const map = { info: "border-info/30 bg-info-soft text-info", warning: "border-warning/30 bg-warning-soft text-warning", danger: "border-danger/30 bg-danger-soft text-danger", success: "border-success/30 bg-success-soft text-success", neutral: "border-line bg-subtle text-muted", primary: "border-primary/30 bg-primary-soft text-primary" };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-lg border px-3 py-2 text-xs", map[tone], className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title && "mt-0.5", "text-ink/80")}>{children}</div>}
    </div>
  );
}

export function DefinitionList({ items, cols = 2 }: { items: [string, React.ReactNode][]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3 text-sm", cols === 1 && "grid-cols-1", cols === 2 && "grid-cols-1 sm:grid-cols-2", cols === 3 && "grid-cols-1 sm:grid-cols-3")}>
      {items.map(([k, v]) => (
        <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="mt-0.5 font-medium">{v || "—"}</dd></div>
      ))}
    </dl>
  );
}
