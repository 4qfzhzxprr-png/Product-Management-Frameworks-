import { expect, test } from "@playwright/test";
import { card, go, open } from "./helpers";

test("meetings from the calendar appear in the brief and as each person's next meeting", async ({ page }) => {
  const errors = await open(page);
  await go(page, "Brief");
  const today = page.locator(".meeting-strip");
  await expect(today.locator(".meeting-title")).toHaveText([/Offshore stand-up/, /Roadmap review/, /Pricing experiment readout/]);
  await expect(today.locator("li", { hasText: "Roadmap review" })).toHaveAttribute("title", "Room 4");

  await go(page, "Team");
  await expect(page.locator(".pm-card", { hasText: "Priya" }).locator(".next-meeting")).toContainText("Priya / David 1:1");
  await expect(page.locator(".pm-card", { hasText: "Marco" }).locator(".next-meeting")).toContainText("Marco 1:1");

  await page.locator(".pm-card", { hasText: "Priya" }).getByRole("button", { name: /1:1 workspace/ }).click();
  await expect(page.locator(".next-meeting")).toContainText("Priya / David 1:1");

  await go(page, "Leadership");
  await page.locator(".page-head .ant-segmented").getByText("1:1 prep", { exact: true }).click();
  await expect(page.locator(".next-meeting")).toContainText("Jordan / David weekly 1:1");
  expect(errors).toEqual([]);
});

test("a person's other names connect them to epics the tracker files under a different name", async ({ page }) => {
  const errors = await open(page);
  await go(page, "Team");
  const priya = page.locator(".pm-card", { hasText: "Priya" });
  await expect(priya.locator(".aliases")).toContainText("Also known as Priya S.");
  await expect(priya.locator(".epics li")).toHaveText([/Patient portal beta/]);

  // Without the other name, the epic owned by "Priya S." no longer matches.
  await priya.getByRole("button", { name: "Edit" }).click();
  await priya.getByLabel("Other names for Priya").fill("");
  await priya.getByRole("button", { name: "Save" }).click();
  await expect(priya.locator(".epics li")).toHaveCount(0);
  await expect(priya).toContainText("No epics are owned by Priya in the tracker.");

  await priya.getByRole("button", { name: "Add other names" }).click();
  await priya.getByLabel("Other names for Priya").fill("Priya S., psharma");
  await priya.getByLabel("Other names for Priya").press("Enter");
  await expect(priya.locator(".aliases")).toContainText("Also known as Priya S., psharma.");
  await expect(priya.locator(".epics li")).toHaveText([/Patient portal beta/]);
  expect(errors).toEqual([]);
});
