import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Evently — Event Management ERP", template: "%s · Evently ERP" },
  description: "Event management ERP for weddings, corporate events and brand activations. Frontend demo with local data.",
  applicationName: "Evently ERP",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Evently", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#6D4AFF",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Browser extensions often inject attributes on <body> before React hydrates; ignore that harmless mismatch. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
