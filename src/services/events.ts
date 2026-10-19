import { addDays, parseISO } from "date-fns";
import type { Client, EventFunction, EventRecord, EventStatus, Lead, LeadStage, Priority, Task, Communication, DepartmentPlan, ID } from "@/types";
import { uid } from "@/lib/utils";
import { toISODate } from "@/lib/formatting";
import { eventConflicts } from "@/lib/calculations/conflicts";
import { eventFinancials } from "@/lib/calculations/finance";
import { mutate, useDB } from "@/stores/db";
import { type D, logAudit, nextNumber, notify } from "./core";
import { generateSettlement } from "./documents";
import type { DB } from "@/types";

export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
export const ok = <T,>(data: T): Result<T> => ({ ok: true, data });
export const fail = (error: string): Result<never> => ({ ok: false, error });

/* ---------------- clients & leads ---------------- */
export function saveClient(input: Omit<Client, "id" | "createdAt" | "archived" | "contacts" | "tags"> & { id?: ID; contacts?: Client["contacts"]; tags?: string[] }): string {
  let id = input.id ?? "";
  mutate((d) => {
    if (input.id) {
      const c = d.clients.find((x) => x.id === input.id);
      if (c) { Object.assign(c, input); logAudit(d, "Updated", "Client", c.id, `Client ${c.name} updated`); }
    } else {
      id = uid("c");
      d.clients.unshift({ ...input, id, contacts: input.contacts ?? [], tags: input.tags ?? [], archived: false, createdAt: new Date().toISOString() });
      logAudit(d, "Created", "Client", id, `Client ${input.name} created`);
    }
  });
  return id;
}

export function archiveClient(id: string, archived: boolean) {
  mutate((d) => {
    const c = d.clients.find((x) => x.id === id);
    if (c) { c.archived = archived; logAudit(d, archived ? "Archived" : "Restored", "Client", id, `Client ${c.name} ${archived ? "archived" : "restored"}`); }
  });
}

export function addCommunication(input: Omit<Communication, "id" | "at" | "byUserId">) {
  mutate((d) => {
    d.communications.unshift({ ...input, id: uid("cm"), at: new Date().toISOString(), byUserId: d.currentUserId });
    if (input.followUpAt) {
      d.tasks.unshift(makeTask(d, { title: `Follow-up: ${input.summary.slice(0, 60)}`, kind: "followup", due: input.followUpAt, priority: "Medium", assigneeId: d.currentUserId }));
    }
  });
}

export function saveLead(input: Partial<Lead> & Pick<Lead, "name">): string {
  let id = input.id ?? "";
  mutate((d) => {
    if (input.id) {
      const l = d.leads.find((x) => x.id === input.id);
      if (l) Object.assign(l, input);
    } else {
      id = uid("l");
      d.leads.unshift({ phone: "", email: "", source: "Website", eventTypeId: d.eventTypes[0].id, expectedDate: toISODate(addDays(new Date(), 60)), budget: 0, guests: 100, stage: "New", notes: "", createdAt: new Date().toISOString(), ...input, id } as Lead);
      logAudit(d, "Created", "Lead", id, `Lead ${input.name} captured`);
    }
  });
  return id;
}

export function moveLead(id: string, stage: LeadStage) {
  mutate((d) => {
    const l = d.leads.find((x) => x.id === id);
    if (!l || l.stage === stage) return;
    l.stage = stage;
    logAudit(d, "Moved", "Lead", id, `Lead ${l.name} moved to ${stage}`);
    if (stage === "Won") notify(d, { type: "event", severity: "success", title: `Lead won: ${l.name}`, body: "Convert it to a client and event to start planning.", link: "/leads", dedupeKey: `lead-won:${id}` });
  });
}

/** Workflow 1, step 1–2: create/select client from the lead. Returns client id. */
export function convertLeadToClient(leadId: string): string | null {
  let cid: string | null = null;
  mutate((d) => {
    const l = d.leads.find((x) => x.id === leadId);
    if (!l) return;
    if (l.clientId && d.clients.some((c) => c.id === l.clientId)) { cid = l.clientId; return; }
    cid = uid("c");
    d.clients.unshift({ id: cid, type: "individual", name: l.name, email: l.email, phone: l.phone, address: "", contacts: [], preferences: l.notes, tags: ["From lead"], archived: false, createdAt: new Date().toISOString() });
    l.clientId = cid;
    if (l.stage === "New" || l.stage === "Contacted") l.stage = "Proposal";
    logAudit(d, "Converted", "Lead", leadId, `Lead ${l.name} converted to client`);
  });
  return cid;
}

/* ---------------- events ---------------- */
function makeTask(d: D, p: Partial<Task> & Pick<Task, "title">): Task {
  return {
    id: uid("t"), description: "", status: "To Do", priority: "Medium", assigneeId: d.currentUserId, dependsOn: [], checklist: [], comments: [], attachments: [],
    history: [{ at: new Date().toISOString(), text: "Task created" }], kind: "task", createdAt: new Date().toISOString(), ...p,
  };
}

export interface NewEventInput {
  title: string; clientId: string; typeId: string; coordinatorId: string; venue: string; city: string; startDate: string; endDate: string;
  startTime: string; endTime: string; guests: number; budget: number; priority: Priority; status: EventStatus; description: string; logistics?: string;
  functions?: Omit<EventFunction, "id">[]; plans?: DepartmentPlan[]; applyTemplate?: boolean; leadId?: string;
}

export function createEvent(input: NewEventInput): string {
  let id = "";
  mutate((d) => {
    id = uid("e");
    const type = d.eventTypes.find((t) => t.id === input.typeId);
    const ref = nextNumber(d, "event");
    const functions: EventFunction[] = (input.functions?.length ? input.functions : (type?.defaultFunctions ?? []).map((name) => ({ name, date: input.startDate, startTime: input.startTime, endTime: input.endTime, venue: input.venue, guests: input.guests })))
      .map((f) => ({ ...f, id: uid("f") }));
    const apply = input.applyTemplate !== false;
    const ev: EventRecord = {
      id, ref, title: input.title, clientId: input.clientId, typeId: input.typeId, status: input.status, priority: input.priority, coordinatorId: input.coordinatorId,
      venue: input.venue, city: input.city, startDate: input.startDate, endDate: input.endDate, startTime: input.startTime, endTime: input.endTime, guests: input.guests,
      budget: input.budget, description: input.description, logistics: input.logistics ?? "", functions,
      milestones: apply ? (type?.milestoneTemplate ?? []).map((m) => ({ id: uid("m"), title: m.title, date: toISODate(addDays(parseISO(input.startDate), m.offsetDays)), done: false })) : [],
      plans: input.plans ?? (type?.defaultDepartmentIds ?? []).map((departmentId) => ({ departmentId, budget: 0, requirements: "", notes: "" })), createdAt: new Date().toISOString(),
    };
    d.events.unshift(ev);
    if (apply && type) {
      for (const t of type.taskTemplate) {
        d.tasks.unshift(makeTask(d, { title: t.title, eventId: id, departmentId: t.departmentId, assigneeId: input.coordinatorId, due: toISODate(addDays(parseISO(input.startDate), t.offsetDays)), priority: t.offsetDays > -7 ? "High" : "Medium" }));
      }
    }
    if (input.leadId) {
      const l = d.leads.find((x) => x.id === input.leadId);
      if (l) { l.eventId = id; l.clientId = input.clientId; }
    }
    logAudit(d, "Created", "Event", id, `Event ${ref} "${input.title}" created`, id);
    notify(d, { type: "assignment", severity: "info", title: `New event assigned: ${ref}`, body: `${input.title} was assigned to ${d.users.find((u) => u.id === input.coordinatorId)?.name ?? "coordinator"}.`, link: `/events/${id}`, dedupeKey: `assign:${id}` });
    for (const c of eventConflicts(d as unknown as DB, { ...ev })) {
      notify(d, { type: "conflict", severity: c.severity === "critical" ? "critical" : "warning", title: `Scheduling conflict on ${ref}`, body: c.message, link: `/events/${id}`, dedupeKey: `conflict:${id}:${c.kind}:${c.eventId}` });
    }
  });
  return id;
}

export function updateEvent(id: string, patch: Partial<EventRecord>) {
  mutate((d) => {
    const e = d.events.find((x) => x.id === id);
    if (!e) return;
    const coordChanged = patch.coordinatorId && patch.coordinatorId !== e.coordinatorId;
    Object.assign(e, patch);
    logAudit(d, "Updated", "Event", id, `Event ${e.ref} details updated`, id);
    if (coordChanged) notify(d, { type: "assignment", severity: "info", title: `Coordinator changed on ${e.ref}`, body: `Now assigned to ${d.users.find((u) => u.id === e.coordinatorId)?.name}.`, link: `/events/${id}` });
  });
}

export function changeEventStatus(id: string, status: EventStatus): Result {
  let err = "";
  mutate((d) => {
    const e = d.events.find((x) => x.id === id);
    if (!e) { err = "Event not found"; return; }
    if (e.status === status) return;
    const allowed = d.settings.statusFlow[e.status] ?? [];
    if (!allowed.includes(status)) { err = `Transition ${e.status} → ${status} is not allowed by the workflow configuration.`; return; }
    const conflicts = status === "Confirmed" ? eventConflicts(d as unknown as DB, { ...e, status }).filter((c) => c.severity === "critical") : [];
    if (conflicts.length) { err = `Cannot confirm: ${conflicts[0].message} Resolve the clash first.`; return; }
    const from = e.status;
    e.status = status;
    logAudit(d, "Status", "Event", id, `Event ${e.ref} status ${from} → ${status}`, id);
    notify(d, { type: "event", severity: status === "Cancelled" ? "warning" : "info", title: `${e.ref} is now ${status}`, body: `${e.title} moved from ${from} to ${status}.`, link: `/events/${id}` });
  });
  return err ? fail(err) : ok(undefined);
}

export function toggleMilestone(eventId: string, milestoneId: string) {
  mutate((d) => {
    const e = d.events.find((x) => x.id === eventId);
    const m = e?.milestones.find((x) => x.id === milestoneId);
    if (e && m) { m.done = !m.done; logAudit(d, "Milestone", "Event", eventId, `Milestone "${m.title}" ${m.done ? "completed" : "reopened"}`, eventId); }
  });
}

export function addMilestone(eventId: string, title: string, date: string) {
  mutate((d) => { d.events.find((x) => x.id === eventId)?.milestones.push({ id: uid("m"), title, date, done: false }); });
}

export function saveFunction(eventId: string, fn: Omit<EventFunction, "id"> & { id?: string }) {
  mutate((d) => {
    const e = d.events.find((x) => x.id === eventId); if (!e) return;
    if (fn.id) { const i = e.functions.findIndex((f) => f.id === fn.id); if (i >= 0) e.functions[i] = fn as EventFunction; }
    else e.functions.push({ ...fn, id: uid("f") });
    // keep the event range wide enough to include every function
    const dates = e.functions.map((f) => f.date).sort();
    if (dates.length) { if (dates[0] < e.startDate) e.startDate = dates[0]; if (dates[dates.length - 1] > e.endDate) e.endDate = dates[dates.length - 1]; }
  });
}
export function removeFunction(eventId: string, fnId: string) {
  mutate((d) => { const e = d.events.find((x) => x.id === eventId); if (e) e.functions = e.functions.filter((f) => f.id !== fnId); });
}

export function saveDepartmentPlan(eventId: string, plan: DepartmentPlan) {
  mutate((d) => {
    const e = d.events.find((x) => x.id === eventId); if (!e) return;
    const i = e.plans.findIndex((p) => p.departmentId === plan.departmentId);
    if (i >= 0) e.plans[i] = plan; else e.plans.push(plan);
  });
}
export function removeDepartmentPlan(eventId: string, departmentId: string) {
  mutate((d) => { const e = d.events.find((x) => x.id === eventId); if (e) e.plans = e.plans.filter((p) => p.departmentId !== departmentId); });
}

/** Workflow 6: financial closure. Returns blocking issues unless the caller acknowledges them. */
export function closureChecks(eventId: string): string[] {
  const db = useDB.getState();
  const e = db.events.find((x) => x.id === eventId); if (!e) return [];
  const f = eventFinancials(db, e);
  const issues: string[] = [];
  if (f.receivable > 0) issues.push(`Client receivable outstanding: ${f.receivable / 100}`);
  if (f.contractOutstanding > 0 && f.basis !== "Event budget" && f.basis !== "None") issues.push("Contract value not fully collected");
  if (f.vendorPayable > 0) issues.push("Approved vendor bills are not fully paid");
  const openAssign = db.assignments.filter((a) => a.eventId === eventId && !["Completed", "Cancelled"].includes(a.status) && a.status !== "Draft");
  if (openAssign.length) issues.push(`${openAssign.length} vendor agreement(s) not completed`);
  const openTasks = db.tasks.filter((t) => t.eventId === eventId && !["Completed", "Cancelled", "Archived"].includes(t.status));
  if (openTasks.length) issues.push(`${openTasks.length} task(s) still open`);
  const allocs = db.allocations.filter((a) => a.eventId === eventId && a.dispatched > a.returned + a.damaged + a.missing);
  if (allocs.length) issues.push(`${allocs.length} stock allocation(s) not yet returned`);
  if (db.expenses.some((x) => x.eventId === eventId && x.status === "Pending")) issues.push("Pending expenses await approval");
  return issues;
}

export function closeEvent(eventId: string, note: string) {
  mutate((d) => {
    const e = d.events.find((x) => x.id === eventId); if (!e) return;
    e.status = "Completed";
    e.closure = { closedAt: new Date().toISOString(), byUserId: d.currentUserId, note };
    logAudit(d, "Closed", "Event", eventId, `Event ${e.ref} financially closed. ${note}`, eventId);
    notify(d, { type: "event", severity: "success", title: `${e.ref} closed`, body: "Settlement statement generated. Review profitability in Finance.", link: `/events/${eventId}` });
  });
  generateSettlement(eventId);
}

export function reopenEvent(eventId: string) {
  mutate((d) => {
    const e = d.events.find((x) => x.id === eventId); if (!e) return;
    delete e.closure; e.status = "In Progress";
    logAudit(d, "Reopened", "Event", eventId, `Event ${e.ref} reopened`, eventId);
  });
}
