import { WifiOff } from "lucide-react";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-subtle text-muted"><WifiOff className="h-6 w-6" /></span>
      <h1 className="text-xl font-semibold">You&apos;re offline</h1>
      <p className="max-w-sm text-sm text-muted">
        Evently needs a connection to load new pages. Pages you already opened and the data stored on this device remain available once you reconnect.
        For privacy, business records are never cached by the service worker.
      </p>
      <a href="/dashboard" className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white">Try again</a>
    </main>
  );
}
