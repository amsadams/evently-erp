"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Check, Plus, Trash2 } from "lucide-react";
import { addDays } from "date-fns";
import { useDB } from "@/stores/db";
import { useCurrentUser } from "@/hooks/use-app";
import { openCreate } from "@/stores/ui";
import { createEvent } from "@/services/events";
import { eventBasicsSchema } from "@/lib/validation/schemas";
import { eventConflicts } from "@/lib/calculations/conflicts";
import { toISODate } from "@/lib/formatting";
import { uid } from "@/lib/utils";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { Alert, Button, Card, Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/primitives";
import { toast } from "@/components/ui/overlays";
import { cn } from "@/lib/utils";
import type { DB } from "@/types";

const STEPS = ["Basics", "Schedule & venue", "Functions & departments", "Review"];
const STEP_FIELDS: string[][] = [["title", "clientId", "typeId", "coordinatorId", "priority", "status"], ["venue", "city", "startDate", "endDate", "startTime", "endTime", "guests", "budget"], [], []];

export function EventWizard() {
  const db = useDB() as unknown as DB;
  const router = useRouter();
  const params = useSearchParams();
  const { user, can } = useCurrentUser();
  const [step, setStep] = React.useState(0);
  const [fns, setFns] = React.useState<{ id: string; name: string; date: string; startTime: string; endTime: string; venue: string; guests: number }[]>([]);
  const [deptIds, setDeptIds] = React.useState<string[]>([]);
  const [template, setTemplate] = React.useState(true);
  const [fnsTouched, setFnsTouched] = React.useState(false);
  const [confirmOverride, setConfirmOverride] = React.useState(false);

  const form = useForm<any>({
    resolver: zodResolver(eventBasicsSchema as any), mode: "onTouched",
    defaultValues: {
      title: "", clientId: params.get("client") ?? "", typeId: db.eventTypes[0]?.id ?? "", coordinatorId: user?.id ?? "", priority: "Medium", status: "Planning", venue: "", city: "",
      startDate: toISODate(addDays(new Date(), 45)), endDate: toISODate(addDays(new Date(), 45)), startTime: "17:00", endTime: "23:00", guests: 150, budget: 0, description: "", logistics: "",
    },
  });
  const v = form.watch();
  const type = db.eventTypes.find((t) => t.id === v.typeId);
  const err = (n: string) => (form.formState.errors as any)[n]?.message as string | undefined;

  // Template: when the event type changes, load its default functions and departments (unless the user edited them).
  React.useEffect(() => {
    if (!type || fnsTouched) return;
    setFns(type.defaultFunctions.map((name) => ({ id: uid("f"), name, date: v.startDate, startTime: v.startTime, endTime: v.endTime, venue: v.venue, guests: v.guests })));
    setDeptIds(type.defaultDepartmentIds);
  }, [v.typeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const conflicts = React.useMemo(() => (v.startDate && v.endDate ? eventConflicts(db, { venue: v.venue, startDate: v.startDate, endDate: v.endDate, coordinatorId: v.coordinatorId, status: v.status }) : []), [db, v.venue, v.startDate, v.endDate, v.coordinatorId, v.status]);

  if (!can("events.write")) return <Alert tone="warning" title="Read-only role">Your current role cannot create events. Switch role from the profile menu.</Alert>;

  const next = async () => {
    const ok = STEP_FIELDS[step].length ? await form.trigger(STEP_FIELDS[step] as any) : true;
    if (ok) setStep((s) => s + 1);
  };
  const submit = form.handleSubmit((vals: any) => {
    if (conflicts.some((c) => c.severity === "critical") && !confirmOverride) return;
    const id = createEvent({
      ...vals, description: vals.description ?? "", logistics: vals.logistics ?? "", applyTemplate: template, leadId: params.get("lead") ?? undefined,
      functions: fns.map((f) => ({ name: f.name, date: f.date, startTime: f.startTime, endTime: f.endTime, guests: f.guests, venue: f.venue || vals.venue })), plans: deptIds.map((departmentId) => ({ departmentId, budget: 0, requirements: "", notes: "" })),
    });
    toast.success("Event created", conflicts.length ? "Scheduling conflicts were flagged in notifications." : "Template tasks and milestones were generated.");
    router.push(`/events/${id}`);
  });

  return (
    <>
      <BackLink href="/events">Events</BackLink>
      <PageHeader title="New event" description="A guided setup that creates the booking record, functions, department plan and template tasks." />
      <ol className="mb-5 flex flex-wrap gap-2" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium", i === step ? "border-primary bg-primary-soft text-primary" : i < step ? "border-success/40 bg-success-soft text-success" : "border-line bg-surface text-muted")} aria-current={i === step ? "step" : undefined}>
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-current/10 text-[10px]">{i < step ? <Check className="h-3 w-3" /> : i + 1}</span>{s}
          </li>
        ))}
      </ol>

      <Card className="p-5">
        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Event title" required error={err("title")} className="sm:col-span-2"><Input placeholder="e.g. Mehta–Rao Wedding" {...form.register("title")} /></Field>
            <Field label="Client" required error={err("clientId")} hint="Don't see them? Create the client first.">
              <div className="flex gap-2"><Select {...form.register("clientId")}><option value="">Select client…</option>{db.clients.filter((c) => !c.archived).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
                <Button variant="outline" size="icon" aria-label="Create client" onClick={() => openCreate("client")}><Plus className="h-4 w-4" /></Button></div>
            </Field>
            <Field label="Event type / template" required error={err("typeId")} hint={type ? `Template: ${type.defaultFunctions.join(", ")}` : undefined}><Select {...form.register("typeId")}>{db.eventTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
            <Field label="Coordinator" required error={err("coordinatorId")}><Select {...form.register("coordinatorId")}>{db.users.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
            <Field label="Priority"><Select {...form.register("priority")}>{["Low", "Medium", "High", "Critical"].map((p) => <option key={p}>{p}</option>)}</Select></Field>
            <Field label="Initial status"><Select {...form.register("status")}>{["Enquiry", "Planning", "Confirmed", "On Hold"].map((p) => <option key={p}>{p}</option>)}</Select></Field>
            <Field label="Brief / description" className="sm:col-span-2"><Textarea {...form.register("description")} placeholder="Theme, objectives, special requirements…" /></Field>
          </div>
        )}
        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Venue" required error={err("venue")}><Input list="venues" {...form.register("venue")} placeholder="Venue name" /></Field>
            <datalist id="venues">{[...new Set(db.events.map((e) => e.venue))].map((x) => <option key={x} value={x} />)}</datalist>
            <Field label="City" required error={err("city")}><Input {...form.register("city")} /></Field>
            <Field label="Start date" required error={err("startDate")}><Input type="date" {...form.register("startDate")} /></Field>
            <Field label="End date" required error={err("endDate")}><Input type="date" {...form.register("endDate")} /></Field>
            <Field label="Start time" error={err("startTime")}><Input type="time" {...form.register("startTime")} /></Field>
            <Field label="End time" error={err("endTime")}><Input type="time" {...form.register("endTime")} /></Field>
            <Field label="Expected guests" required error={err("guests")}><Input type="number" min={1} {...form.register("guests", { valueAsNumber: true })} /></Field>
            <Field label="Budget" error={err("budget")}><Controller control={form.control} name="budget" render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} />} /></Field>
            <Field label="Logistics notes" className="sm:col-span-2"><Textarea {...form.register("logistics")} placeholder="Access, load-in windows, guest transport…" /></Field>
            {conflicts.length > 0 && (
              <div className="space-y-2 sm:col-span-2" role="alert">
                {conflicts.map((c, i) => <Alert key={i} tone={c.severity === "critical" ? "danger" : "warning"} title={c.severity === "critical" ? "Venue clash with a confirmed booking" : "Scheduling conflict"}>{c.message}</Alert>)}
              </div>
            )}
          </div>
        )}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Functions / sub-events</h3>
                <Button variant="outline" size="sm" onClick={() => { setFnsTouched(true); setFns((f) => [...f, { id: uid("f"), name: "New function", date: v.startDate, startTime: v.startTime, endTime: v.endTime, venue: v.venue, guests: v.guests }]); }}><Plus className="h-3.5 w-3.5" />Add function</Button></div>
              <div className="space-y-2">
                {fns.map((f, i) => (
                  <div key={f.id} className="grid grid-cols-2 gap-2 rounded-lg border border-line p-3 sm:grid-cols-[1.4fr_1fr_.7fr_.7fr_.6fr_auto]">
                    <Input aria-label="Function name" value={f.name} onChange={(e) => { setFnsTouched(true); setFns((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y))); }} />
                    <Input aria-label="Date" type="date" value={f.date} min={v.startDate} max={v.endDate} onChange={(e) => setFns((x) => x.map((y, j) => (j === i ? { ...y, date: e.target.value } : y)))} />
                    <Input aria-label="Start" type="time" value={f.startTime} onChange={(e) => setFns((x) => x.map((y, j) => (j === i ? { ...y, startTime: e.target.value } : y)))} />
                    <Input aria-label="End" type="time" value={f.endTime} onChange={(e) => setFns((x) => x.map((y, j) => (j === i ? { ...y, endTime: e.target.value } : y)))} />
                    <Input aria-label="Guests" type="number" value={f.guests} onChange={(e) => setFns((x) => x.map((y, j) => (j === i ? { ...y, guests: Number(e.target.value) } : y)))} />
                    <Button variant="ghost" size="icon" aria-label="Remove function" onClick={() => { setFnsTouched(true); setFns((x) => x.filter((_, j) => j !== i)); }}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                {fns.length === 0 && <p className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-muted">Single-session event — no sub-functions.</p>}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">Departments involved</h3>
              <div className="flex flex-wrap gap-2">
                {db.departments.filter((d) => d.active && d.id !== "dp0").sort((a, b) => a.order - b.order).map((d) => {
                  const on = deptIds.includes(d.id);
                  return <button key={d.id} type="button" aria-pressed={on} onClick={() => setDeptIds((x) => (on ? x.filter((i) => i !== d.id) : [...x, d.id]))} className={cn("rounded-full border px-3 py-1.5 text-xs font-medium", on ? "border-primary bg-primary-soft text-primary" : "border-line text-muted hover:bg-subtle")}>{on && "✓ "}{d.name}</button>;
                })}
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={template} onChange={(e) => setTemplate(e.target.checked)} />
              <span>Generate template tasks and milestones<span className="block text-xs text-muted">{type?.taskTemplate.length ?? 0} tasks and {type?.milestoneTemplate.length ?? 0} milestones for “{type?.name}”, scheduled relative to the event date.</span></span></label>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-4 text-sm">
            <dl className="grid gap-3 sm:grid-cols-2">
              {[["Title", v.title], ["Client", db.clients.find((c) => c.id === v.clientId)?.name], ["Type", type?.name], ["Coordinator", db.users.find((u) => u.id === v.coordinatorId)?.name], ["Venue", `${v.venue}, ${v.city}`], ["Dates", `${v.startDate} → ${v.endDate}`], ["Guests", v.guests], ["Functions", fns.map((f) => f.name).join(", ") || "None"], ["Departments", deptIds.map((i) => db.departments.find((d) => d.id === i)?.name).join(", ") || "None"]].map(([k, val]) => (
                <div key={String(k)}><dt className="text-xs text-muted">{k}</dt><dd className="font-medium">{String(val ?? "—")}</dd></div>
              ))}
            </dl>
            {conflicts.length > 0 && (
              <Alert tone={conflicts.some((c) => c.severity === "critical") ? "danger" : "warning"} title={`${conflicts.length} conflict${conflicts.length > 1 ? "s" : ""} detected`}>
                <ul className="list-disc pl-4">{conflicts.map((c, i) => <li key={i}>{c.message}</li>)}</ul>
                {conflicts.some((c) => c.severity === "critical") && <label className="mt-2 flex items-center gap-2 font-medium"><input type="checkbox" className="accent-danger" checked={confirmOverride} onChange={(e) => setConfirmOverride(e.target.checked)} />I understand and want to proceed (manager override)</label>}
              </Alert>
            )}
          </div>
        )}
        <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
          <Button variant="outline" onClick={() => (step === 0 ? router.push("/events") : setStep((s) => s - 1))}>{step === 0 ? "Cancel" : "Back"}</Button>
          {step < STEPS.length - 1 ? <Button onClick={next}>Continue</Button> : <Button onClick={submit} disabled={conflicts.some((c) => c.severity === "critical") && !confirmOverride}>{conflicts.length ? <AlertTriangle className="h-4 w-4" /> : <Check className="h-4 w-4" />}Create event</Button>}
        </div>
      </Card>
    </>
  );
}
