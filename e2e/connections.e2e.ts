import { expect, test, type Page } from "@playwright/test";
import { go, open } from "./helpers";

/** An iCalendar feed with two timed meetings and an all-day event today, in the browser's own time. */
async function todaysFeed(page: Page): Promise<string> {
  return page.evaluate(() => {
    const pad = (value: number) => String(value).padStart(2, "0");
    const stamp = (hour: number, minute = 0) => {
      const date = new Date();
      date.setHours(hour, minute, 0, 0);
      return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`;
    };
    const today = new Date();
    const day = `${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}`;
    return [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT", "UID:standup", `DTSTART:${stamp(9)}`, `DTEND:${stamp(9, 30)}`, "SUMMARY:Offshore stand-up", "END:VEVENT",
      "BEGIN:VEVENT", "UID:review", `DTSTART:${stamp(10)}`, `DTEND:${stamp(10, 15)}`, "SUMMARY:Roadmap review", "LOCATION:Room 4", "END:VEVENT",
      "BEGIN:VEVENT", "UID:offsite", `DTSTART;VALUE=DATE:${day}`, "SUMMARY:Planning week", "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
  });
}

test("a calendar feed connects, syncs, feeds the handoff window, and can be paused and removed", async ({ page }) => {
  const errors = await open(page, { empty: true });
  const body = await todaysFeed(page);
  let requests = 0;
  await page.route("https://calendar.example.test/**", async (route) => {
    requests++;
    await route.fulfill({ status: 200, body, headers: { "access-control-allow-origin": "*", "content-type": "text/calendar" } });
  });

  await go(page, "Connections");
  await expect(page.getByText("Check with IT or security before connecting company systems")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sync now" })).toHaveCount(0);
  await page.locator(".connector-list li", { hasText: "Calendar feed" }).getByRole("button", { name: "Connect" }).click();

  const form = page.locator(".connect-form");
  await expect(form.getByRole("button", { name: "Connect and sync" })).toBeDisabled();
  await form.getByLabel("Name in the app").fill("Work calendar");
  await form.getByLabel("Calendar address").fill("webcal://calendar.example.test/private/basic.ics");
  await form.getByRole("button", { name: "Connect and sync" }).click();

  const card = page.locator(".pm-card", { hasText: "Work calendar" });
  await expect(card).toContainText("Calendar feed");
  await expect(card).toContainText(/Synced just now: 3 items\./);
  expect(requests).toBe(1);

  // The meetings reach the handoff window. A late offshore shift overlaps the whole morning.
  await go(page, "Handoff");
  const hours = page.locator(".workspace-card", { has: page.locator("h2", { hasText: "Working hours" }) });
  await expect(hours.locator(".pm-section", { hasText: "Your meetings today" })).toContainText("Offshore stand-up");
  await expect(hours).toContainText("Room 4");
  await expect(hours).toContainText("All day");
  await page.locator(".handoff-settings .ant-select").click();
  await page.keyboard.type("Kolkata");
  await page.keyboard.press("Enter");
  // 18:00 to 23:59 in India is 6:30 to 12:29 in Chicago: shared from 9:00 to 12:29.
  await page.locator(".handoff-settings input[type=time]").nth(0).fill("18:00");
  await page.locator(".handoff-settings input[type=time]").nth(1).fill("23:59");
  await expect(hours.locator(".facts")).toContainText("9:00 AM to 12:29 PM your time (3 h 29 min)");
  // The two meetings take 45 minutes of it.
  await expect(hours.locator(".facts")).toContainText("Free shared time, after your meetings2 h 44 min");

  // Sync now fetches again; pausing stops it; removing deletes what it brought in.
  await go(page, "Connections");
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect.poll(() => requests).toBe(2);
  await card.getByRole("switch", { name: "Pause Work calendar" }).click();
  await expect(card).toContainText("Paused.");
  await page.getByRole("button", { name: "Sync now" }).click();
  await page.waitForTimeout(300);
  expect(requests).toBe(2);

  await card.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).last().click();
  await expect(card).toHaveCount(0);
  await go(page, "Handoff");
  await expect(page.getByText("Your meetings today")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a failing connection says why, without breaking the rest of the app", async ({ page }) => {
  await open(page, { empty: true });
  await page.route("https://calendar.example.test/**", (route) =>
    route.fulfill({ status: 404, body: "", headers: { "access-control-allow-origin": "*" } }),
  );
  await go(page, "Connections");
  await page.locator(".connector-list li", { hasText: "Calendar feed" }).getByRole("button", { name: "Connect" }).click();
  await page.getByLabel("Calendar address").fill("https://calendar.example.test/wrong.ics");
  await page.getByRole("button", { name: "Connect and sync" }).click();
  const card = page.locator(".pm-card", { hasText: "Calendar feed" });
  await expect(card.locator(".ant-alert-error")).toContainText("No calendar at that address. Check it was copied in full.");
  await go(page, "Overview");
  await expect(page.locator(".hero h2")).toHaveText("You're all clear");
});
