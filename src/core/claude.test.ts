import { describe, expect, it } from "vitest";
import { openMemoryDb } from "../platform/sqljsDb";
import type { AgentRunner } from "./agents";
import { backupName, exportAll, isBackupDue } from "./backup";
import { askArgs, askClaude, extractJson, findSensitive, SensitiveDataError } from "./claude";
import { CaptureStore } from "./store";

describe("the sensitive-data check", () => {
  it("flags identifiers and hides most of each one", () => {
    const found = findSensitive(
      "Patient: Maria Lopez, DOB 04/12/1961, MRN 00451823, SSN 123-45-6789, call 312-555-0188 or maria@example.com",
    );
    expect(found.map((entry) => entry.label)).toEqual([
      "Social Security number",
      "Medical record or member number",
      "Date of birth",
      "Patient name",
      "Phone number",
      "Email address",
    ]);
    expect(found[0].sample).toBe("12•••••••89");
    expect(found.every((entry) => !entry.sample.includes("45-67"))).toBe(true);
  });

  it("lets ordinary product talk through", () => {
    expect(findSensitive("Pilot refill reminders with 20 pharmacies; pickup rate up from 71% to 84% in Q3 2026. REF-22 is blocked.")).toEqual([]);
    expect(findSensitive("The patient care plan screen and patient Portal Beta both shipped.")).toEqual([]);
  });
});

describe("asking Claude", () => {
  const runner = (lines: object[], seen: { args?: string[]; prompt?: string } = {}): AgentRunner => ({
    check: async () => ({ ok: true, program: "claude" }),
    readFolder: async () => [],
    async start(request, onLine) {
      seen.args = request.args;
      seen.prompt = request.prompt;
      for (const line of lines) onLine(JSON.stringify(line));
      return { code: 0, stderr: "" };
    },
    cancel: async () => {},
  });

  it("asks with every tool off, logs what was sent and what came back", async () => {
    const store = await CaptureStore.open(await openMemoryDb());
    const seen: { args?: string[]; prompt?: string } = {};
    const result = await askClaude(
      { runner: runner([{ type: "result", subtype: "success", result: "An answer", total_cost_usd: 0.03 }], seen), log: store.claudeLog, program: "claude", workFolder: "~" },
      { purpose: "exec-translate", system: "Rewrite for a CFO.", prompt: "Our pilot went well." },
    );
    expect(result.output).toBe("An answer");
    expect(seen.args).toEqual(askArgs("exec-translate", "Rewrite for a CFO."));
    expect(seen.args![seen.args!.indexOf("--disallowedTools") + 1]).toContain("Bash");
    const [entry] = await store.claudeLog.list();
    expect(entry).toMatchObject({ purpose: "exec-translate", prompt: "Our pilot went well.", response: "An answer", status: "done", costUsd: 0.03, warnings: [] });
  });

  it("refuses sensitive text unless David confirms, and records the warning when he does", async () => {
    const store = await CaptureStore.open(await openMemoryDb());
    const deps = { runner: runner([{ type: "result", subtype: "success", result: "ok" }]), log: store.claudeLog, program: "claude", workFolder: "~" };
    const request = { purpose: "meeting-actions" as const, system: "", prompt: "Member ID ABC12345 called about refills" };
    await expect(askClaude(deps, request)).rejects.toBeInstanceOf(SensitiveDataError);
    expect(await store.claudeLog.list()).toEqual([]);
    await askClaude(deps, { ...request, allowSensitive: true });
    expect((await store.claudeLog.list())[0].warnings[0].label).toBe("Medical record or member number");
  });

  it("logs a failure with the reason", async () => {
    const store = await CaptureStore.open(await openMemoryDb());
    const deps = { runner: runner([{ type: "result", subtype: "error_during_execution", result: "Not signed in" }]), log: store.claudeLog, program: "claude", workFolder: "~" };
    await expect(askClaude(deps, { purpose: "spec-check", system: "", prompt: "Spec" })).rejects.toThrow("Not signed in");
    expect((await store.claudeLog.list())[0]).toMatchObject({ status: "failed", response: "Not signed in" });
  });

  it("finds JSON inside an answer with prose or a code fence", () => {
    expect(extractJson<number[]>("Here you go:\n```json\n[1, 2]\n```")).toEqual([1, 2]);
    expect(extractJson<{ a: string }>('Sure. {"a": "x ] y"} Hope that helps.')).toEqual({ a: "x ] y" });
    expect(extractJson("no json here")).toBeNull();
  });
});

describe("backups and export", () => {
  it("is due once a day and names files by date", () => {
    const now = new Date(2026, 10, 17, 9, 5).getTime();
    expect(isBackupDue({ lastBackupAt: null, keep: 14 }, now)).toBe(true);
    expect(isBackupDue({ lastBackupAt: now - 3_600_000, keep: 14 }, now)).toBe(false);
    expect(isBackupDue({ lastBackupAt: now - 21 * 3_600_000, keep: 14 }, now)).toBe(true);
    expect(backupName(now)).toBe("dailywork-2026-11-17-0905.db");
  });

  it("exports every table and row", async () => {
    const store = await CaptureStore.open(await openMemoryDb());
    await store.addCapture({ body: "Send the readout", kind: "commitment" });
    const exported = await exportAll(store.database, 0);
    expect(exported.app).toBe("Daily Work");
    expect(exported.version).toBeGreaterThan(10);
    expect(exported.tables.captures).toHaveLength(1);
    expect(Object.keys(exported.tables)).toEqual(expect.arrayContaining(["people", "agent_runs", "claude_log", "settings"]));
  });
});
