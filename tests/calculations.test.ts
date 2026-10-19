import { describe, expect, it } from "vitest";
import { allocate, applyTax, percentOf, toMinor } from "@/lib/calculations/money";
import { agreementTotal, computeQuote } from "@/lib/calculations/quote";
import { computeInvoiceTotals } from "@/lib/calculations/invoice";
import { availableFor } from "@/lib/calculations/inventory";
import { funnelBucket } from "@/lib/calculations/tasks";
import { eventFinancials, invoiceBalance, invoiceStatus } from "@/lib/calculations/finance";
import { eventConflicts, stockConflicts } from "@/lib/calculations/conflicts";
import { buildSeed, dayOffset } from "@/mock-data/seed";
import type { QuoteBody, Task } from "@/types";

const body = (over: Partial<QuoteBody> = {}): QuoteBody => ({
  lines: [{ id: "1", departmentId: "dp1", name: "Decor", description: "", qty: 3, unit: "set", rate: 33333, discountPct: 10, taxRate: 18 }],
  charges: [{ id: "c", label: "Fee", amount: 10000, taxRate: 18 }], taxMode: "exclusive", advancePct: 30, terms: "", paymentTerms: "", notes: "", ...over,
});

describe("money", () => {
  it("parses decimal strings without float drift", () => {
    expect(toMinor("1.005")).toBe(101); // half-up on the third decimal
    expect(toMinor("19.99")).toBe(1999);
    expect(toMinor("1,23,456.70")).toBe(12345670);
    expect(toMinor("abc")).toBe(0);
  });
  it("allocates without losing a paisa", () => {
    const parts = allocate(10000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10000);
    expect(parts).toEqual([3334, 3333, 3333]);
  });
  it("tax exclusive vs inclusive vs none", () => {
    expect(applyTax(10000, 18, "exclusive")).toEqual({ taxable: 10000, tax: 1800, total: 11800 });
    const inc = applyTax(11800, 18, "inclusive");
    expect(inc.taxable + inc.tax).toBe(11800);
    expect(inc.taxable).toBe(10000);
    expect(applyTax(10000, 18, "none")).toEqual({ taxable: 10000, tax: 0, total: 10000 });
    expect(percentOf(12345, 12.5)).toBe(1543);
  });
});

describe("quotation totals", () => {
  it("applies discount, tax and charges in integer paise", () => {
    const t = computeQuote(body());
    // 3 × 333.33 = 999.99 → gross 99999 ; 10% = 10000 (rounded) ; net 89999
    expect(t.grossTotal).toBe(99999);
    expect(t.discountTotal).toBe(10000);
    expect(t.lines[0].net).toBe(89999);
    expect(t.lines[0].tax).toBe(16200);
    expect(t.grandTotal).toBe(89999 + 16200 + 10000 + 1800);
    expect(t.taxTotal).toBe(16200 + 1800);
    expect(t.advanceAmount).toBe(percentOf(t.grandTotal, 30));
  });
  it("grand total equals sum of parts in every tax mode", () => {
    for (const mode of ["exclusive", "inclusive", "none"] as const) {
      const t = computeQuote(body({ taxMode: mode }));
      expect(t.grandTotal).toBe([...t.lines, ...t.charges].reduce((a, l) => a + l.total, 0));
      expect(t.taxBreakdown.reduce((a, b) => a + b.tax, 0)).toBe(t.taxTotal);
    }
  });
  it("invoice totals mirror quote maths", () => {
    expect(computeInvoiceTotals([{ id: "x", description: "a", amount: 10000, taxRate: 18 }], "exclusive").total).toBe(11800);
  });
});

describe("vendor agreement snapshots are independent of catalogue", () => {
  it("agreed totals come from the line, not the catalogue", () => {
    const db = buildSeed();
    const a = db.assignments[0];
    const before = agreementTotal(a.lines);
    const item = db.catalogue.find((c) => c.id === a.lines[0].catalogueItemId)!;
    item.rate = item.rate * 5; // catalogue edit
    expect(agreementTotal(a.lines)).toBe(before);
  });
});

describe("inventory availability", () => {
  it("subtracts overlapping holds only", () => {
    const db = buildSeed();
    const chairs = db.inventory.find((i) => i.id === "in1")!;
    const e1 = db.events.find((e) => e.id === "e1")!;
    const free = availableFor(db, "in1", e1.startDate, e1.endDate);
    expect(free).toBeLessThanOrEqual(chairs.total - chairs.damaged);
    // a far-future window has the full usable stock
    expect(availableFor(db, "in1", "2099-01-01", "2099-01-02")).toBe(chairs.total - chairs.damaged - chairs.unavailable);
  });
  it("flags double-booking across overlapping events", () => {
    const db = buildSeed();
    const al = db.allocations.find((a) => a.id === "al11")!; // Gupta reception 450 chairs same dates as Sharma 400
    al.reserved = 800;
    expect(stockConflicts(db).some((c) => c.severity === "critical")).toBe(true);
  });
});

describe("tasks funnel", () => {
  const base: Task = { id: "t", title: "x", description: "", status: "To Do", priority: "Medium", assigneeId: "u1", dependsOn: [], checklist: [], comments: [], attachments: [], history: [], kind: "task", createdAt: "" };
  it("is mutually exclusive with documented precedence", () => {
    expect(funnelBucket({ ...base, status: "Completed" })).toBe("Completed");
    expect(funnelBucket({ ...base, due: dayOffset(-1), priority: "Critical" })).toBe("Overdue");
    expect(funnelBucket({ ...base, due: dayOffset(10), priority: "Critical" })).toBe("Critical");
    expect(funnelBucket({ ...base, due: dayOffset(0) })).toBe("Due today");
    expect(funnelBucket({ ...base, due: dayOffset(2) })).toBe("Due soon");
    expect(funnelBucket({ ...base, due: dayOffset(20) })).toBe("Upcoming");
    expect(funnelBucket(base)).toBe("No deadline");
  });
});

describe("event finance & conflicts", () => {
  it("does not double count proforma requests or vendor payments", () => {
    const db = buildSeed();
    const e1 = db.events.find((e) => e.id === "e1")!;
    const f = eventFinancials(db, e1);
    const proforma = db.invoices.filter((i) => i.eventId === "e1" && i.type === "Proforma").reduce((a, i) => a + i.total, 0);
    expect(f.requested).toBe(proforma);
    expect(f.invoiced).toBe(db.invoices.filter((i) => i.eventId === "e1" && i.type === "Tax Invoice").reduce((a, i) => a + i.total, 0));
    expect(f.cashPosition).toBe(f.received - f.vendorPaid - f.expensesPaid);
    expect(f.estimatedProfit).toBe(f.estimatedRevenue - f.vendorCommitted - f.expensesRecorded);
  });
  it("invoice status derives from payments and due date", () => {
    const db = buildSeed();
    const overdue = db.invoices.find((i) => i.id === "inv8");
    const paid = db.invoices.find((i) => invoiceBalance(db, i) === 0 && i.status === "Issued" && i.type === "Tax Invoice");
    expect(paid && invoiceStatus(db, paid)).toBe("Paid");
    expect(overdue).toBeDefined();
  });
  it("detects the seeded venue clash between Sharma and Gupta events", () => {
    const db = buildSeed();
    const gupta = db.events.find((e) => e.id === "e8")!;
    expect(eventConflicts(db, gupta).some((c) => c.kind === "venue")).toBe(true);
  });
});
