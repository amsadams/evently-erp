import { expect, test } from "@playwright/test";

test("manifest is installable", async ({ page }) => {
  const res = await page.request.get("/manifest.webmanifest");
  expect(res.ok()).toBeTruthy();
  const m = await res.json();
  expect(m.display).toBe("standalone");
  expect(m.start_url).toBe("/dashboard");
  const sizes = m.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  for (const icon of m.icons) {
    const r = await page.request.get(icon.src);
    expect(r.ok(), icon.src).toBeTruthy();
    expect(r.headers()["content-type"]).toContain("image/png");
  }
});

test("service worker registers and serves the offline fallback", async ({ page, context }) => {
  await page.goto("/dashboard");
  await page.waitForSelector("h1");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // let the worker control the page
  await page.waitForSelector("h1");
  const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
  expect(controlled).toBe(true);

  await context.setOffline(true);
  await page.goto("/events").catch(() => undefined);
  await expect(page.getByRole("heading", { name: /you.re offline/i })).toBeVisible();

  // private business data is never written to the worker's caches
  await context.setOffline(false);
  const cached = await page.evaluate(async () => {
    const out: string[] = [];
    for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname);
    return out;
  });
  expect(cached.some((p) => p.startsWith("/api/"))).toBe(false);
  expect(cached).toContain("/offline");
});

test("service worker script is served uncached with root scope", async ({ page }) => {
  const res = await page.request.get("/sw.js");
  expect(res.headers()["cache-control"]).toContain("no-cache");
  expect(res.headers()["service-worker-allowed"]).toBe("/");
});

test("offline indicator appears when the connection drops", async ({ page, context }) => {
  await page.goto("/dashboard");
  await page.waitForSelector("h1");
  await context.setOffline(true);
  await expect(page.getByText(/You are offline/)).toBeVisible();
  await context.setOffline(false);
});
