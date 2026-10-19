import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page, url: string) {
  await page.goto(url);
  await page.waitForSelector("h1");
}

test("client → event wizard → persisted across reload", async ({ page }) => {
  await ready(page, "/clients");
  await page.getByRole("button", { name: "New client" }).first().click();
  await page.getByLabel("Name", { exact: false }).first().fill("Zed Testing Co");
  await page.getByLabel("Phone", { exact: false }).first().fill("+91 98765 43210");
  await page.getByRole("button", { name: "Create client" }).click();
  await expect(page.getByText("Client created")).toBeVisible();
  await page.reload();
  await page.waitForSelector("h1");
  await page.getByLabel("Search table").fill("Zed Testing");
  await expect(page.getByRole("cell", { name: /Zed Testing Co/ })).toBeVisible();

  // wizard
  await ready(page, "/events/new");
  await page.getByLabel(/Event title/).fill("Zed Annual Offsite");
  await page.getByLabel(/^Client/).selectOption({ label: "Zed Testing Co" });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel(/^Venue/).fill("Test Hall Pune");
  await page.getByLabel(/^City/).fill("Pune");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByRole("heading", { name: "Zed Annual Offsite" })).toBeVisible();
  // template tasks were generated
  await page.getByRole("tab", { name: /^Tasks/ }).click();
  await expect(page.getByText("Finalise venue contract")).toBeVisible();
});

test("venue clash is warned in the wizard", async ({ page }) => {
  await ready(page, "/events/new");
  await page.getByLabel(/Event title/).fill("Clash test");
  await page.getByLabel(/^Client/).selectOption({ index: 1 });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel(/^Venue/).fill("Udaipur City Palace Lawns");
  await page.getByLabel(/^City/).fill("Udaipur");
  // same dates as the Sharma wedding (today + 21 days)
  const d = new Date(); d.setDate(d.getDate() + 22);
  const iso = d.toISOString().slice(0, 10);
  await page.getByLabel(/Start date/).fill(iso);
  await page.getByLabel(/End date/).fill(iso);
  await expect(page.getByText(/already booked for EVT-2026-0101/).first()).toBeVisible();
});

test("vendor agreement → confirmed → approved → work order PDF", async ({ page }) => {
  await ready(page, "/events/e3?tab=vendors");
  await page.getByRole("button", { name: "Assign vendor" }).first().click();
  await page.getByRole("dialog").getByLabel(/^Vendor/).selectOption({ label: "InkWell Prints — Printing" });
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("InkWell Prints").first()).toBeVisible();
  await sheet.getByLabel("Add from vendor catalogue").selectOption({ index: 1 });
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  await sheet.getByRole("button", { name: "Custom item" }).click();
  await sheet.getByLabel("Item name").last().fill("Special foil invite box");
  await sheet.getByLabel("Agreed rate").last().fill("250");
  await sheet.getByLabel("Quoted rate").last().fill("300");
  await sheet.getByRole("button", { name: "Send to vendor" }).click();
  await expect(page.getByText(/requirement PDF generated/i).first()).toBeVisible();
  await sheet.getByRole("button", { name: "Confirm scope" }).click();
  await expect(page.getByText(/Scope confirmed/i).first()).toBeVisible();
  await sheet.getByRole("button", { name: "Approve", exact: true }).click();
  await sheet.getByRole("button", { name: "Issue work order" }).click();
  await expect(page.getByText(/Work order PO\/2026-27\/\d+ issued/)).toBeVisible();
  // confirmed scope is locked; versions tab holds a snapshot
  await sheet.getByRole("tab", { name: /Versions/ }).click();
  await expect(sheet.getByText(/Version 1/).first()).toBeVisible();
  // documents centre lists the generated PDFs
  await ready(page, "/documents");
  await expect(page.locator("table").getByText("Purchase / Work Order").first()).toBeVisible();
});

test("PDF preview renders a real PDF", async ({ page }) => {
  await ready(page, "/documents");
  await page.getByRole("button", { name: /^Preview QT\// }).first().click();
  const frame = page.locator("iframe[title='PDF preview']");
  await expect(frame).toBeVisible({ timeout: 20_000 });
  const src = await frame.getAttribute("src");
  expect(src).toMatch(/^blob:/);
  const head = await page.evaluate(async (u) => { const b = await (await fetch(u!)).blob(); return { type: b.type, size: b.size, magic: new TextDecoder().decode((await b.slice(0, 5).arrayBuffer())) }; }, src);
  expect(head.magic).toBe("%PDF-");
  expect(head.size).toBeGreaterThan(3000);
});

test("quotation lifecycle → booking confirmed → payment schedule", async ({ page }) => {
  await ready(page, "/quotations");
  await page.getByRole("button", { name: "New quotation" }).first().click();
  await page.getByRole("dialog").getByLabel(/^Event/).selectOption({ label: "EVT-2026-0106 · Singh Royal Wedding (Enquiry)" });
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { name: /QT\/2026-27/ })).toBeVisible();
  await page.getByRole("button", { name: "Custom line" }).click();
  await page.getByLabel("Description").first().fill("Mandap décor");
  await page.getByLabel("Rate").first().fill("100000");
  // 1 × 1,00,000 + 18% GST = 1,18,000
  await expect(page.getByText("₹1,18,000").first()).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await page.getByRole("button", { name: /Approve internally/ }).click();
  await page.getByRole("button", { name: "Mark as sent" }).click();
  await expect(page.getByText("Sent").first()).toBeVisible();
  await page.getByRole("button", { name: "Client approved" }).click();
  await page.getByRole("button", { name: "Convert to booking" }).click();
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("heading", { name: "Payment schedule" })).toBeVisible();
  await expect(page.getByText("Booking advance")).toBeVisible();
  // locked after conversion
  await page.goBack();
});

test("recording a client payment updates the invoice", async ({ page }) => {
  await ready(page, "/invoices");
  const unpaid = page.getByRole("row").filter({ hasText: "Tax Invoice" }).filter({ hasText: /Issued/ }).first();
  await unpaid.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Record payment" }).click();
  await page.getByLabel(/Amount received/).fill("1000");
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText("Payment recorded")).toBeVisible();
  // over-payment is refused
  await page.getByRole("tab", { name: /Payments/ }).click();
  await expect(page.getByText(/RCT\/2026-27/).first()).toBeVisible();
});

test("tasks: funnel, dependency block and completion", async ({ page }) => {
  await ready(page, "/tasks");
  await expect(page.getByText("PRIORITY FUNNEL")).toBeVisible();
  const overdueBefore = Number(await page.getByRole("button", { name: /Overdue/ }).first().locator("p").first().innerText());
  expect(overdueBefore).toBeGreaterThan(0);
  await page.getByRole("tab", { name: "List" }).click();
  // 'Send room allocation sheet' depends on an unfinished task → completion must be refused
  const row = page.getByRole("listitem").filter({ hasText: "Send room allocation sheet" });
  await row.getByRole("checkbox").click();
  await expect(page.getByText(/Blocked by an unfinished dependency/)).toBeVisible();
  // complete an overdue task and see the funnel update
  const od = page.getByRole("listitem").filter({ hasText: "Vendor confirmation call: Spice Route" });
  await od.getByRole("checkbox").click();
  await expect.poll(async () => Number(await page.getByRole("button", { name: /Overdue/ }).first().locator("p").first().innerText())).toBe(overdueBefore - 1);
});

test("inventory refuses to double-book stock", async ({ page }) => {
  await ready(page, "/events/e8?tab=inventory");
  await page.getByRole("button", { name: "Allocate stock" }).first().click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Item").selectOption({ label: "Banquet chair (gold) (CH-001)" });
  await dlg.getByLabel("Required").fill("900");
  await dlg.getByLabel("Reserve now").fill("900");
  await expect(dlg.getByText(/would double-book/)).toBeVisible();
  await expect(dlg.getByRole("button", { name: /^Reserve/ })).toBeDisabled();
});

test("role switch hides finance for coordinators", async ({ page }) => {
  await ready(page, "/dashboard");
  await expect(page.getByRole("link", { name: "Finance" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Profile and role switcher" }).click();
  await page.getByRole("menuitem", { name: /Act as Rohan Kapoor/ }).click();
  await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Finance" })).toHaveCount(0);
  await page.goto("/finance");
  await expect(page.getByText("You don't have access to this module")).toBeVisible();
});

test("global search finds records and navigates", async ({ page }) => {
  await ready(page, "/dashboard");
  await page.keyboard.press("Control+k");
  await page.getByRole("textbox", { name: "Global search" }).fill("Aurora");
  await page.getByRole("option").first().click();
  await expect(page).toHaveURL(/\/(events|clients)\//);
});

test("notifications: mark read and reset demo data", async ({ page }) => {
  await ready(page, "/notifications");
  await page.getByRole("button", { name: /Mark all read/ }).click();
  await ready(page, "/settings?tab=app");
  await page.getByRole("button", { name: "Reset demo data" }).click();
  await page.getByRole("button", { name: "Reset everything" }).click();
  await expect(page.getByText("Demo data reset")).toBeVisible();
});
