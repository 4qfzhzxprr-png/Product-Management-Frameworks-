import { expect, test } from "@playwright/test";
import { go, open } from "./helpers";

const tab = (page: import("@playwright/test").Page, name: string) => page.locator(".page-head .ant-segmented").getByText(name, { exact: true }).click();

test("decisions get a why, who agreed and a status, and the register can be filtered and copied", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const errors = await open(page);
  await go(page, "Leadership");
  await tab(page, "Decisions");
  const sms = page.locator(".decision", { hasText: "Pilot SMS reminders" });
  await expect(sms.getByLabel(/^Why: Pilot SMS/)).toHaveValue(/Cheapest way to learn/);

  await page.getByLabel("Decision", { exact: true }).fill("Keep the portal beta invite-only until Q1");
  await page.getByLabel("Agreed by", { exact: true }).fill("Jordan");
  await page.getByLabel("Why", { exact: true }).fill("Support load is still settling.");
  await page.getByRole("button", { name: "Record" }).click();
  const beta = page.locator(".decision", { hasText: "Keep the portal beta invite-only" });
  await expect(beta.getByLabel(/^Agreed by: Keep/)).toHaveValue("Jordan");

  await beta.getByLabel(/^Status: Keep/).getByText("Reversed").click();
  await page.getByLabel("Filter decisions").fill("invite-only");
  await expect(page.locator(".decision")).toHaveCount(1);
  await page.getByRole("button", { name: "Copy" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Keep the portal beta invite-only until Q1 (reversed)\n  Why: Support load is still settling.");

  // The why survives leaving the page.
  await go(page, "Overview");
  await go(page, "Leadership");
  await tab(page, "Decisions");
  await expect(page.locator(".decision", { hasText: "Keep the portal beta" }).getByLabel(/^Why: Keep/)).toHaveValue("Support load is still settling.");
  expect(errors).toEqual([]);
});

test("metrics show their trend against the target, take new values and quote themselves", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const errors = await open(page);
  await go(page, "Leadership");
  await tab(page, "Metrics");
  const pickup = page.locator(".metric-card", { hasText: "Refill pickup rate" });
  await expect(pickup.locator(".stat-value")).toHaveText("84%");
  await expect(pickup).toContainText("Improving: +13% since");
  await pickup.getByLabel("New value for Refill pickup rate").fill("86");
  await pickup.getByLabel("New value for Refill pickup rate").press("Enter");
  await expect(pickup.locator(".stat-value")).toHaveText("86%");
  await expect(pickup).toContainText("Target met.");
  await pickup.getByRole("button", { name: "Quote" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^Refill pickup rate: 86%, up from 71% in .+ \(target 85%, met\)$/);

  await page.getByLabel("Metric name", { exact: true }).fill("Pharmacies live");
  await page.getByLabel("Unit", { exact: true }).fill("");
  await page.getByLabel("Target", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator(".metric-card", { hasText: "Pharmacies live" })).toContainText("No values logged yet.");
  expect(errors).toEqual([]);
});
