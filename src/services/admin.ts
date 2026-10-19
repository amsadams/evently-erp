import type { CompanySettings, DB, Department } from "@/types";
import { uid } from "@/lib/utils";
import { mutate, resetDemoData } from "@/stores/db";
import { logAudit } from "./core";

type Coll = "departments" | "users" | "roles" | "eventTypes" | "catalogue" | "clients" | "vendors" | "leads";

/** Generic upsert for simple master-data collections. */
export function upsert<K extends Coll>(key: K, item: DB[K][number]) {
  mutate((d) => {
    const arr = d[key] as unknown as { id: string }[];
    const i = arr.findIndex((x) => x.id === (item as { id: string }).id);
    if (i >= 0) arr[i] = item as { id: string }; else arr.push(item as { id: string });
    logAudit(d, i >= 0 ? "Updated" : "Created", key, (item as { id: string }).id, `${key} record ${i >= 0 ? "updated" : "created"}`);
  });
}

export function saveDepartment(dep: Partial<Department> & { name: string }) {
  mutate((d) => {
    if (dep.id) { const x = d.departments.find((y) => y.id === dep.id); if (x) Object.assign(x, dep); }
    else d.departments.push({ id: uid("dp"), color: "#64748b", active: true, order: d.departments.length, description: "", ...dep });
    logAudit(d, "Saved", "Department", dep.id ?? "new", `Department ${dep.name} saved`);
  });
}

export function moveDepartment(id: string, dir: -1 | 1) {
  mutate((d) => {
    const list = [...d.departments].sort((a, b) => a.order - b.order);
    const i = list.findIndex((x) => x.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    list.forEach((x, k) => { const t = d.departments.find((y) => y.id === x.id)!; t.order = k; });
  });
}

export function updateSettings(patch: Partial<CompanySettings>) {
  mutate((d) => { Object.assign(d.settings, patch); logAudit(d, "Updated", "Settings", "company", "Company settings updated"); });
}

export function switchUser(userId: string) {
  mutate((d) => { d.currentUserId = userId; });
}

export function setRolePermissions(roleId: string, permissions: CompanySettings extends never ? never : import("@/types").PermissionCode[]) {
  mutate((d) => { const r = d.roles.find((x) => x.id === roleId); if (r) { r.permissions = permissions; logAudit(d, "Updated", "Role", roleId, `Permissions for ${r.name} updated`); } });
}

export function resetAll() {
  resetDemoData();
}
