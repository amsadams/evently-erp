"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { BellRing } from "lucide-react";
import { useDB } from "@/stores/db";
import { simulateBusinessEvent, syncAlerts } from "@/services/ops";
import { PageHeader } from "@/components/layout/page-header";
import { NotificationList } from "@/components/layout/notification-list";
import { Alert, Button, Card, CardHeader } from "@/components/ui/primitives";
import { toast } from "@/components/ui/overlays";
import { notificationPermission, requestNotificationPermission, showLocalNotification } from "@/lib/pwa/client";

export default function NotificationsPage() {
  const router = useRouter();
  const unread = useDB((s) => s.notifications.filter((n) => !n.read).length);
  const [perm, setPerm] = React.useState<NotificationPermission | "unsupported">("default");
  React.useEffect(() => setPerm(notificationPermission()), []);
  return (
    <>
      <PageHeader title="Notification centre" description={`${unread} unread. Alerts are generated deterministically from your demo data and from actions you take (tasks, quotations, payments, vendors, stock).`}
        actions={<Button variant="outline" onClick={() => { syncAlerts(); toast.info("Alert engine re-run", "Existing alerts are deduplicated."); }}>Re-run alert engine</Button>} />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <NotificationList onNavigate={(href) => router.push(href)} />
        <div className="space-y-4">
          <Card>
            <CardHeader title="Browser notifications" description="Permission is requested only when you click" />
            <div className="space-y-3 p-4 text-sm">
              <p className="text-muted">Status: <strong className="text-ink capitalize">{perm}</strong></p>
              {perm === "default" && <Button className="w-full" onClick={async () => { const r = await requestNotificationPermission(); setPerm(r); if (r === "granted") toast.success("Browser notifications enabled"); }}><BellRing className="h-4 w-4" />Enable browser notifications</Button>}
              {perm === "granted" && <Button className="w-full" variant="outline" onClick={async () => { const ok = await showLocalNotification("Evently test notification", "Local notification via the service worker.", "/notifications"); if (!ok) toast.warning("Could not show notification", "Service worker may not be active in development. Try a production build."); }}>Send test notification</Button>}
              {perm === "denied" && <Alert tone="warning">Blocked in browser settings. Allow notifications for this site to enable.</Alert>}
              {perm === "unsupported" && <Alert tone="warning">This browser does not support notifications.</Alert>}
              <Alert tone="info" title="Local vs push">These are local notifications triggered while the app runs. True background push (app closed) needs a server that stores push subscriptions and sends Web Push — see Settings → PWA.</Alert>
            </div>
          </Card>
          <Card>
            <CardHeader title="Simulate business events" description="Demo only — creates real state changes + alerts" />
            <div className="space-y-2 p-4">
              <Button variant="outline" className="w-full justify-start" onClick={() => simulateBusinessEvent("vendor-confirmed")}>Vendor confirms a pending agreement</Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => simulateBusinessEvent("client-approved")}>Client approves a sent quotation</Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => simulateBusinessEvent("payment-received")}>Bank-feed payment arrives</Button>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
