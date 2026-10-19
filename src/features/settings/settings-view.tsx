"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { Download, Plus, RotateCcw, ShieldCheck, Wifi } from "lucide-react";
import { useDB } from "@/stores/db";
import { useCurrentUser } from "@/hooks/use-app";
import { resetAll, setRolePermissions, updateSettings, upsert } from "@/services/admin";
import { saveCatalogueItem } from "@/services/vendors";
import { subscribeToPush, unsubscribeFromPush, notificationPermission, requestNotificationPermission } from "@/lib/pwa/client";
import { fmtDateTime } from "@/lib/formatting";
import { uid } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable } from "@/components/tables/data-table";
import { TabPanel, TabsRoot, confirm, toast } from "@/components/ui/overlays";
import { Alert, Badge, Button, Card, CardHeader, DefinitionList, Field, Input, MoneyInput, NumberInput, Select, Textarea } from "@/components/ui/primitives";
import { FormDialog } from "@/components/forms/form-dialog";
import { EVENT_STATUSES, type DB, type NotificationType, type PermissionCode, type User } from "@/types";
import { money } from "@/lib/formatting";

const PERMS: { code: PermissionCode; label: string }[] = [
  { code: "events.read", label: "View events" }, { code: "events.write", label: "Manage events" }, { code: "clients.read", label: "View clients" }, { code: "clients.write", label: "Manage clients" },
  { code: "vendors.read", label: "View vendors" }, { code: "vendors.write", label: "Manage vendors" }, { code: "quotes.read", label: "View quotations" }, { code: "quotes.write", label: "Edit quotations" },
  { code: "quotes.approve", label: "Approve quotes/agreements" }, { code: "finance.read", label: "View finance" }, { code: "finance.write", label: "Record payments/invoices" }, { code: "tasks.write", label: "Manage tasks" },
  { code: "inventory.write", label: "Manage inventory" }, { code: "reports.read", label: "View reports" }, { code: "settings.manage", label: "Manage settings" }, { code: "audit.read", label: "View audit log" },
];

export function SettingsView() {
  const router = useRouter();
  const search = useSearchParams();
  const tab = search.get("tab") ?? "company";
  const setTab = (t: string) => router.replace(`/settings?tab=${t}`, { scroll: false });
  const { can } = useCurrentUser();
  const admin = can("settings.manage");
  const audit = can("audit.read");

  return (
    <>
      <PageHeader title="Settings & administration" description="Company profile, users and roles, catalogues, numbering, tax, workflow, notifications, audit log and PWA tools." />
      {!admin && <Alert tone="warning" className="mb-4">Your role can view but not change configuration. Switch to Administrator from the profile menu to edit.</Alert>}
      <TabsRoot value={tab} onValueChange={setTab} tabs={[
        { value: "company", label: "Company" }, { value: "users", label: "Users & roles" }, { value: "catalogue", label: "Catalogues" }, { value: "numbering", label: "Numbering & tax" },
        { value: "workflow", label: "Workflow" }, { value: "notifications", label: "Notifications" }, ...(audit ? [{ value: "audit", label: "Audit log" }] : []), { value: "app", label: "Application & PWA" },
      ]}>
        <TabPanel value="company"><CompanyTab admin={admin} /></TabPanel>
        <TabPanel value="users"><UsersTab admin={admin} /></TabPanel>
        <TabPanel value="catalogue"><CatalogueTab admin={admin} /></TabPanel>
        <TabPanel value="numbering"><NumberingTab admin={admin} /></TabPanel>
        <TabPanel value="workflow"><WorkflowTab admin={admin} /></TabPanel>
        <TabPanel value="notifications"><NotifTab admin={admin} /></TabPanel>
        {audit && <TabPanel value="audit"><AuditTab /></TabPanel>}
        <TabPanel value="app"><AppTab admin={admin} /></TabPanel>
      </TabsRoot>
    </>
  );
}

function CompanyTab({ admin }: { admin: boolean }) {
  const s = useDB((x) => x.settings);
  const [f, setF] = React.useState(s);
  const set = (p: Partial<typeof s>) => setF((x) => ({ ...x, ...p }));
  const dirty = JSON.stringify(f) !== JSON.stringify(s);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Company profile" description="Used on every generated document" />
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <Field label="Trading name"><Input disabled={!admin} value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Legal name"><Input disabled={!admin} value={f.legalName} onChange={(e) => set({ legalName: e.target.value })} /></Field>
          <Field label="Address" className="sm:col-span-2"><Textarea disabled={!admin} value={f.address} onChange={(e) => set({ address: e.target.value })} /></Field>
          <Field label="Phone"><Input disabled={!admin} value={f.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
          <Field label="Email"><Input disabled={!admin} value={f.email} onChange={(e) => set({ email: e.target.value })} /></Field>
          <Field label="GSTIN"><Input disabled={!admin} value={f.gstin} onChange={(e) => set({ gstin: e.target.value })} /></Field>
          <Field label="PAN"><Input disabled={!admin} value={f.pan} onChange={(e) => set({ pan: e.target.value })} /></Field>
          <Field label="Logo text / initial" hint="A logo upload needs backend file storage."><Input disabled={!admin} value={f.logoText} maxLength={12} onChange={(e) => set({ logoText: e.target.value })} /></Field>
          <Field label="Brand colour (documents)"><div className="flex gap-2"><input type="color" aria-label="Brand colour" disabled={!admin} value={f.primary} onChange={(e) => set({ primary: e.target.value })} className="h-9 w-12 rounded border border-line" /><Input disabled={!admin} value={f.primary} onChange={(e) => set({ primary: e.target.value })} /></div></Field>
          <Field label="Bank details (printed on invoices)" className="sm:col-span-2"><Textarea disabled={!admin} value={f.bank} onChange={(e) => set({ bank: e.target.value })} /></Field>
          <Field label="Default terms & conditions" className="sm:col-span-2"><Textarea className="min-h-[100px]" disabled={!admin} value={f.terms} onChange={(e) => set({ terms: e.target.value })} /></Field>
        </div>
        {admin && <div className="flex justify-end gap-2 border-t border-line px-4 py-3"><Button variant="outline" disabled={!dirty} onClick={() => setF(s)}>Reset</Button><Button disabled={!dirty} onClick={() => { updateSettings(f); toast.success("Company settings saved"); }}>Save changes</Button></div>}
      </Card>
      <Card>
        <CardHeader title="Tax & document treatment" />
        <div className="space-y-4 p-4 text-sm">
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 accent-primary" disabled={!admin} checked={f.taxRegistered} onChange={(e) => { set({ taxRegistered: e.target.checked }); }} /><span><span className="font-medium">Company is tax-registered</span><span className="block text-xs text-muted">When off, tax invoices cannot be issued — use bills of supply or proforma requests.</span></span></label>
          <Field label="Default tax mode for new quotations"><Select disabled={!admin} value={f.invoiceDefaultTaxMode} onChange={(e) => set({ invoiceDefaultTaxMode: e.target.value as any })}><option value="exclusive">Tax exclusive</option><option value="inclusive">Tax inclusive</option><option value="none">No tax</option></Select></Field>
          <Alert tone="warning">Tax rates, document series and place-of-supply rules must be validated by your accountant before production use. This demo does not provide legal or tax advice.</Alert>
          <div className="flex items-center justify-between text-xs"><span className="text-muted">Currency</span><Badge tone="neutral" dot={false}>{f.currency} (₹)</Badge></div>
        </div>
      </Card>
    </div>
  );
}

function UsersTab({ admin }: { admin: boolean }) {
  const db = useDB() as unknown as DB;
  const [dlg, setDlg] = React.useState<{ user?: User } | null>(null);
  const [roleId, setRoleId] = React.useState(db.roles[0].id);
  const role = db.roles.find((r) => r.id === roleId)!;
  const toggle = (c: PermissionCode) => setRolePermissions(role.id, role.permissions.includes(c) ? role.permissions.filter((x) => x !== c) : [...role.permissions, c]);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Users & staff" action={admin && <Button size="sm" onClick={() => setDlg({})}><Plus className="h-3.5 w-3.5" />Add user</Button>} />
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead className="bg-canvas text-xs text-muted"><tr>{["Name", "Role", "Department", "Phone", "Status", ""].map((h) => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">{db.users.map((u) => (
            <tr key={u.id}><td className="px-3 py-2"><p className="font-medium">{u.name}</p><p className="text-xs text-muted">{u.email}</p></td><td className="px-3 py-2">{db.roles.find((r) => r.id === u.roleId)?.name}</td><td className="px-3 py-2">{db.departments.find((d) => d.id === u.departmentId)?.name}</td><td className="px-3 py-2">{u.phone}</td>
              <td className="px-3 py-2"><Badge tone={u.active ? "success" : "neutral"}>{u.active ? "Active" : "Deactivated"}</Badge></td>
              <td className="px-3 py-2 text-right">{admin && <><Button size="sm" variant="ghost" onClick={() => setDlg({ user: u })}>Edit</Button><Button size="sm" variant="ghost" onClick={() => { upsert("users", { ...u, active: !u.active }); toast.info(u.active ? "User deactivated" : "User activated"); }}>{u.active ? "Deactivate" : "Activate"}</Button></>}</td></tr>))}</tbody></table></div>
      </Card>
      <Card>
        <CardHeader title="Roles & permissions" description="UI visibility only in this demo. Real authorization (action + record scope) must be enforced server-side." action={<Select aria-label="Role" className="w-auto" value={roleId} onChange={(e) => setRoleId(e.target.value)}>{db.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>} />
        <div className="p-4"><p className="mb-3 text-sm text-muted">{role.description}</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{PERMS.map((p) => <label key={p.code} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm"><input type="checkbox" className="accent-primary" disabled={!admin || role.id === "r_admin"} checked={role.permissions.includes(p.code)} onChange={() => toggle(p.code)} /><span>{p.label}<span className="block font-mono text-[10px] text-muted">{p.code}</span></span></label>)}</div>
          {role.id === "r_admin" && <p className="mt-2 text-xs text-muted">The administrator role is locked to prevent lock-out.</p>}</div>
      </Card>
      <FormDialog open={!!dlg} onOpenChange={(o) => !o && setDlg(null)} size="sm" title={dlg?.user ? "Edit user" : "Add user"} schema={z.object({ name: z.string().min(2, "Name is required"), email: z.string().email("Enter a valid email"), phone: z.string().optional(), roleId: z.string().min(1), departmentId: z.string().min(1) })}
        fields={[{ name: "name", label: "Full name", required: true, span: 2 }, { name: "email", label: "Email", type: "email", required: true }, { name: "phone", label: "Phone" }, { name: "roleId", label: "Role", type: "select", required: true, options: db.roles.map((r) => ({ value: r.id, label: r.name })) }, { name: "departmentId", label: "Department", type: "select", required: true, options: db.departments.map((d) => ({ value: d.id, label: d.name })) }]}
        defaultValues={{ name: dlg?.user?.name ?? "", email: dlg?.user?.email ?? "", phone: dlg?.user?.phone ?? "", roleId: dlg?.user?.roleId ?? "r_coord", departmentId: dlg?.user?.departmentId ?? "dp1" }}
        onSubmit={(v: any) => { upsert("users", { id: dlg?.user?.id ?? uid("u"), active: dlg?.user?.active ?? true, phone: "", ...v }); toast.success(dlg?.user ? "User updated" : "User added", "Invitation emails need the backend."); }} />
    </div>
  );
}

function CatalogueTab({ admin }: { admin: boolean }) {
  const db = useDB() as unknown as DB;
  const [dlg, setDlg] = React.useState<{ item?: any } | null>(null);
  const [catDlg, setCatDlg] = React.useState(false);
  const [unitDlg, setUnitDlg] = React.useState(false);
  const [typeDlg, setTypeDlg] = React.useState(false);
  const [typeSel, setTypeSel] = React.useState(db.eventTypes[0].id);
  const type = db.eventTypes.find((t) => t.id === typeSel)!;
  const items = db.catalogue.filter((c) => c.scope === "company");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader title="Company service catalogue" description="Selling-side items used in client quotations. Vendor catalogues live on each vendor." action={admin && <Button size="sm" onClick={() => setDlg({})}><Plus className="h-3.5 w-3.5" />Add item</Button>} />
        <DataTable data={items} pageSize={6} onRowClick={admin ? (c) => setDlg({ item: c }) : undefined} searchText={(c) => c.name}
          columns={[{ accessorKey: "name", header: "Service" }, { id: "dept", accessorFn: (c: any) => db.departments.find((d) => d.id === c.departmentId)?.name ?? "", header: "Department" }, { accessorKey: "unit", header: "Unit" }, { accessorKey: "rate", header: "Rate", cell: ({ row }: any) => <span className="tabular-nums">{money(row.original.rate)}</span> }, { accessorKey: "taxRate", header: "GST %" }, { accessorKey: "active", header: "Status", cell: ({ row }: any) => <Badge tone={row.original.active ? "success" : "neutral"}>{row.original.active ? "Active" : "Inactive"}</Badge> }]} />
      </Card>
      <Card><CardHeader title="Vendor categories" action={admin && <Button size="sm" variant="outline" onClick={() => setCatDlg(true)}><Plus className="h-3.5 w-3.5" />Add</Button>} />
        <div className="flex flex-wrap gap-2 p-4">{db.settings.vendorCategories.map((c) => <Badge key={c.id} tone="neutral" dot={false}>{c.name}</Badge>)}</div></Card>
      <Card><CardHeader title="Units of measurement" action={admin && <Button size="sm" variant="outline" onClick={() => setUnitDlg(true)}><Plus className="h-3.5 w-3.5" />Add</Button>} />
        <div className="flex flex-wrap gap-2 p-4">{db.settings.units.map((u) => <Badge key={u.id} tone="neutral" dot={false}>{u.name}</Badge>)}</div></Card>
      <Card className="lg:col-span-2">
        <CardHeader title="Event types & templates" description="Default functions, departments, tasks and milestones generated for new events" action={<Select aria-label="Event type" className="w-auto" value={typeSel} onChange={(e) => setTypeSel(e.target.value)}>{db.eventTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>} />
        <div className="grid gap-4 p-4 md:grid-cols-3">
          <div><h4 className="mb-1.5 text-xs font-semibold text-muted">DEFAULT FUNCTIONS</h4><ul className="space-y-1 text-sm">{type.defaultFunctions.map((f) => <li key={f}>• {f}</li>)}</ul></div>
          <div><h4 className="mb-1.5 text-xs font-semibold text-muted">TASK TEMPLATE</h4><ul className="space-y-1 text-sm">{type.taskTemplate.map((t) => <li key={t.title}>• {t.title} <span className="text-xs text-muted">({t.offsetDays}d)</span></li>)}</ul></div>
          <div><h4 className="mb-1.5 text-xs font-semibold text-muted">MILESTONES</h4><ul className="space-y-1 text-sm">{type.milestoneTemplate.map((t) => <li key={t.title}>• {t.title} <span className="text-xs text-muted">({t.offsetDays}d)</span></li>)}</ul></div>
        </div>
        {admin && <div className="border-t border-line px-4 py-3"><Button size="sm" variant="outline" onClick={() => setTypeDlg(true)}><Plus className="h-3.5 w-3.5" />Add event type</Button></div>}
      </Card>
      <FormDialog open={!!dlg} onOpenChange={(o) => !o && setDlg(null)} size="sm" title={dlg?.item ? "Edit service" : "Add service"} schema={z.object({ name: z.string().min(2, "Name is required"), departmentId: z.string().min(1), unit: z.string().min(1), rate: z.number().int().min(0), taxRate: z.number().min(0).max(40), active: z.boolean().optional() })}
        fields={[{ name: "name", label: "Service", required: true, span: 2 }, { name: "departmentId", label: "Department", type: "select", required: true, options: db.departments.map((d) => ({ value: d.id, label: d.name })) }, { name: "unit", label: "Unit", required: true }, { name: "rate", label: "Selling rate", type: "money" }, { name: "taxRate", label: "GST %", type: "number" }, { name: "active", label: "Active", type: "checkbox" }]}
        defaultValues={{ name: dlg?.item?.name ?? "", departmentId: dlg?.item?.departmentId ?? "dp1", unit: dlg?.item?.unit ?? "event", rate: dlg?.item?.rate ?? 0, taxRate: dlg?.item?.taxRate ?? 18, active: dlg?.item?.active ?? true }}
        onSubmit={(v: any) => { saveCatalogueItem({ ...v, id: dlg?.item?.id, scope: "company" }); toast.success("Catalogue saved", "Issued quotations keep their snapshot prices."); }} />
      <FormDialog open={typeDlg} onOpenChange={setTypeDlg} size="sm" title="Add event type" description="Start from an empty template; add default tasks in a later release." schema={z.object({ name: z.string().min(2, "Name is required"), category: z.enum(["wedding", "corporate", "private"]) })}
        fields={[{ name: "name", label: "Event type name", required: true, span: 2 }, { name: "category", label: "Category", type: "select", required: true, options: [{ value: "wedding", label: "Wedding" }, { value: "corporate", label: "Corporate" }, { value: "private", label: "Private" }] }]} defaultValues={{ name: "", category: "private" }}
        onSubmit={(v: any) => { upsert("eventTypes", { id: uid("et"), name: v.name, category: v.category, color: "#64748b", defaultFunctions: ["Main event"], defaultDepartmentIds: [], taskTemplate: [], milestoneTemplate: [] }); toast.success("Event type added"); }} />
      <FormDialog open={catDlg} onOpenChange={setCatDlg} size="sm" title="Add vendor category" schema={z.object({ name: z.string().min(2) })} fields={[{ name: "name", label: "Category name", required: true, span: 2 }]} defaultValues={{ name: "" }}
        onSubmit={(v: any) => { updateSettings({ vendorCategories: [...db.settings.vendorCategories, { id: uid("vc"), name: v.name }] }); toast.success("Category added"); }} />
      <FormDialog open={unitDlg} onOpenChange={setUnitDlg} size="sm" title="Add unit" schema={z.object({ name: z.string().min(1) })} fields={[{ name: "name", label: "Unit (e.g. sq.ft)", required: true, span: 2 }]} defaultValues={{ name: "" }}
        onSubmit={(v: any) => { updateSettings({ units: [...db.settings.units, { id: uid("un"), name: v.name, short: v.name }] }); toast.success("Unit added"); }} />
    </div>
  );
}

function NumberingTab({ admin }: { admin: boolean }) {
  const s = useDB((x) => x.settings);
  const [rules, setRules] = React.useState(s.numbering);
  const [taxDlg, setTaxDlg] = React.useState(false);
  const dirty = JSON.stringify(rules) !== JSON.stringify(s.numbering);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Document numbering" description="Sequences are allocated atomically in this demo; production allocates inside database transactions. Statutory invoice series are controlled by finance." />
        <div className="space-y-2 p-4">{rules.map((r, i) => (
          <div key={r.key} className="grid grid-cols-[1.2fr_1.4fr_5rem_4rem] items-center gap-2"><span className="text-sm">{r.label}</span>
            <Input aria-label={`${r.label} prefix`} disabled={!admin} value={r.prefix} onChange={(e) => setRules((x) => x.map((y, j) => (j === i ? { ...y, prefix: e.target.value } : y)))} />
            <NumberInput aria-label={`${r.label} next number`} disabled={!admin} value={r.next} min={1} onChange={(n) => setRules((x) => x.map((y, j) => (j === i ? { ...y, next: Math.max(1, n) } : y)))} />
            <NumberInput aria-label={`${r.label} padding`} disabled={!admin} value={r.padding} min={1} onChange={(n) => setRules((x) => x.map((y, j) => (j === i ? { ...y, padding: Math.min(8, Math.max(1, n)) } : y)))} /></div>))}
          <p className="text-xs text-muted">Columns: prefix · next number · zero padding. Next: <span className="font-mono">{rules[2]?.prefix}{String(rules[2]?.next).padStart(rules[2]?.padding ?? 4, "0")}</span></p></div>
        {admin && <div className="flex justify-end gap-2 border-t border-line px-4 py-3"><Button variant="outline" disabled={!dirty} onClick={() => setRules(s.numbering)}>Reset</Button><Button disabled={!dirty} onClick={() => { updateSettings({ numbering: rules }); toast.success("Numbering saved"); }}>Save</Button></div>}
      </Card>
      <Card>
        <CardHeader title="Tax rates" action={admin && <Button size="sm" variant="outline" onClick={() => setTaxDlg(true)}><Plus className="h-3.5 w-3.5" />Add</Button>} />
        <ul className="divide-y divide-line">{s.taxRates.map((t) => <li key={t.id} className="flex items-center justify-between px-4 py-2.5 text-sm"><span>{t.name} <span className="text-xs text-muted">({t.rate}%)</span></span>
          <label className="flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" className="accent-primary" disabled={!admin} checked={t.active} onChange={() => updateSettings({ taxRates: s.taxRates.map((x) => (x.id === t.id ? { ...x, active: !x.active } : x)) })} />Active</label></li>)}</ul>
        <div className="border-t border-line p-4"><h4 className="mb-2 text-xs font-semibold text-muted">PAYMENT METHODS</h4><div className="flex flex-wrap gap-2">{(["Cash", "Bank Transfer", "UPI", "Cheque", "Card"] as const).map((m) => <label key={m} className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs"><input type="checkbox" className="accent-primary" disabled={!admin} checked={s.paymentMethods.includes(m)} onChange={() => updateSettings({ paymentMethods: s.paymentMethods.includes(m) ? s.paymentMethods.filter((x) => x !== m) : [...s.paymentMethods, m] })} />{m}</label>)}</div></div>
      </Card>
      <FormDialog open={taxDlg} onOpenChange={setTaxDlg} size="sm" title="Add tax rate" schema={z.object({ name: z.string().min(2), rate: z.number().min(0).max(100) })} fields={[{ name: "name", label: "Name", required: true, span: 2 }, { name: "rate", label: "Rate %", type: "number", step: 0.5 }]} defaultValues={{ name: "", rate: 18 }}
        onSubmit={(v: any) => { updateSettings({ taxRates: [...s.taxRates, { id: uid("tx"), name: v.name, rate: v.rate, active: true }] }); toast.success("Tax rate added"); }} />
    </div>
  );
}

function WorkflowTab({ admin }: { admin: boolean }) {
  const s = useDB((x) => x.settings);
  const toggle = (from: string, to: string) => {
    const cur = s.statusFlow[from as keyof typeof s.statusFlow] ?? [];
    updateSettings({ statusFlow: { ...s.statusFlow, [from]: cur.includes(to as any) ? cur.filter((x) => x !== to) : [...cur, to] } as any });
  };
  return (
    <Card>
      <CardHeader title="Event status transitions" description="Rows are the current status, columns the statuses it may move to. The event board, status menu and edit form all obey this matrix." />
      <div className="overflow-x-auto p-4"><table className="w-full min-w-[640px] text-sm"><thead><tr><th className="px-2 py-2 text-left text-xs text-muted">From ↓ / To →</th>{EVENT_STATUSES.map((s2) => <th key={s2} className="px-2 py-2 text-center text-xs font-medium text-muted">{s2}</th>)}</tr></thead>
        <tbody>{EVENT_STATUSES.map((from) => <tr key={from} className="border-t border-line"><td className="px-2 py-2 font-medium">{from}</td>{EVENT_STATUSES.map((to) => <td key={to} className="px-2 py-2 text-center">{from === to ? <span className="text-muted">–</span> : <input type="checkbox" aria-label={`${from} to ${to}`} className="accent-primary" disabled={!admin} checked={(s.statusFlow[from] ?? []).includes(to)} onChange={() => toggle(from, to)} />}</td>)}</tr>)}</tbody></table></div>
    </Card>
  );
}

function NotifTab({ admin }: { admin: boolean }) {
  const s = useDB((x) => x.settings);
  const label: Record<NotificationType, string> = { event: "Upcoming events & status changes", task: "Task deadlines & completion", quotation: "Quotation approvals & expiry", vendor: "Vendor confirmations & bills", payment: "Payment due dates & overdue", inventory: "Inventory shortages & reorder", conflict: "Scheduling & venue conflicts", document: "Document revisions", assignment: "Assignment changes", system: "System messages" };
  return (
    <Card>
      <CardHeader title="Notification preferences" description="Disabled types are no longer generated by the alert engine." />
      <ul className="divide-y divide-line">{(Object.keys(label) as NotificationType[]).map((k) => <li key={k} className="flex items-center justify-between px-4 py-3 text-sm"><span>{label[k]}</span><input type="checkbox" aria-label={label[k]} className="h-4 w-4 accent-primary" disabled={!admin} checked={s.notificationPrefs[k]} onChange={() => updateSettings({ notificationPrefs: { ...s.notificationPrefs, [k]: !s.notificationPrefs[k] } })} /></li>)}</ul>
    </Card>
  );
}

function AuditTab() {
  const db = useDB() as unknown as DB;
  return (
    <DataTable data={db.audit} pageSize={12} csvName="audit-log" searchText={(a) => `${a.summary} ${a.entity} ${a.action}`}
      filters={[{ key: "entity", label: "Module", options: [...new Set(db.audit.map((a) => a.entity))], get: (a) => a.entity }, { key: "user", label: "User", options: db.users.map((u) => u.name), get: (a) => db.users.find((u) => u.id === a.userId)?.name ?? "" }]}
      columns={[{ accessorKey: "at", header: "When", cell: ({ row }: any) => <span className="whitespace-nowrap text-muted">{fmtDateTime(row.original.at)}</span> }, { id: "user", accessorFn: (a: any) => db.users.find((u) => u.id === a.userId)?.name ?? "", header: "User" }, { accessorKey: "entity", header: "Module" }, { accessorKey: "action", header: "Action" }, { accessorKey: "summary", header: "Summary" }]} />
  );
}

function AppTab({ admin }: { admin: boolean }) {
  const [perm, setPerm] = React.useState<string>("default");
  const [sw, setSw] = React.useState("checking…");
  const [online, setOnline] = React.useState(true);
  const [pushMsg, setPushMsg] = React.useState("");
  React.useEffect(() => {
    setPerm(notificationPermission()); setOnline(navigator.onLine);
    navigator.serviceWorker?.getRegistration().then((r) => setSw(r ? (r.active ? "Active" : "Installing") : "Not registered (production build only)")).catch(() => setSw("Unavailable"));
  }, []);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Demo data" description="All records live in this browser's local storage." />
        <div className="space-y-3 p-4 text-sm">
          <Alert tone="info">Data is demo-only and persists across refreshes on this device. Payments, emails, WhatsApp and push are simulated.</Alert>
          <Button variant="danger" onClick={async () => { if (await confirm({ title: "Reset demo data?", message: "All changes you made are discarded and the original seed dataset is restored.", confirmLabel: "Reset everything", danger: true })) { resetAll(); toast.success("Demo data reset"); } }}><RotateCcw className="h-4 w-4" />Reset demo data</Button>
        </div>
      </Card>
      <Card>
        <CardHeader title="Theme" />
        <div className="p-4 text-sm text-muted">Light theme is the default for this release (per the product blueprint). Dark mode is not implemented yet.</div>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader title="PWA status" description="Installability, offline behaviour and notifications" />
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <DefinitionList cols={1} items={[["Service worker", sw], ["Connection", online ? "Online" : "Offline"], ["Notification permission", perm], ["Secure context", typeof window !== "undefined" && window.isSecureContext ? "Yes (HTTPS or localhost)" : "No — PWA features need HTTPS/localhost"]]} />
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm"><Wifi className="h-4 w-4 text-muted" />Install from the browser menu or the install banner (Chrome/Edge). On iOS use Share → Add to Home Screen.</p>
            <div className="flex flex-wrap gap-2">
              {perm === "default" && <Button variant="outline" onClick={async () => setPerm(await requestNotificationPermission())}>Enable browser notifications</Button>}
              <Button variant="outline" onClick={async () => { const r = await subscribeToPush(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY); setPushMsg(r.message + (r.payload ? " " + r.payload.endpoint.slice(0, 48) + "…" : "")); }}><ShieldCheck className="h-4 w-4" />Subscribe to push (needs backend)</Button>
              <Button variant="ghost" onClick={async () => setPushMsg((await unsubscribeFromPush()) ? "Unsubscribed." : "No active subscription.")}>Unsubscribe</Button>
            </div>
            {pushMsg && <Alert tone="info">{pushMsg}</Alert>}
            <Alert tone="warning" title="Push integration boundary">Background push needs a server that stores PushSubscriptions per user/device and sends Web Push (VAPID). The service worker already handles <code>push</code> and <code>notificationclick</code>. See README.</Alert>
          </div>
        </div>
      </Card>
      <Card className="lg:col-span-2"><div className="flex flex-wrap items-center gap-3 p-4 text-sm"><Download className="h-4 w-4 text-muted" />Documentation: <Link className="font-medium text-primary" href="/login">role chooser</Link><span className="text-muted">·</span><span className="text-muted">Implemented / simulated / backend-required lists are in README.md</span>{!admin && <Badge tone="neutral">read-only</Badge>}</div></Card>
      <span className="sr-only"><MoneyInput value={0} onChange={() => undefined} /></span>
    </div>
  );
}
