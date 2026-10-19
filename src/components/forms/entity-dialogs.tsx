"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from "react";
import { useRouter } from "next/navigation";
import { useDB } from "@/stores/db";
import { useUI } from "@/stores/ui";
import { FormDialog, type FieldDef } from "./form-dialog";
import { toast } from "@/components/ui/overlays";
import { clientSchema, departmentSchema, expenseSchema, inventorySchema, leadSchema, taskSchema, vendorSchema } from "@/lib/validation/schemas";
import { z } from "zod";
import { saveClient, saveLead } from "@/services/events";
import { saveExpense, saveInventoryItem, saveTask } from "@/services/ops";
import { saveVendor } from "@/services/vendors";
import { createQuotation } from "@/services/sales";
import { saveDepartment } from "@/services/admin";
import { todayISO, toISODate } from "@/lib/formatting";
import { addDays } from "date-fns";
import { useCurrentUser } from "@/hooks/use-app";

const opt = (arr: { id: string; name: string }[]) => arr.map((x) => ({ value: x.id, label: x.name }));

/** Global create/edit dialogs opened through `openCreate()` / `openEdit()`. */
export function QuickCreateHost() {
  const dialog = useUI((s) => s.dialog);
  const close = (o: boolean) => { if (!o) useUI.setState({ dialog: null }); };
  const db = useDB();
  const { user } = useCurrentUser();
  const router = useRouter();
  if (!dialog) return null;
  const { kind, id, preset } = dialog;
  const open = true;

  if (kind === "client") {
    const c = db.clients.find((x) => x.id === id);
    const fields: FieldDef[] = [
      { name: "type", label: "Client type", type: "select", required: true, options: [{ value: "individual", label: "Individual" }, { value: "corporate", label: "Corporate" }] },
      { name: "name", label: "Name", required: true }, { name: "company", label: "Company (corporate)" }, { name: "phone", label: "Phone", type: "tel", required: true },
      { name: "email", label: "Email", type: "email" }, { name: "gstin", label: "GSTIN (optional)" }, { name: "address", label: "Address", type: "textarea" }, { name: "preferences", label: "Preferences & requirements", type: "textarea" },
    ];
    return <FormDialog open={open} onOpenChange={close} title={c ? "Edit client" : "New client"} schema={clientSchema} fields={fields} submitLabel={c ? "Save changes" : "Create client"}
      defaultValues={{ type: c?.type ?? "individual", name: c?.name ?? "", company: c?.company ?? "", phone: c?.phone ?? "", email: c?.email ?? "", gstin: c?.gstin ?? "", address: c?.address ?? "", preferences: c?.preferences ?? "" }}
      onSubmit={(v: any) => { const nid = saveClient({ ...v, id: c?.id }); toast.success(c ? "Client updated" : "Client created", v.name); if (!c && preset?.redirect) router.push(`/clients/${nid}`); }} />;
  }
  if (kind === "lead") {
    const l = db.leads.find((x) => x.id === id);
    const fields: FieldDef[] = [
      { name: "name", label: "Contact name", required: true }, { name: "phone", label: "Phone", type: "tel" }, { name: "email", label: "Email", type: "email" },
      { name: "source", label: "Lead source", type: "select", required: true, options: ["Referral", "Instagram", "Website", "Google Ads", "Wedding fair", "Walk-in", "Repeat client"].map((s) => ({ value: s, label: s })) },
      { name: "eventTypeId", label: "Event type", type: "select", required: true, options: opt(db.eventTypes) }, { name: "expectedDate", label: "Expected date", type: "date", required: true },
      { name: "guests", label: "Guests", type: "number", min: 1 }, { name: "budget", label: "Budget", type: "money" }, { name: "followUpAt", label: "Follow-up on", type: "date" }, { name: "notes", label: "Requirements / notes", type: "textarea" },
    ];
    return <FormDialog open={open} onOpenChange={close} title={l ? "Edit lead" : "Capture lead"} schema={leadSchema} fields={fields} submitLabel={l ? "Save" : "Add lead"}
      defaultValues={{ name: l?.name ?? "", phone: l?.phone ?? "", email: l?.email ?? "", source: l?.source ?? "Referral", eventTypeId: l?.eventTypeId ?? db.eventTypes[0]?.id, expectedDate: l?.expectedDate ?? toISODate(addDays(new Date(), 60)), guests: l?.guests ?? 100, budget: l?.budget ?? 0, followUpAt: l?.followUpAt ?? "", notes: l?.notes ?? "" }}
      onSubmit={(v: any) => { saveLead({ ...v, id: l?.id, followUpAt: v.followUpAt || undefined }); toast.success(l ? "Lead updated" : "Lead captured", v.name); }} />;
  }
  if (kind === "task") {
    const t = db.tasks.find((x) => x.id === id);
    const fields: FieldDef[] = [
      { name: "title", label: "Title", required: true, span: 2 }, { name: "kind", label: "Type", type: "select", required: true, options: [{ value: "task", label: "Task" }, { value: "meeting", label: "Meeting / minutes" }, { value: "followup", label: "Follow-up" }] },
      { name: "priority", label: "Priority", type: "select", required: true, options: ["Low", "Medium", "High", "Critical"].map((p) => ({ value: p, label: p })) },
      { name: "status", label: "Status", type: "select", required: true, options: ["To Do", "Planning", "Ongoing", "Completed", "Cancelled", "Archived"].map((p) => ({ value: p, label: p })) },
      { name: "assigneeId", label: "Assignee", type: "select", required: true, options: opt(db.users) },
      { name: "eventId", label: "Event (optional)", type: "select", options: db.events.map((e) => ({ value: e.id, label: `${e.ref} · ${e.title}` })) },
      { name: "departmentId", label: "Department", type: "select", options: opt(db.departments.filter((d) => d.active)) },
      { name: "start", label: "Start date", type: "date" }, { name: "due", label: "Due date", type: "date" }, { name: "reminderDays", label: "Remind days before", type: "number", min: 0 },
      { name: "description", label: "Description", type: "textarea" },
    ];
    return <FormDialog open={open} onOpenChange={close} title={t ? "Edit task" : "New task"} schema={taskSchema} fields={fields} size="lg" submitLabel={t ? "Save task" : "Create task"}
      defaultValues={{ title: t?.title ?? "", kind: t?.kind ?? "task", priority: t?.priority ?? "Medium", status: t?.status ?? "To Do", assigneeId: t?.assigneeId ?? user.id, eventId: t?.eventId ?? (preset?.eventId as string) ?? "", departmentId: t?.departmentId ?? "", start: t?.start ?? "", due: t?.due ?? "", reminderDays: t?.reminderDays ?? 1, description: t?.description ?? "" }}
      onSubmit={(v: any) => { saveTask({ ...v, id: t?.id, eventId: v.eventId || undefined, departmentId: v.departmentId || undefined, start: v.start || undefined, due: v.due || undefined }); toast.success(t ? "Task updated" : "Task created", v.title); }} />;
  }
  if (kind === "expense") {
    const fields: FieldDef[] = [
      { name: "eventId", label: "Event (blank = company expense)", type: "select", options: db.events.map((e) => ({ value: e.id, label: `${e.ref} · ${e.title}` })), span: 2 },
      { name: "category", label: "Category", required: true }, { name: "payee", label: "Payee", required: true }, { name: "date", label: "Date", type: "date", required: true },
      { name: "amount", label: "Amount", type: "money", required: true }, { name: "method", label: "Payment method", type: "select", required: true, options: db.settings.paymentMethods.map((m) => ({ value: m, label: m })) },
      { name: "status", label: "Status", type: "select", required: true, options: ["Pending", "Approved", "Paid", "Rejected"].map((m) => ({ value: m, label: m })) },
      { name: "departmentId", label: "Department", type: "select", options: opt(db.departments.filter((d) => d.active)) }, { name: "pettyCash", label: "Petty cash", type: "checkbox" }, { name: "note", label: "Note", type: "textarea" },
    ];
    return <FormDialog open={open} onOpenChange={close} title="Record expense" schema={expenseSchema} fields={fields} submitLabel="Save expense"
      defaultValues={{ eventId: (preset?.eventId as string) ?? "", category: "", payee: "", date: todayISO(), amount: 0, method: "Cash", status: "Pending", departmentId: "", pettyCash: false, note: "" }}
      onSubmit={(v: any) => { saveExpense({ ...v, eventId: v.eventId || undefined, departmentId: v.departmentId || undefined }); toast.success("Expense recorded", "It now counts toward event cost and profit."); }} />;
  }
  if (kind === "quotation") {
    const schema = z.object({ eventId: z.string().min(1, "Select the event this quotation is for") });
    return <FormDialog open={open} onOpenChange={close} title="New client quotation" description="Quotations are always linked to an event." schema={schema} submitLabel="Create draft" size="sm"
      fields={[{ name: "eventId", label: "Event", type: "select", required: true, span: 2, options: db.events.filter((e) => !["Cancelled", "Completed"].includes(e.status)).map((e) => ({ value: e.id, label: `${e.ref} · ${e.title}` })) }]}
      defaultValues={{ eventId: (preset?.eventId as string) ?? "" }}
      onSubmit={(v: any) => { const qid = createQuotation(v.eventId); toast.success("Draft created"); router.push(`/quotations/${qid}`); }} />;
  }
  if (kind === "vendor") {
    const v = db.vendors.find((x) => x.id === id);
    const fields: FieldDef[] = [
      { name: "name", label: "Vendor name", required: true }, { name: "categoryId", label: "Category", type: "select", required: true, options: opt(db.settings.vendorCategories) },
      { name: "contactName", label: "Primary contact" }, { name: "phone", label: "Phone", type: "tel", required: true }, { name: "email", label: "Email", type: "email" },
      { name: "city", label: "City", required: true }, { name: "gstin", label: "GSTIN" }, { name: "status", label: "Status", type: "select", required: true, options: ["Active", "On Hold", "Archived"].map((s) => ({ value: s, label: s })) },
      { name: "paymentTerms", label: "Payment terms", type: "textarea" },
    ];
    return <FormDialog open={open} onOpenChange={close} title={v ? "Edit vendor" : "New vendor"} schema={vendorSchema} fields={fields} submitLabel={v ? "Save" : "Add vendor"}
      defaultValues={{ name: v?.name ?? "", categoryId: v?.categoryId ?? db.settings.vendorCategories[0]?.id, contactName: v?.contacts[0]?.name ?? "", phone: v?.phone ?? "", email: v?.email ?? "", city: v?.city ?? "", gstin: v?.gstin ?? "", status: v?.status ?? "Active", paymentTerms: v?.paymentTerms ?? "50% advance, balance on completion" }}
      onSubmit={(f: any) => {
        const contacts = f.contactName ? [{ id: v?.contacts[0]?.id ?? "vc_new", name: f.contactName, role: "Contact", phone: f.phone, email: f.email }, ...(v?.contacts.slice(1) ?? [])] : v?.contacts ?? [];
        const { contactName: _c, ...rest } = f; void _c;
        const nid = saveVendor({ ...rest, id: v?.id, contacts }); toast.success(v ? "Vendor updated" : "Vendor added", f.name); if (!v && preset?.redirect) router.push(`/vendors/${nid}`);
      }} />;
  }
  if (kind === "inventory") {
    const i = db.inventory.find((x) => x.id === id);
    const fields: FieldDef[] = [
      { name: "name", label: "Item name", required: true }, { name: "sku", label: "SKU", required: true }, { name: "category", label: "Category", required: true }, { name: "unit", label: "Unit", required: true },
      { name: "total", label: "Total quantity", type: "number", min: 0 }, { name: "reorderLevel", label: "Reorder level", type: "number", min: 0 }, { name: "location", label: "Storage location", required: true },
      { name: "rental", label: "Rental item (cost charged on dispatch)", type: "checkbox" }, { name: "rentalRate", label: "Rental rate / unit / day", type: "money" },
    ];
    return <FormDialog open={open} onOpenChange={close} title={i ? "Edit item" : "New inventory item"} schema={inventorySchema} fields={fields} submitLabel={i ? "Save" : "Add item"}
      defaultValues={{ name: i?.name ?? "", sku: i?.sku ?? "", category: i?.category ?? "General", unit: i?.unit ?? "pcs", total: i?.total ?? 0, reorderLevel: i?.reorderLevel ?? 0, location: i?.location ?? "Mumbai Warehouse A", rental: i?.rental ?? false, rentalRate: i?.rentalRate ?? 0 }}
      onSubmit={(v: any) => { saveInventoryItem({ ...v, id: i?.id }); toast.success(i ? "Item updated" : "Item added", v.name); }} />;
  }
  if (kind === "department") {
    const d = db.departments.find((x) => x.id === id);
    return <FormDialog open={open} onOpenChange={close} title={d ? "Edit department" : "New department"} schema={departmentSchema} submitLabel="Save department" size="sm"
      fields={[{ name: "name", label: "Name", required: true, span: 2 }, { name: "description", label: "Description", type: "textarea" }, { name: "color", label: "Colour", type: "text" }, { name: "active", label: "Active", type: "checkbox" }]}
      defaultValues={{ name: d?.name ?? "", description: d?.description ?? "", color: d?.color ?? "#64748b", active: d?.active ?? true }}
      onSubmit={(v: any) => { saveDepartment({ ...v, id: d?.id }); toast.success("Department saved", v.name); }} />;
  }
  return null;
}
