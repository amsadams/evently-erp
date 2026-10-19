import type { AgreementLine, Money, QuoteBody, TaxMode } from "@/types";
import { applyTax, lineGross, percentOf } from "./money";

export interface ComputedLine { id: string; gross: Money; discount: Money; net: Money; taxable: Money; tax: Money; total: Money }
export interface QuoteTotals {
  lines: ComputedLine[]; charges: ComputedLine[]; grossTotal: Money; discountTotal: Money; chargesTotal: Money;
  taxable: Money; taxTotal: Money; grandTotal: Money; taxBreakdown: { rate: number; taxable: Money; tax: Money }[];
  byDepartment: Record<string, Money>; advanceAmount: Money;
}

export function computeQuote(body: QuoteBody): QuoteTotals {
  const mode: TaxMode = body.taxMode;
  const breakdown = new Map<number, { taxable: Money; tax: Money }>();
  const byDepartment: Record<string, Money> = {};
  const addTax = (rate: number, taxable: Money, tax: Money) => {
    const cur = breakdown.get(rate) ?? { taxable: 0, tax: 0 };
    breakdown.set(rate, { taxable: cur.taxable + taxable, tax: cur.tax + tax });
  };

  const lines = body.lines.map((l): ComputedLine => {
    const gross = lineGross(l.qty, l.rate);
    const discount = percentOf(gross, l.discountPct);
    const net = gross - discount;
    const t = applyTax(net, l.taxRate, mode);
    addTax(mode === "none" ? 0 : l.taxRate, t.taxable, t.tax);
    byDepartment[l.departmentId] = (byDepartment[l.departmentId] ?? 0) + t.total;
    return { id: l.id, gross, discount, net, ...t };
  });
  const charges = body.charges.map((c): ComputedLine => {
    const t = applyTax(c.amount, c.taxRate, mode);
    addTax(mode === "none" ? 0 : c.taxRate, t.taxable, t.tax);
    return { id: c.id, gross: c.amount, discount: 0, net: c.amount, ...t };
  });

  const all = [...lines, ...charges];
  const grandTotal = all.reduce((a, l) => a + l.total, 0);
  const taxTotal = all.reduce((a, l) => a + l.tax, 0);
  return {
    lines, charges,
    grossTotal: lines.reduce((a, l) => a + l.gross, 0),
    discountTotal: lines.reduce((a, l) => a + l.discount, 0),
    chargesTotal: charges.reduce((a, l) => a + l.total, 0),
    taxable: all.reduce((a, l) => a + l.taxable, 0),
    taxTotal, grandTotal,
    taxBreakdown: [...breakdown.entries()].sort((a, b) => a[0] - b[0]).map(([rate, v]) => ({ rate, ...v })),
    byDepartment,
    advanceAmount: percentOf(grandTotal, body.advancePct),
  };
}

/* ---------- Vendor agreements ---------- */
export const agreementLineAgreed = (l: AgreementLine): Money =>
  lineGross(l.qty, l.agreedRate) - percentOf(lineGross(l.qty, l.agreedRate), l.discountPct);
export const agreementLineQuoted = (l: AgreementLine): Money => lineGross(l.qty, l.quotedRate);
export const agreementTotal = (lines: AgreementLine[]): Money => lines.reduce((a, l) => a + agreementLineAgreed(l), 0);
export const agreementQuotedTotal = (lines: AgreementLine[]): Money => lines.reduce((a, l) => a + agreementLineQuoted(l), 0);
/** Value of the work actually delivered so far, at agreed rates. */
export const agreementDeliveredValue = (lines: AgreementLine[]): Money =>
  lines.reduce((a, l) => a + Math.round(agreementLineAgreed(l) * (l.qty ? Math.min(l.deliveredQty, l.qty) / l.qty : 0)), 0);
