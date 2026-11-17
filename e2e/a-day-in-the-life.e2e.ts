import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { card, go, open } from "./helpers";

/*
 * A day in David's life, start to finish, in one run.
 *
 * Each chapter is something he really does, done the way a person would: by clicking what is
 * on screen and typing. Every chapter has a click budget, must show that it worked (a notice,
 * a changed count, copied text), and the page must log no errors. Then the gremlins get a turn.
 *
 * Run with DAY_SHOTS=1 to save a screenshot per chapter and the scorecard into
 * docs/usability/day-in-the-life/ for the report.
 */

const SHOTS = process.env.DAY_SHOTS ? "docs/usability/day-in-the-life" : null;

interface Score {
  chapter: string;
  clicks: number;
  budget: number;
  keys: number;
  seconds: number;
}

/** Plays David: counts every click and keystroke, so each chapter can be held to a budget. */
class David {
  clicks = 0;
  keys = 0;
  readonly scores: Score[] = [];

  constructor(
    readonly page: Page,
    private readonly info: TestInfo,
  ) {}

  async click(target: Locator) {
    this.clicks++;
    await target.click();
  }

  async type(target: Locator, text: string) {
    this.clicks++;
    await target.click();
    this.keys += text.length;
    await target.pressSequentially(text, { delay: 2 });
  }

  async press(key: string) {
    this.keys++;
    await this.page.keyboard.press(key);
  }

  async go(name: string) {
    this.clicks++;
    await go(this.page, name);
  }

  async chapter(name: string, budget: number, story: () => Promise<void>) {
    await test.step(name, async () => {
      const [clicks, keys, started] = [this.clicks, this.keys, Date.now()];
      await story();
      const score = { chapter: name, clicks: this.clicks - clicks, budget, keys: this.keys - keys, seconds: (Date.now() - started) / 1000 };
      this.scores.push(score);
      // For the report, let entrance animations finish so the picture shows the settled page.
      if (SHOTS) await this.page.waitForTimeout(700);
      const shot = await this.page.screenshot({ type: "jpeg", quality: 80 });
      await this.info.attach(name, { body: shot, contentType: "image/jpeg" });
      if (SHOTS) {
        mkdirSync(SHOTS, { recursive: true });
        writeFileSync(`${SHOTS}/${String(this.scores.length).padStart(2, "0")}.jpg`, shot);
      }
      expect(score.clicks, `"${name}" took ${score.clicks} clicks; its budget is ${budget}`).toBeLessThanOrEqual(budget);
    });
  }

  scorecard(): string {
    const rows = this.scores.map(
      (score) => `| ${score.chapter} | ${score.clicks} / ${score.budget} | ${score.keys} | ${score.seconds.toFixed(1)} s |`,
    );
    const clicks = this.scores.reduce((sum, score) => sum + score.clicks, 0);
    const keys = this.scores.reduce((sum, score) => sum + score.keys, 0);
    return ["| Chapter | Clicks / budget | Keys typed | Time |", "| --- | --- | --- | --- |", ...rows, `| **Whole day** | **${clicks}** | **${keys}** | |`].join("\n");
  }
}

const toast = (page: Page) => page.locator(".toast");
const nav = (page: Page, name: string) => page.locator(".sidebar .nav-item", { hasText: name });
const badge = (page: Page, name: string) => nav(page, name).locator(".nav-badge");

test("a day in David's life", async ({ page, context }, info) => {
  test.setTimeout(120_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const errors = await open(page);
  const david = new David(page, info);

  await david.chapter("7:58 Coffee, and what is waiting", 0, async () => {
    // One number on the Overview, the same one the menu bar shows, split so he knows where to look.
    await expect(page.locator(".page-head p")).toContainText("11 items are waiting on you (7 you owe, 4 need your decision)");
    await expect(page.locator(".slip-banner")).toContainText("2 commitments to leadership are slipping");
  });

  await david.chapter("8:05 The morning brief", 4, async () => {
    await david.click(page.locator(".page-head p").getByRole("button", { name: "need your decision" }));
    await expect(page.locator(".page-head h1")).toHaveText("Decision queue");
    await david.go("Brief");
    await expect(page.locator(".meeting-strip")).toContainText("Offshore stand-up");
    // The first thing that happened overnight needs nothing from him: clear it, and it goes.
    const away = card(page, "While you were away");
    const first = away.locator(".item").first();
    const title = (await first.locator(".item-title").innerText()).trim();
    await david.click(first.getByRole("button", { name: "Clear" }));
    await expect(toast(page)).toContainText("Cleared");
    await expect(away).not.toContainText(title);
    // He makes the call on Release 4.2 and clears it. One decision down.
    await david.click(card(page, "Needs my decision").locator(".item", { hasText: "Release 4.2" }).getByRole("button", { name: "Clear" }));
    await expect(badge(page, "Queue")).toHaveText("3");
  });

  await david.chapter("8:20 A thought in the shower, captured", 4, async () => {
    await david.click(page.locator(".capture-button"));
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Capture text")).toBeFocused();
    await david.type(dialog.getByLabel("Capture text"), "Ask Morgan for the Q1 pharmacy cost model");
    // Choosing from each list counts as a click; then Return saves from where the focus is.
    await dialog.getByLabel("Kind").selectOption({ label: "Ask of them" });
    await dialog.getByLabel("Person", { exact: true }).selectOption({ label: "Morgan" });
    david.clicks += 2;
    await dialog.getByLabel("Person", { exact: true }).focus();
    await david.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(toast(page)).toContainText("as ask of them");
  });

  await david.chapter("9:00 1:1 with Priya", 6, async () => {
    await david.go("Team");
    await david.click(page.locator(".pm-name", { hasText: "Priya" }));
    await expect(page.locator(".page-head h1")).toContainText("Priya");
    await expect(page.locator(".next-meeting")).toContainText("Priya / David 1:1");
    await david.type(page.getByLabel("Add a topic"), "Her ask to lead discovery");
    await david.press("Enter");
    await david.click(page.getByRole("checkbox", { name: "Mark discussed: Scope for the next discovery cycle" }));
    await expect(toast(page)).toContainText("Done: “Scope for the next discovery cycle”");
    await david.press("Escape");
    await expect(page.locator(".page-head h1")).toHaveText("Team");
  });

  await david.chapter("10:00 Hand the agents a job", 6, async () => {
    await david.go("Agents");
    await expect(page.locator(".agent-card")).toHaveCount(9);
    await david.type(page.getByLabel("Brief", { exact: true }), "Draft a one-page PRD for pausing refill reminders\nFor Thursday's review with Jordan.");
    await david.click(page.getByRole("checkbox", { name: "Wins, evidence and metrics (90 days)" }));
    await david.click(page.getByRole("button", { name: "Run", exact: true }));
    await expect(toast(page)).toContainText("product-lead is on it");
    await expect(page.locator(".run-detail .run-state")).toHaveText("Waiting for review", { timeout: 10_000 });
    await expect(badge(page, "Agents")).toHaveText("1");
  });

  await david.chapter("10:05 Not quite: send it back", 3, async () => {
    await david.type(page.getByLabel("Feedback"), "Lead with the pharmacist quote and add a success metric.");
    await david.click(page.getByRole("button", { name: "Send back" }));
    await expect(page.locator(".run-detail")).toContainText("Revision of the earlier run");
    await expect(page.locator(".run-detail .run-state")).toHaveText("Waiting for review", { timeout: 10_000 });
    await david.click(page.getByRole("button", { name: "Approve" }));
    await expect(toast(page)).toContainText("Approved");
    await expect(badge(page, "Agents")).toHaveCount(0);
  });

  await david.chapter("11:30 The weekly update for Jordan", 2, async () => {
    await david.go("Leadership");
    await expect(page.locator(".alerts")).toContainText("Tell the CPO before they hear it elsewhere");
    await david.click(page.getByRole("button", { name: "Copy" }));
    const update = await page.evaluate(() => navigator.clipboard.readText());
    expect(update).toMatch(/^Product update, week of /);
    expect(update).toContain("Eligibility checks for the top payers");
  });

  await david.chapter("14:00 A number for the CFO deck", 4, async () => {
    await david.go("Influence");
    await david.click(page.locator(".bank-filters .ant-segmented").first().getByText("Metric", { exact: true }));
    await david.click(page.getByRole("checkbox", { name: /Select: Refill pickup rate up/ }));
    await david.click(page.getByRole("button", { name: "Copy selected (1)" }));
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Refill pickup rate up from 71% to 84%");
  });

  await david.chapter("16:10 Oops: ticked the wrong promise", 3, async () => {
    await david.go("Commitments");
    const promised = card(page, "I promised");
    const before = await promised.locator(".item").count();
    await david.click(promised.getByRole("checkbox", { name: "Mark done: Send the refill pilot readout" }));
    await expect(promised.locator(".item")).toHaveCount(before - 1);
    // Command-Z, the way he would anywhere else on the Mac.
    await david.press("ControlOrMeta+z");
    await expect(promised.locator(".item")).toHaveCount(before);
  });

  await david.chapter("17:15 Hand off to the offshore team", 4, async () => {
    await david.go("Handoff");
    await expect(page.getByRole("textbox").last()).toHaveValue(/^Handoff for /);
    await david.click(page.getByRole("button", { name: "Copy" }));
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("REF-22 SMS reminder template");
  });

  await david.chapter("17:30 Make Mondays easier", 4, async () => {
    await david.go("Agents");
    await david.click(page.locator(".page-head .ant-segmented").getByText("Schedules", { exact: true }));
    await david.type(page.getByLabel("Schedule brief"), "Summarize last week's shipped work and risks for my Monday update");
    await david.click(page.getByRole("button", { name: "Add schedule" }));
    await expect(page.locator(".schedule-list .item")).toContainText("Mondays at 8:00 AM");
  });

  await david.chapter("17:45 Lights out: does it all add up?", 1, async () => {
    await david.go("Overview");
    // Still 7 captures on him (the ask of Morgan waits on Morgan, not on him), and 3 decisions
    // left after clearing one. The ask shows up under "Waiting on others" instead: 3 became 4.
    await expect(page.locator(".page-head p")).toContainText("10 items are waiting on you (7 you owe, 3 need your decision)");
    await expect(page.locator(".stat", { hasText: "Waiting on others" }).first().locator(".stat-value")).toHaveText("4");
  });

  const scorecard = david.scorecard();
  console.log(`\nDavid's day\n\n${scorecard}\n`);
  await info.attach("scorecard", { body: scorecard, contentType: "text/markdown" });
  if (SHOTS) writeFileSync(`${SHOTS}/scorecard.md`, `${scorecard}\n`);
  expect(errors).toEqual([]);
});

test("gremlin hour: everything a tired person might do wrong", async ({ page }) => {
  const errors = await open(page);

  await test.step("double-clicks Run on an agent job", async () => {
    await go(page, "Agents");
    await page.getByLabel("Brief", { exact: true }).fill("Competitor scan, done twice by accident?");
    await page.getByRole("button", { name: "Run", exact: true }).dblclick();
    await expect(page.locator(".run-row")).toHaveCount(1);
  });

  await test.step("tries to run, send back and capture with nothing typed", async () => {
    await page.locator(".page-head .ant-segmented").getByText("Team", { exact: true }).click();
    await expect(page.getByRole("button", { name: "Run", exact: true })).toBeDisabled();
    await page.locator(".capture-button").click();
    await page.getByRole("dialog").getByLabel("Capture text").fill("   ");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  await test.step("mashes Escape and ? on every page", async () => {
    for (const name of ["Overview", "Team", "Agents", "Leadership", "Captures"]) {
      await go(page, name);
      for (const key of ["Escape", "Escape", "?", "Escape", "Escape"]) await page.keyboard.press(key);
      await expect(page.getByRole("dialog")).toBeHidden();
      await expect(page.locator(".sidebar nav .nav-item.selected")).toContainText(name);
    }
  });

  await test.step("captures something long, with emoji and odd characters", async () => {
    const odd = `🚀 Ship "refill pause" <b>not bold</b> & 100% of pharmacies ${"very ".repeat(60)}long`;
    await page.locator(".capture-button").click();
    await page.getByRole("dialog").getByLabel("Capture text").fill(odd);
    await page.keyboard.press("Enter");
    await go(page, "Captures");
    await expect(page.locator(".capture-body").first()).toHaveText(odd);
    await expect(page.locator("b", { hasText: "not bold" })).toHaveCount(0);
  });

  await test.step("clicks Undo twice and presses Command-Z with nothing to undo", async () => {
    await go(page, "Commitments");
    const promised = card(page, "I promised");
    const before = await promised.locator(".item").count();
    await promised.getByRole("checkbox").first().click();
    await toast(page).getByRole("button", { name: "Undo" }).click();
    await expect(promised.locator(".item")).toHaveCount(before);
    await page.keyboard.press("ControlOrMeta+z");
    await expect(promised.locator(".item")).toHaveCount(before);
  });

  await test.step("races through every page faster than it can draw", async () => {
    for (const name of ["Brief", "Queue", "Agents", "Delivery", "Leadership", "Influence", "Analytics", "Overview"]) {
      await page.locator(".sidebar nav").getByRole("button", { name: new RegExp(`^${name}`) }).click();
    }
    await expect(page.locator(".page-head h1")).toHaveText(/^Good (morning|afternoon|evening)$/);
  });

  await test.step("shrinks the window to its smallest and carries on", async () => {
    await page.setViewportSize({ width: 720, height: 440 });
    await go(page, "Agents");
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sideways).toBeLessThanOrEqual(1);
    await expect(page.getByLabel("Brief", { exact: true })).toBeVisible();
  });

  expect(errors).toEqual([]);
});
