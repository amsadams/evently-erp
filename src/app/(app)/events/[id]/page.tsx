import { Suspense } from "react";
import { EventDetail } from "@/features/events/event-detail";

export default function EventPage() {
  return <Suspense><EventDetail /></Suspense>;
}
