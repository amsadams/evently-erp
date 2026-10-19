"use client";
import { useRouter } from "next/navigation";
import { useDB } from "@/stores/db";
import { can as canFn } from "@/lib/permissions";
import type { PermissionCode } from "@/types";

export function useCurrentUser() {
  const users = useDB((s) => s.users);
  const roles = useDB((s) => s.roles);
  const id = useDB((s) => s.currentUserId);
  const user = users.find((u) => u.id === id) ?? users[0];
  const role = roles.find((r) => r.id === user?.roleId);
  return { user, role, can: (code: PermissionCode) => canFn(role, code) };
}

export function useLookups() {
  const clients = useDB((s) => s.clients);
  const users = useDB((s) => s.users);
  const departments = useDB((s) => s.departments);
  const vendors = useDB((s) => s.vendors);
  const events = useDB((s) => s.events);
  const eventTypes = useDB((s) => s.eventTypes);
  return {
    client: (id?: string) => clients.find((c) => c.id === id),
    user: (id?: string) => users.find((u) => u.id === id),
    dept: (id?: string) => departments.find((d) => d.id === id),
    vendor: (id?: string) => vendors.find((v) => v.id === id),
    event: (id?: string) => events.find((e) => e.id === id),
    eventType: (id?: string) => eventTypes.find((t) => t.id === id),
  };
}

export function useNav() {
  const router = useRouter();
  return { go: (href: string) => router.push(href) };
}
