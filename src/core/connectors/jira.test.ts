import { describe, expect, it } from "vitest";
import { openMemoryDb } from "../../platform/sqljsDb";
import { ConnectorRegistry, MemorySecretStore, syncAll, type HttpClient } from "../connectors";
import { CaptureStore } from "../store";
import { currentSprint, jiraConnector } from "./jira";
import { plainText, slackConnector } from "./slack";

/** A fake web: answers by URL, and records what was asked. */
function fakeHttp(routes: [RegExp, (url: string) => { status?: number; body: unknown }][]) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const http: HttpClient = async (url, init) => {
    calls.push({ url, headers: init?.headers ?? {} });
    const route = routes.find(([pattern]) => pattern.test(url));
    if (!route) return { status: 404, text: async () => "{}" };
    const { status = 200, body } = route[1](url);
    return { status, text: async () => JSON.stringify(body) };
  };
  return { http, calls };
}

const FIELDS = [
  { id: "summary", name: "Summary" },
  { id: "customfield_10020", name: "Sprint", custom: true },
  { id: "customfield_10001", name: "Team", custom: true },
];

const issue = (key: string, fields: Record<string, unknown>) => ({ key, fields: { summary: `${key} title`, created: "2026-10-01T09:00:00.000+0000", updated: "2026-11-15T09:00:00.000+0000", ...fields } });

const CLOUD_PAGE_1 = {
  issues: [
    issue("REF-1", { summary: "Refill flow pilot", issuetype: { name: "Epic", hierarchyLevel: 1 }, status: { name: "In Progress", statusCategory: { name: "In Progress" } }, assignee: { displayName: "Marco" }, duedate: "2026-12-01" }),
    issue("REF-22", {
      summary: "SMS reminder template",
      issuetype: { name: "Story", hierarchyLevel: 0 },
      status: { name: "Waiting for Product", statusCategory: { name: "To Do" } },
      assignee: { displayName: "Lena" },
      parent: { key: "REF-1" },
      customfield_10001: { name: "Offshore" },
      customfield_10020: [
        { name: "Sprint 23", state: "closed", endDate: "2026-11-06T00:00:00.000Z" },
        { name: "Sprint 24", state: "active", endDate: "2026-11-20T17:00:00.000Z" },
      ],
    }),
  ],
  nextPageToken: "page-2",
  isLast: false,
};
const CLOUD_PAGE_2 = {
  issues: [issue("REF-30", { issuetype: { name: "Bug" }, status: { name: "Done", statusCategory: { name: "Done" } }, resolutiondate: "2026-11-10T12:00:00.000+0000", parent: { key: "REF-1" } })],
  isLast: true,
};

describe("the Jira connector", () => {
  it("reads Jira Cloud with an email and token, page by page, into tickets and epics", async () => {
    const { http, calls } = fakeHttp([
      [/\/rest\/api\/3\/field$/, () => ({ body: FIELDS })],
      [/\/rest\/api\/3\/search\/jql\?.*nextPageToken=page-2/, () => ({ body: CLOUD_PAGE_2 })],
      [/\/rest\/api\/3\/search\/jql\?/, () => ({ body: CLOUD_PAGE_1 })],
    ]);
    const result = await jiraConnector.sync({
      config: { site: "https://acme.atlassian.net/", email: "david@acme.com", jql: "project = REF" },
      secrets: { token: "t0ken" },
      cursor: null,
      now: Date.UTC(2026, 10, 17),
      http,
    });
    expect(calls[0].headers.Authorization).toBe(`Basic ${btoa("david@acme.com:t0ken")}`);
    const search = new URL(calls[1].url);
    expect(search.searchParams.get("jql")).toBe("(project = REF) AND (statusCategory != Done OR resolved >= -60d) ORDER BY updated DESC");
    expect(search.searchParams.get("fields")).toContain("customfield_10020");
    expect(result.workComplete).toBe(true);
    expect(result.work).toHaveLength(3);
    const [epic, story, bug] = result.work!;
    expect(epic).toMatchObject({ externalId: "REF-1", level: "epic", status: "in_progress", ownerName: "Marco", parentExternalId: null, url: "https://acme.atlassian.net/browse/REF-1" });
    expect(story).toMatchObject({ level: "item", status: "blocked", waitingOnProduct: true, team: "Offshore", parentExternalId: "REF-1", sprint: "Sprint 24" });
    expect(new Date(story.sprintEndsAt!).toISOString()).toBe("2026-11-20T17:00:00.000Z");
    expect(bug).toMatchObject({ status: "done", resolvedAt: Date.parse("2026-11-10T12:00:00.000Z") });
  });

  it("reads self-hosted Jira with a personal access token, paging by position", async () => {
    const { http, calls } = fakeHttp([
      [/\/rest\/api\/2\/field$/, () => ({ body: [{ id: "customfield_10100", name: "Epic Link" }, { id: "customfield_10200", name: "Sprint" }] })],
      [
        /\/rest\/api\/2\/search\?/,
        (url) =>
          new URL(url).searchParams.get("startAt") === "0"
            ? { body: { total: 2, issues: [issue("OPS-1", { issuetype: { name: "Task" }, status: { name: "Open" }, customfield_10100: "OPS-9", customfield_10200: ["com.atlassian.greenhopper.service.sprint.Sprint@1[id=4,state=ACTIVE,name=Ops 7,endDate=2026-11-21T10:00:00.000Z]"] })] } }
            : { body: { total: 2, issues: [issue("OPS-2", { issuetype: { name: "Task" }, status: { name: "In Review" } })] } },
      ],
    ]);
    const result = await jiraConnector.sync({ config: { site: "https://jira.acme.internal" }, secrets: { token: "pat" }, cursor: null, now: 0, http });
    expect(calls[0].headers.Authorization).toBe("Bearer pat");
    expect(result.work!.map((record) => [record.externalId, record.status, record.parentExternalId, record.sprint])).toEqual([
      ["OPS-1", "todo", "OPS-9", "Ops 7"],
      ["OPS-2", "in_progress", null, null],
    ]);
  });

  it("says plainly what went wrong", async () => {
    const run = (status: number, config: Record<string, string> = { site: "https://acme.atlassian.net", email: "a@b.c" }) =>
      jiraConnector.sync({ config, secrets: { token: "x" }, cursor: null, now: 0, http: fakeHttp([[/./, () => ({ status, body: {} })]]).http });
    await expect(run(401)).rejects.toThrow("Jira did not accept the email and API token");
    await expect(run(401, { site: "https://jira.local" })).rejects.toThrow("personal access token");
    await expect(run(404)).rejects.toThrow("No Jira at that address");
    await expect(run(200, { site: "http://insecure" })).rejects.toThrow("must start with https://");
    expect(currentSprint(null)).toBeNull();
  });

  it("removes tickets deleted in Jira at the next sync", async () => {
    const store = await CaptureStore.open(await openMemoryDb());
    const connection = await store.connections.add("jira", "Jira", { site: "https://acme.atlassian.net", email: "d@acme.com" });
    const secrets = new MemorySecretStore();
    await secrets.set(connection.id, { token: "t" });
    let pages = [CLOUD_PAGE_1, CLOUD_PAGE_2];
    const http = fakeHttp([
      [/\/field$/, () => ({ body: FIELDS })],
      [/nextPageToken=page-2/, () => ({ body: pages[1] })],
      [/\/search\/jql\?/, () => ({ body: pages[0] })],
    ]).http;
    const deps = { registry: new ConnectorRegistry().register(jiraConnector), connections: store.connections, items: store.items, work: store.work, calendar: store.calendar, secrets, http };
    await syncAll(deps);
    expect((await store.work.list()).map((item) => item.externalId).sort()).toEqual(["REF-1", "REF-22", "REF-30"]);
    pages = [{ ...CLOUD_PAGE_1, issues: [CLOUD_PAGE_1.issues[0]] }, CLOUD_PAGE_2];
    await syncAll(deps);
    expect((await store.work.list()).map((item) => item.externalId).sort()).toEqual(["REF-1", "REF-30"]);
  });
});

describe("the Slack connector", () => {
  const routes = (matches: { mentions: unknown[]; dms: unknown[] }): [RegExp, (url: string) => { status?: number; body: unknown }][] => [
    [/auth\.test/, () => ({ body: { ok: true, user_id: "UDAVID" } })],
    [/users\.list/, () => ({ body: { ok: true, members: [{ id: "UDAVID", name: "david" }, { id: "UPRIYA", name: "priya", profile: { real_name: "Priya Shah" } }] } })],
    [
      /search\.messages/,
      (url) => {
        const query = new URL(url).searchParams.get("query") ?? "";
        return { body: { ok: true, messages: { matches: query.startsWith("to:me") ? matches.dms : matches.mentions, paging: { pages: 1 } } } };
      },
    ],
  ];

  it("turns mentions and direct messages into activity for the brief", async () => {
    const now = Date.UTC(2026, 10, 17, 15);
    const { http, calls } = fakeHttp(
      routes({
        mentions: [
          { ts: `${(now - 3_600_000) / 1000}`, user: "UPRIYA", text: "<@UDAVID> can you approve the <https://wiki/x|pilot scope>? &amp; soon", permalink: "https://acme.slack.com/archives/C1/p1", channel: { id: "C1", name: "refill-pilot" } },
          { ts: `${(now - 20 * 86_400_000) / 1000}`, user: "UPRIYA", text: "old", channel: { id: "C1", name: "refill-pilot" } },
        ],
        dms: [
          { ts: `${(now - 600_000) / 1000}`, user: "UPRIYA", text: "Quick one about the offsite", permalink: "https://acme.slack.com/archives/D1/p2", channel: { id: "D1", is_im: true } },
          { ts: `${(now - 300_000) / 1000}`, user: "UDAVID", text: "My own reply", channel: { id: "D1", is_im: true } },
        ],
      }),
    );
    const result = await slackConnector.sync({ config: {}, secrets: { token: "xoxp-1" }, cursor: null, now, http });
    expect(calls.every((call) => call.headers.Authorization === "Bearer xoxp-1")).toBe(true);
    expect(new URL(calls[2].url).searchParams.get("query")).toBe("<@UDAVID> after:2026-11-02");
    expect(result.activities).toEqual([
      {
        externalId: `C1:${(now - 3_600_000) / 1000}`,
        kind: "Mention",
        title: "#refill-pilot",
        snippet: "@david can you approve the pilot scope? & soon",
        author: "Priya Shah",
        url: "https://acme.slack.com/archives/C1/p1",
        occurredAt: now - 3_600_000,
        addressedToMe: true,
        fromMe: false,
      },
      expect.objectContaining({ kind: "Direct message", title: "Direct message from Priya Shah", snippet: "Quick one about the offsite" }),
    ]);
    expect(result.cursor).toBe(String(now));
  });

  it("refuses bot tokens and explains Slack's errors", async () => {
    await expect(slackConnector.sync({ config: {}, secrets: { token: "xoxb-1" }, cursor: null, now: 0, http: fakeHttp([]).http })).rejects.toThrow("user token");
    const revoked = fakeHttp([[/auth\.test/, () => ({ body: { ok: false, error: "missing_scope" } })]]).http;
    await expect(slackConnector.sync({ config: {}, secrets: { token: "xoxp-1" }, cursor: null, now: 0, http: revoked })).rejects.toThrow("search:read and users:read");
    expect(plainText("<!here> see <#C9|general>", new Map())).toBe("@here see #general");
  });
});
