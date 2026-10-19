import { Suspense } from "react";
import { SettingsView } from "@/features/settings/settings-view";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return <Suspense><SettingsView /></Suspense>;
}
