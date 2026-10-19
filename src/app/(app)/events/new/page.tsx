import { Suspense } from "react";
import { EventWizard } from "@/features/events/event-wizard";

export const metadata = { title: "New event" };

export default function NewEventPage() {
  return <Suspense><EventWizard /></Suspense>;
}
