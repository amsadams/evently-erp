import type { PermissionCode, Role } from "@/types";

export function can(role: Role | undefined, code: PermissionCode): boolean {
  return !!role?.permissions.includes(code);
}

/** Route → permission required to see it (UI visibility only; real authorization belongs on the server). */
export const ROUTE_PERMISSIONS: Record<string, PermissionCode | undefined> = {
  "/dashboard": undefined,
  "/clients": "clients.read",
  "/leads": "clients.read",
  "/events": "events.read",
  "/vendors": "vendors.read",
  "/departments": "events.read",
  "/quotations": "quotes.read",
  "/invoices": "finance.read",
  "/tasks": undefined,
  "/calendar": undefined,
  "/finance": "finance.read",
  "/inventory": "events.read",
  "/documents": undefined,
  "/reports": "reports.read",
  "/notifications": undefined,
  "/settings": undefined,
};
