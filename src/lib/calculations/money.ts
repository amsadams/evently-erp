import type { Money, TaxMode } from "@/types";

/** Parse a decimal string/number (rupees) to integer paise without float drift. */
export function toMinor(input: number | string): Money {
  const s = String(input ?? "").trim().replace(/,/g, "");
  if (!s || isNaN(Number(s))) return 0;
  const neg = s.startsWith("-");
  const [whole, frac = ""] = s.replace("-", "").split(".");
  const paise = Number(whole || "0") * 100 + Number((frac + "00").slice(0, 2));
  const roundUp = frac.length > 2 && Number(frac[2]) >= 5 ? 1 : 0;
  return (neg ? -1 : 1) * (paise + roundUp);
}

export const fromMinor = (m: Money): number => m / 100;

export const percentOf = (amount: Money, pct: number): Money => Math.round((amount * pct) / 100);

/** Quantity × rate, rounded to whole paise. */
export const lineGross = (qty: number, rate: Money): Money => Math.round(qty * rate);

export interface TaxSplit { taxable: Money; tax: Money; total: Money }

/** Split a net amount according to the tax mode. */
export function applyTax(net: Money, rate: number, mode: TaxMode): TaxSplit {
  if (mode === "none" || rate <= 0) return { taxable: net, tax: 0, total: net };
  if (mode === "inclusive") {
    const taxable = Math.round((net * 100) / (100 + rate));
    return { taxable, tax: net - taxable, total: net };
  }
  const tax = percentOf(net, rate);
  return { taxable: net, tax, total: net + tax };
}

/** Allocate an amount across weights without losing a paisa. */
export function allocate(total: Money, weights: number[]): Money[] {
  const w = weights.reduce((a, b) => a + b, 0);
  if (w === 0) return weights.map(() => 0);
  const out = weights.map((x) => Math.floor((total * x) / w));
  let rem = total - out.reduce((a, b) => a + b, 0);
  for (let i = 0; rem > 0; i = (i + 1) % out.length, rem--) out[i] += 1;
  return out;
}
