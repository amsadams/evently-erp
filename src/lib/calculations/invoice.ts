import type { InvoiceLine, Money, TaxMode } from "@/types";
import { applyTax } from "./money";

export function computeInvoiceTotals(lines: InvoiceLine[], mode: TaxMode): { subtotal: Money; tax: Money; total: Money } {
  let subtotal = 0, tax = 0, total = 0;
  for (const l of lines) {
    const t = applyTax(l.amount, l.taxRate, mode);
    subtotal += t.taxable; tax += t.tax; total += t.total;
  }
  return { subtotal, tax, total };
}
