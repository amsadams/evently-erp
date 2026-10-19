import { format, parseISO, isValid, formatDistanceToNowStrict } from "date-fns";
import type { Money } from "@/types";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 0 });
const inrCompact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });

export const money = (m: Money) => inr.format(m / 100);
export const moneyCompact = (m: Money) => "₹" + inrCompact.format(m / 100);
export const moneyPlain = (m: Money) => (m / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function fmtDate(d?: string, f = "dd MMM yyyy") {
  if (!d) return "—";
  const p = parseISO(d);
  return isValid(p) ? format(p, f) : "—";
}
export const fmtDateTime = (d?: string) => fmtDate(d, "dd MMM yyyy, h:mm a");
export const ago = (d: string) => {
  const p = parseISO(d);
  return isValid(p) ? formatDistanceToNowStrict(p, { addSuffix: true }) : "";
};
export const todayISO = () => format(new Date(), "yyyy-MM-dd");
export const toISODate = (d: Date) => format(d, "yyyy-MM-dd");
export const initials = (n: string) => n.split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase();
