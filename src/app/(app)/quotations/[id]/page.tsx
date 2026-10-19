"use client";
import { QuotationEditor } from "@/features/quotations/quotation-editor";
import { useParams } from "next/navigation";

export default function QuotationPage() {
  const { id } = useParams<{ id: string }>();
  return <QuotationEditor id={id} />;
}
