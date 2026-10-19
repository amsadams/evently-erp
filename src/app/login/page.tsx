"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useDB, hydrateDB } from "@/stores/db";
import { switchUser } from "@/services/admin";
import { Alert, Avatar, Card } from "@/components/ui/primitives";

export default function LoginPage() {
  const router = useRouter();
  const users = useDB((s) => s.users);
  const roles = useDB((s) => s.roles);
  const hydrated = useDB((s) => s.hydrated);
  React.useEffect(() => { hydrateDB(); }, []);
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-xl font-bold text-white">E</span>
        <h1 className="text-2xl font-semibold">Sign in to Evently</h1>
        <p className="mt-1 text-sm text-muted">Demo environment — choose a role to explore. No password is required and no account is created.</p>
      </div>
      <Alert tone="info" className="mb-4">Real authentication (sessions, MFA, server-side role and record-scope checks) belongs to the backend phase. This screen only simulates role switching.</Alert>
      <Card className="divide-y divide-line">
        {hydrated && users.filter((u) => u.active).map((u) => (
          <button key={u.id} onClick={() => { switchUser(u.id); router.push("/dashboard"); }} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-canvas">
            <Avatar name={u.name} className="h-9 w-9" />
            <span className="flex-1"><span className="block text-sm font-medium">{u.name}</span><span className="block text-xs text-muted">{roles.find((r) => r.id === u.roleId)?.name} · {u.email}</span></span>
            <span className="text-xs font-medium text-primary">Continue →</span>
          </button>
        ))}
      </Card>
    </main>
  );
}
