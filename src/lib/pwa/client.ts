"use client";
/**
 * PWA client helpers.
 * - Service workers require HTTPS (or localhost). Install prompts: Chromium browsers (Chrome/Edge/Samsung); iOS Safari uses "Add to Home Screen".
 * - Local notifications below are shown via the service worker registration. REAL background push needs a server that stores
 *   PushSubscriptions and sends Web Push (VAPID) messages — see README "Push integration boundary".
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export async function registerServiceWorker(onUpdate: (reg: ServiceWorkerRegistration) => void) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  if (process.env.NODE_ENV !== "production" && !location.search.includes("sw=1")) return null; // avoid stale caches while developing
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    if (reg.waiting && navigator.serviceWorker.controller) onUpdate(reg);
    reg.addEventListener("updatefound", () => {
      const nw = reg.installing;
      nw?.addEventListener("statechange", () => { if (nw.state === "installed" && navigator.serviceWorker.controller) onUpdate(reg); });
    });
    return reg;
  } catch (e) {
    console.warn("Service worker registration failed", e);
    return null;
  }
}

export function applyUpdate(reg: ServiceWorkerRegistration) {
  reg.waiting?.postMessage({ type: "SKIP_WAITING" });
  navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
}

export const notificationSupport = () => typeof window !== "undefined" && "Notification" in window;
export const notificationPermission = (): NotificationPermission | "unsupported" => (notificationSupport() ? Notification.permission : "unsupported");

/** Must be called from a user gesture. */
export async function requestNotificationPermission() {
  if (!notificationSupport()) return "unsupported" as const;
  return Notification.requestPermission();
}

export async function showLocalNotification(title: string, body: string, url = "/notifications") {
  if (!notificationSupport() || Notification.permission !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) { await reg.showNotification(title, { body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url }, tag: title }); return true; }
    new Notification(title, { body, icon: "/icons/icon-192.png" });
    return true;
  } catch { return false; }
}

/* ---- Web Push subscription boundary (needs a backend to be useful) ---- */
export interface PushSubscriptionPayload { endpoint: string; keys: { p256dh: string; auth: string }; userId: string }

export async function subscribeToPush(vapidPublicKey: string | undefined): Promise<{ ok: boolean; message: string; payload?: PushSubscriptionPayload }> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return { ok: false, message: "Push is not supported in this browser." };
  if (!vapidPublicKey) return { ok: false, message: "NEXT_PUBLIC_VAPID_PUBLIC_KEY is not configured. Add it (and a push server) to enable real background push." };
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource });
  const json = sub.toJSON();
  // TODO(backend): POST this payload to /api/push/subscribe and store it per user/device.
  return { ok: true, message: "Subscribed. Send this payload to your backend.", payload: { endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" }, userId: "current" } };
}

export async function unsubscribeFromPush() {
  const reg = await navigator.serviceWorker?.ready;
  const sub = await reg?.pushManager.getSubscription();
  await sub?.unsubscribe();
  return !!sub;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
