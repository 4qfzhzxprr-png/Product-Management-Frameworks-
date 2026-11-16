import { expect, type Locator, type Page } from "@playwright/test";

/** Opens the app and fails the test later if the page logs an error. */
export async function open(page: Page, options: { empty?: boolean } = {}): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (entry) => {
    if (entry.type() === "error") errors.push(entry.text());
  });
  await page.goto(options.empty ? "/?empty" : "/");
  await expect(page.locator(".stat").first()).toBeVisible();
  return errors;
}

export async function go(page: Page, name: string): Promise<void> {
  await page.locator(".sidebar nav").getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect(page.locator(".sidebar nav .nav-item.selected")).toContainText(name);
}

/** A glass card found by its heading. */
export function card(page: Page, heading: string): Locator {
  return page.locator(".glass", { has: page.locator("h2", { hasText: heading }) });
}

export function stat(page: Page, label: string): Locator {
  return page.locator(".stat", { hasText: label }).first().locator(".stat-value");
}

/** Opens quick capture from the sidebar and fills it in. Leaves the dialog open. */
export async function startCapture(
  page: Page,
  values: { text: string; kind?: string; person?: string; project?: string; due?: string; win?: boolean },
): Promise<void> {
  await page.locator(".capture-button").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Capture text").fill(values.text);
  if (values.kind) await dialog.getByLabel("Kind").selectOption({ label: values.kind });
  if (values.person) await dialog.getByLabel("Person", { exact: true }).selectOption({ label: values.person });
  if (values.project) await dialog.getByLabel("Project", { exact: true }).selectOption({ label: values.project });
  if (values.due) await dialog.locator(".due input").fill(values.due);
  if (values.win) await dialog.getByRole("checkbox", { name: "Win" }).check();
}

export async function capture(page: Page, values: Parameters<typeof startCapture>[1]): Promise<void> {
  await startCapture(page, values);
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

/** A date field value `days` from today, in the browser's own time zone. */
export async function dateFromToday(page: Page, days: number): Promise<string> {
  return page.evaluate((offset) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    const pad = (part: number) => String(part).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }, days);
}

export async function noSidewaysScroll(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
}

export const PAGES = ["Overview", "Brief", "Queue", "Team", "Leadership", "Commitments", "Delivery", "Handoff", "Analytics", "Captures"];
