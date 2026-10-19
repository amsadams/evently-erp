import type { DB, InventoryItem, StockAllocation } from "@/types";

/** Units still held by an allocation (reserved, not yet returned, damaged or written off). */
export const held = (a: StockAllocation) => Math.max(0, a.reserved - a.returned - a.damaged - a.missing);

const overlaps = (a: { from: string; to: string }, from: string, to: string) => a.from <= to && a.to >= from;

export function usableStock(item: InventoryItem) {
  return Math.max(0, item.total - item.damaged - item.unavailable);
}

/** Available quantity for a period, optionally ignoring one allocation (when editing it). */
export function availableFor(db: DB, itemId: string, from: string, to: string, ignoreAllocationId?: string): number {
  const item = db.inventory.find((i) => i.id === itemId);
  if (!item) return 0;
  const holds = db.allocations
    .filter((a) => a.itemId === itemId && a.id !== ignoreAllocationId && overlaps(a, from, to))
    .reduce((s, a) => s + held(a), 0);
  return Math.max(0, usableStock(item) - holds);
}

/** Current (today) stock position across all allocations. */
export function stockSummary(db: DB, item: InventoryItem) {
  const allocs = db.allocations.filter((a) => a.itemId === item.id);
  const reserved = allocs.reduce((s, a) => s + Math.max(0, a.reserved - a.dispatched), 0);
  const dispatched = allocs.reduce((s, a) => s + Math.max(0, a.dispatched - a.returned - a.damaged - a.missing), 0);
  const available = Math.max(0, usableStock(item) - reserved - dispatched);
  return { total: item.total, reserved, dispatched, damaged: item.damaged, unavailable: item.unavailable, available, lowStock: available <= item.reorderLevel };
}
