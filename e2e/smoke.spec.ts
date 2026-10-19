import { expect, test } from "@playwright/test";

const ROUTES = [
  "/dashboard", "/clients", "/clients/c1", "/leads", "/events", "/events/new", "/events/e1", "/events/e1?tab=vendors", "/events/e1?tab=finance", "/events/e1?tab=inventory", "/events/e1?tab=departments",
  "/calendar", "/tasks", "/departments", "/inventory", "/vendors", "/vendors/v1", "/procurement", "/quotations", "/quotations/q1", "/quotations/q4", "/invoices", "/finance", "/reports",
  "/documents", "/notifications", "/settings", "/settings?tab=users", "/settings?tab=catalogue", "/settings?tab=numbering", "/settings?tab=workflow", "/settings?tab=audit", "/settings?tab=app", "/login", "/offline",
];

test.describe("every route renders without console errors", () => {
  for (const route of ROUTES) {
    test(route, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
      page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("favicon")) errors.push(m.text()); });
      const res = await page.goto(route);
      expect(res?.status() ?? 200).toBeLessThan(400);
      await page.waitForSelector("h1", { timeout: 15_000 });
      await page.waitForTimeout(400);
      expect(errors, errors.join("\n")).toEqual([]);
    });
  }
});

test("mobile viewport has no horizontal page scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  for (const r of ["/dashboard", "/events", "/events/e1", "/quotations/q4", "/tasks"]) {
    await page.goto(r);
    await page.waitForSelector("h1");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${r} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
  }
});
