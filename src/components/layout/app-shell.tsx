"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell, ChevronsLeft, ChevronsRight, Download, Menu, Plus, RefreshCw, Search, UserCog, WifiOff, X, Briefcase, Users, Funnel, CheckSquare, Wallet, FileSignature, Store, Boxes, MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDB, hydrateDB } from "@/stores/db";
import { useUI, openCreate } from "@/stores/ui";
import { can, ROUTE_PERMISSIONS } from "@/lib/permissions";
import { syncAlerts } from "@/services/ops";
import { switchUser } from "@/services/admin";
import { applyUpdate, registerServiceWorker, showLocalNotification, notificationPermission, type BeforeInstallPromptEvent } from "@/lib/pwa/client";
import { Avatar, Badge, Button, EmptyState, Skeleton } from "@/components/ui/primitives";
import { ActionMenu, ConfirmHost, Toaster, toast } from "@/components/ui/overlays";
import { Sheet } from "@/components/ui/overlays";
import { CommandMenu } from "./command-menu";
import { NotificationList } from "./notification-list";
import { QuickCreateHost } from "@/components/forms/entity-dialogs";
import { MOBILE_PRIMARY, NAV } from "./nav";
import type { AppNotification } from "@/types";

function useHydrated() {
  const hydrated = useDB((s) => s.hydrated);
  React.useEffect(() => { hydrateDB(); }, []);
  return hydrated;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  const pathname = usePathname();
  const router = useRouter();
  const collapsed = useUI((s) => s.sidebarCollapsed);
  const moreOpen = useUI((s) => s.moreOpen);
  const unread = useDB((s) => s.notifications.filter((n) => !n.read).length);
  const users = useDB((s) => s.users);
  const roles = useDB((s) => s.roles);
  const currentUserId = useDB((s) => s.currentUserId);
  const user = users.find((u) => u.id === currentUserId) ?? users[0];
  const role = roles.find((r) => r.id === user?.roleId);

  // Alert engine: run once hydrated and after data changes (debounced). Dedupe keys make this idempotent.
  React.useEffect(() => {
    if (!hydrated) return;
    syncAlerts();
    let t: ReturnType<typeof setTimeout>;
    const unsub = useDB.subscribe((s, prev) => {
      if (s.notifications !== prev.notifications && s.hydrated) return; // avoid loops on notification-only changes
      clearTimeout(t); t = setTimeout(syncAlerts, 500);
    });
    return () => { unsub(); clearTimeout(t); };
  }, [hydrated]);

  // Browser notifications for new in-app alerts (only if the user granted permission).
  React.useEffect(() => {
    const h = (e: Event) => {
      const n = (e as CustomEvent<AppNotification>).detail;
      if (notificationPermission() === "granted" && document.visibilityState !== "visible") void showLocalNotification(n.title, n.body, n.link);
    };
    window.addEventListener("erp:notification", h);
    return () => window.removeEventListener("erp:notification", h);
  }, []);

  const allowed = React.useMemo(() => {
    const seg = "/" + (pathname.split("/")[1] ?? "");
    const need = ROUTE_PERMISSIONS[seg];
    return !need || can(role, need);
  }, [pathname, role]);

  if (!hydrated) return <ShellSkeleton />;

  return (
    <div className="flex min-h-screen">
      <Sidebar collapsed={collapsed} pathname={pathname} role={role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <PwaBanners />
        <Topbar pathname={pathname} unread={unread} userName={user?.name ?? ""} roleName={role?.name ?? ""} />
        <main id="main" className="min-w-0 flex-1 px-4 pb-28 pt-5 md:px-6 md:pb-10">
          {allowed ? <div className="mx-auto max-w-[1400px] animate-fade">{children}</div> : (
            <EmptyState title="You don't have access to this module" description={`The ${role?.name} role cannot view this area. Switch role from the profile menu to explore it (demo only; real authorization is enforced by the backend).`}
              action={<Button onClick={() => router.push("/dashboard")}>Back to dashboard</Button>} />
          )}
        </main>
      </div>
      <MobileNav pathname={pathname} unread={unread} />
      <MoreSheet open={moreOpen} role={role} pathname={pathname} />
      <CommandMenu />
      <NotificationSheet />
      <QuickCreateHost />
      <ConfirmHost />
      <Toaster />
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-screen">
      <div className="hidden w-60 border-r border-line bg-surface p-4 md:block"><Skeleton className="mb-6 h-8 w-32" />{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="mb-2 h-8 w-full" />)}</div>
      <div className="flex-1 p-6"><Skeleton className="mb-6 h-9 w-64" /><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="mt-4 h-72" /></div>
    </div>
  );
}

function Sidebar({ collapsed, pathname, role }: { collapsed: boolean; pathname: string; role?: { permissions: string[] } }) {
  const settings = useDB((s) => s.settings);
  return (
    <aside className={cn("sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-surface transition-[width] md:flex", collapsed ? "w-[68px]" : "w-60")} aria-label="Primary">
      <div className="flex h-14 items-center gap-2.5 border-b border-line px-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">{settings.logoText.slice(0, 1)}</span>
        {!collapsed && <div className="min-w-0"><p className="truncate text-sm font-semibold leading-tight">{settings.name}</p><p className="text-[10px] text-muted">Event ERP · demo</p></div>}
      </div>
      <nav className="scroll-thin flex-1 overflow-y-auto px-2.5 py-3">
        {NAV.map((g) => {
          const items = g.items.filter((i) => { const need = ROUTE_PERMISSIONS[i.href]; return !need || (role?.permissions as string[] | undefined)?.includes(need); });
          if (!items.length) return null;
          return (
            <div key={g.label} className="mb-3">
              {!collapsed && <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted">{g.label}</p>}
              {items.map((i) => {
                const active = pathname === i.href || pathname.startsWith(i.href + "/");
                return (
                  <Link key={i.href} href={i.href} title={collapsed ? i.label : undefined} aria-current={active ? "page" : undefined}
                    className={cn("mb-0.5 flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors", active ? "bg-primary-soft text-primary" : "text-muted hover:bg-subtle hover:text-ink", collapsed && "justify-center px-0")}>
                    <i.icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                    {!collapsed && <span className="truncate">{i.label}</span>}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
      <button onClick={() => useUI.getState().setSidebar(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="flex h-11 items-center justify-center gap-2 border-t border-line text-xs text-muted hover:bg-subtle hover:text-ink">
        {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" />Collapse</>}
      </button>
    </aside>
  );
}

function useCrumbs(pathname: string) {
  const db = useDB();
  const parts = pathname.split("/").filter(Boolean);
  const out: { label: string; href: string }[] = [];
  let href = "";
  parts.forEach((p, i) => {
    href += "/" + p;
    let label = p.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
    if (i > 0) {
      const parent = parts[0];
      if (parent === "events") label = db.events.find((e) => e.id === p)?.ref ?? (p === "new" ? "New event" : label);
      if (parent === "clients") label = db.clients.find((c) => c.id === p)?.name ?? label;
      if (parent === "vendors") label = db.vendors.find((v) => v.id === p)?.name ?? label;
      if (parent === "quotations") label = db.quotations.find((q) => q.id === p)?.ref ?? label;
    }
    if (p === "procurement") label = "Work orders";
    out.push({ label, href });
  });
  return out;
}

function Topbar({ pathname, unread, userName, roleName }: { pathname: string; unread: number; userName: string; roleName: string }) {
  const crumbs = useCrumbs(pathname);
  const users = useDB((s) => s.users);
  const roles = useDB((s) => s.roles);
  const currentUserId = useDB((s) => s.currentUserId);
  const router = useRouter();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/90 px-3 backdrop-blur md:px-6">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded focus:bg-primary focus:px-3 focus:py-1.5 focus:text-white">Skip to content</a>
      <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-xs text-muted lg:flex">
        <Link href="/dashboard" className="hover:text-ink">Home</Link>
        {crumbs.map((c, i) => (
          <React.Fragment key={c.href}>
            <span aria-hidden>/</span>
            {i === crumbs.length - 1 ? <span className="max-w-[16rem] truncate font-medium text-ink" aria-current="page">{c.label}</span> : <Link href={c.href} className="hover:text-ink">{c.label}</Link>}
          </React.Fragment>
        ))}
      </nav>
      <button onClick={() => useUI.setState({ commandOpen: true })} aria-label="Open global search"
        className="mx-auto flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-line bg-canvas px-3 text-sm text-muted hover:border-[#cfd4e2] lg:mx-0 lg:ml-auto">
        <Search className="h-4 w-4" /><span className="flex-1 truncate text-left">Search everything…</span><kbd className="hidden rounded border border-line bg-surface px-1.5 text-[10px] sm:block">Ctrl K</kbd>
      </button>
      <ActionMenu align="end" trigger={<Button size="sm" aria-label="Quick create" className="shrink-0"><Plus className="h-4 w-4" /><span className="hidden sm:inline">Create</span></Button>}
        items={[
          { label: "New event", icon: <Briefcase className="h-4 w-4" />, onSelect: () => router.push("/events/new") },
          { label: "New client", icon: <Users className="h-4 w-4" />, onSelect: () => openCreate("client") },
          { label: "New lead", icon: <Funnel className="h-4 w-4" />, onSelect: () => openCreate("lead") },
          { label: "New task", icon: <CheckSquare className="h-4 w-4" />, onSelect: () => openCreate("task") },
          { label: "New quotation", icon: <FileSignature className="h-4 w-4" />, onSelect: () => openCreate("quotation") },
          { label: "Record expense", icon: <Wallet className="h-4 w-4" />, onSelect: () => openCreate("expense") },
          { label: "New vendor", icon: <Store className="h-4 w-4" />, onSelect: () => openCreate("vendor") },
          { label: "New inventory item", icon: <Boxes className="h-4 w-4" />, onSelect: () => openCreate("inventory") },
        ]} />
      <Button variant="ghost" size="icon" className="relative shrink-0" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} onClick={() => useUI.setState({ notifOpen: true })}>
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">{unread > 99 ? "99+" : unread}</span>}
      </Button>
      <ActionMenu align="end" trigger={<button className="flex shrink-0 items-center gap-2 rounded-lg p-1 pr-2 hover:bg-subtle" aria-label="Profile and role switcher"><Avatar name={userName} /><span className="hidden text-left md:block"><span className="block text-xs font-medium leading-tight">{userName}</span><span className="block text-[10px] leading-tight text-muted">{roleName}</span></span></button>}
        items={[
          ...users.filter((u) => u.active).map((u) => ({ label: `${u.id === currentUserId ? "✓ " : ""}Act as ${u.name} (${roles.find((r) => r.id === u.roleId)?.name})`, icon: <UserCog className="h-4 w-4" />, onSelect: () => { switchUser(u.id); toast.info(`Now acting as ${u.name}`, "Role-based visibility updated (demo simulation)."); } })),
          { label: "Settings", onSelect: () => router.push("/settings"), separatorBefore: true },
        ]} />
    </header>
  );
}

function MobileNav({ pathname, unread }: { pathname: string; unread: number }) {
  const router = useRouter();
  return (
    <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-5 items-center">
        {MOBILE_PRIMARY.slice(0, 2).map((i) => <MobTab key={i.href} item={i} active={pathname.startsWith(i.href)} />)}
        <li className="flex justify-center">
          <ActionMenu align="start" trigger={<button aria-label="Quick create" className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-lg"><Plus className="h-6 w-6" /></button>}
            items={[
              { label: "New event", onSelect: () => router.push("/events/new") },
              { label: "New task", onSelect: () => openCreate("task") },
              { label: "New client", onSelect: () => openCreate("client") },
              { label: "New lead", onSelect: () => openCreate("lead") },
              { label: "Record expense", onSelect: () => openCreate("expense") },
            ]} />
        </li>
        <MobTab item={MOBILE_PRIMARY[2]} active={pathname.startsWith("/events")} />
        <li>
          <button onClick={() => useUI.setState({ moreOpen: true })} className="relative flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted" aria-label="More">
            <MoreHorizontal className="h-5 w-5" />More
            {unread > 0 && <span className="absolute right-4 top-2 h-2 w-2 rounded-full bg-danger" />}
          </button>
        </li>
      </ul>
    </nav>
  );
}
function MobTab({ item, active }: { item: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }; active: boolean }) {
  return (
    <li>
      <Link href={item.href} aria-current={active ? "page" : undefined} className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", active ? "text-primary" : "text-muted")}>
        <item.icon className="h-5 w-5" />{item.label}
      </Link>
    </li>
  );
}

function MoreSheet({ open, role, pathname }: { open: boolean; role?: { permissions: string[] }; pathname: string }) {
  return (
    <Sheet open={open} onOpenChange={(o) => useUI.setState({ moreOpen: o })} title="All modules" width="max-w-sm">
      {NAV.map((g) => (
        <div key={g.label} className="mb-4">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">{g.label}</p>
          <div className="grid grid-cols-2 gap-2">
            {g.items.filter((i) => { const n = ROUTE_PERMISSIONS[i.href]; return !n || (role?.permissions as string[] | undefined)?.includes(n); }).map((i) => (
              <Link key={i.href} href={i.href} onClick={() => useUI.setState({ moreOpen: false })}
                className={cn("flex items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-sm font-medium", pathname.startsWith(i.href) ? "border-primary/40 bg-primary-soft text-primary" : "")}>
                <i.icon className="h-4 w-4" />{i.label}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </Sheet>
  );
}

function NotificationSheet() {
  const open = useUI((s) => s.notifOpen);
  const router = useRouter();
  return (
    <Sheet open={open} onOpenChange={(o) => useUI.setState({ notifOpen: o })} title="Notifications" description="Simulated in-app alerts generated from your demo data" width="max-w-md">
      <NotificationList compact limit={25} onNavigate={(href) => { useUI.setState({ notifOpen: false }); router.push(href); }} />
      <div className="mt-3 text-center"><Link href="/notifications" onClick={() => useUI.setState({ notifOpen: false })} className="text-xs font-medium text-primary">Open notification centre →</Link></div>
    </Sheet>
  );
}

function PwaBanners() {
  const [offline, setOffline] = React.useState(false);
  const [update, setUpdate] = React.useState<ServiceWorkerRegistration | null>(null);
  const [install, setInstall] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = React.useState(false);
  React.useEffect(() => {
    setOffline(!navigator.onLine);
    const on = () => setOffline(false), off = () => setOffline(true);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    const bip = (e: Event) => { e.preventDefault(); setInstall(e as BeforeInstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", bip);
    void registerServiceWorker(setUpdate);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); window.removeEventListener("beforeinstallprompt", bip); };
  }, []);
  return (
    <>
      {offline && <div role="status" className="flex items-center justify-center gap-2 bg-ink px-3 py-1.5 text-xs text-white"><WifiOff className="h-3.5 w-3.5" />You are offline — showing locally stored demo data. Changes are saved on this device.</div>}
      {update && <div role="status" className="flex items-center justify-center gap-3 bg-primary px-3 py-1.5 text-xs text-white">A new version is available.<button className="inline-flex items-center gap-1 rounded bg-white/20 px-2 py-0.5 font-medium hover:bg-white/30" onClick={() => applyUpdate(update)}><RefreshCw className="h-3 w-3" />Update now</button></div>}
      {install && !dismissed && (
        <div className="flex items-center justify-center gap-3 border-b border-line bg-primary-soft px-3 py-1.5 text-xs text-primary">
          <Download className="h-3.5 w-3.5" />Install this app for a faster, full-screen experience.
          <button className="rounded bg-primary px-2 py-0.5 font-medium text-white" onClick={async () => { await install.prompt(); setInstall(null); }}>Install</button>
          <button aria-label="Dismiss" onClick={() => setDismissed(true)}><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </>
  );
}

void Badge; void Menu;
