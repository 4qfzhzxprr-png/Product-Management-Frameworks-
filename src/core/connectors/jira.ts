import type { Connector, HttpClient } from "../connectors";
import type { WorkRecord } from "../work";
import { mapStatus, parseDate } from "./ticketFile";

/**
 * Jira, Cloud or self-hosted (Server and Data Center), read-only. Cloud signs in with an email
 * and an API token; self-hosted with a personal access token. It reads every open ticket and
 * epic the search covers, plus those finished in the last 60 days, so each sync is the whole
 * picture and tickets deleted in Jira disappear here too.
 *
 * Not yet run against David's Jira: built and tested against recorded responses, waiting on
 * whether Atlassian is Cloud or self-hosted and on IT clearing the connection.
 */

const DONE_WINDOW_DAYS = 60;
const PAGE_SIZE = 100;
const MAX_ISSUES = 3000;

interface JiraField {
  id: string;
  name: string;
  custom?: boolean;
}

interface JiraIssue {
  key: string;
  fields: Record<string, unknown>;
}

type Auth = { header: string; cloud: boolean };

function authOf(config: Record<string, string>, secrets: Record<string, string>): Auth {
  const token = secrets.token?.trim();
  if (!token) throw new Error("Add an API token or personal access token.");
  const email = config.email?.trim();
  return email ? { header: `Basic ${btoa(`${email}:${token}`)}`, cloud: true } : { header: `Bearer ${token}`, cloud: false };
}

async function getJson<T>(http: HttpClient, url: string, auth: Auth): Promise<T> {
  const response = await http(url, { headers: { Authorization: auth.header, Accept: "application/json" } });
  if (response.status === 401) {
    throw new Error(auth.cloud ? "Jira did not accept the email and API token. Check both, or make a new token." : "Jira did not accept the personal access token.");
  }
  if (response.status === 403) throw new Error("Jira refused access. The account may lack permission, or the site may block API tokens.");
  if (response.status === 404) throw new Error("No Jira at that address. Check the site address.");
  if (response.status === 429) throw new Error("Jira asked to slow down. The next sync will try again.");
  if (response.status >= 400) throw new Error(`Jira answered with error ${response.status}.`);
  try {
    return JSON.parse(await response.text()) as T;
  } catch {
    throw new Error("Jira's answer was not readable. Check the site address points at Jira itself.");
  }
}

/** Finds a field's id by its name, such as "Sprint" or "Team". */
function fieldId(fields: JiraField[], ...names: string[]): string | null {
  for (const name of names) {
    const found = fields.find((field) => field.name.toLowerCase() === name.toLowerCase());
    if (found) return found.id;
  }
  return null;
}

const text = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const entry = value as Record<string, unknown>;
    for (const key of ["displayName", "name", "value", "title", "key"]) if (typeof entry[key] === "string") return entry[key] as string;
  }
  return "";
};

/** The sprint a ticket is in now: the active one, else the next future one. Cloud sends objects; self-hosted can send strings. */
export function currentSprint(value: unknown): { name: string; endsAt: number | null } | null {
  const sprints = (Array.isArray(value) ? value : value ? [value] : []).map((entry) => {
    if (typeof entry === "string") {
      const pick = (key: string) => new RegExp(`${key}=([^,\\]]*)`).exec(entry)?.[1] ?? "";
      return { name: pick("name"), state: pick("state").toLowerCase(), endDate: pick("endDate") };
    }
    const sprint = entry as Record<string, unknown>;
    return { name: text(sprint.name), state: text(sprint.state).toLowerCase(), endDate: typeof sprint.endDate === "string" ? sprint.endDate : "" };
  });
  const chosen = sprints.find((sprint) => sprint.state === "active") ?? sprints.find((sprint) => sprint.state === "future") ?? null;
  if (!chosen?.name) return null;
  return { name: chosen.name, endsAt: chosen.endDate && chosen.endDate !== "<null>" ? parseDate(chosen.endDate) : null };
}

export function toRecord(issue: JiraIssue, site: string, ids: { sprint: string | null; team: string | null; epicLink: string | null }, now: number): WorkRecord {
  const fields = issue.fields;
  const type = (fields.issuetype ?? {}) as { name?: string; hierarchyLevel?: number };
  const status = (fields.status ?? {}) as { name?: string; statusCategory?: { name?: string } };
  const mapped = mapStatus(status.name ?? "", status.statusCategory?.name ?? "");
  const parent = (fields.parent ?? null) as { key?: string } | null;
  const sprint = ids.sprint ? currentSprint(fields[ids.sprint]) : null;
  const level = type.hierarchyLevel === 1 || /^epic$/i.test(type.name ?? "") ? "epic" : "item";
  const date = (key: string) => (typeof fields[key] === "string" ? parseDate(fields[key] as string) : null);
  return {
    externalId: issue.key,
    kind: type.name ?? "",
    level,
    title: text(fields.summary) || issue.key,
    url: `${site}/browse/${issue.key}`,
    status: mapped.status,
    statusLabel: status.name ?? "",
    ownerName: text(fields.assignee),
    team: ids.team ? text(fields[ids.team]) : "",
    parentExternalId: level === "epic" ? null : parent?.key ?? (ids.epicLink ? text(fields[ids.epicLink]) || null : null),
    sprint: sprint?.name ?? null,
    sprintEndsAt: sprint?.endsAt ?? null,
    dueAt: date("duedate"),
    createdAt: date("created") ?? now,
    updatedAt: date("updated") ?? now,
    resolvedAt: date("resolutiondate"),
    waitingOnProduct: mapped.waitingOnProduct,
  };
}

export const jiraConnector: Connector = {
  id: "jira",
  name: "Jira",
  description:
    "Tickets and epics from Jira Cloud or self-hosted Jira, read-only: open work plus anything finished in the last 60 days, with sprints, owners and teams. Needs IT's go-ahead first.",
  fields: [
    { key: "site", label: "Jira address", placeholder: "https://yourcompany.atlassian.net", required: true, help: "The address you open Jira at." },
    {
      key: "email",
      label: "Email (Jira Cloud only)",
      placeholder: "you@company.com",
      help: "Leave empty for self-hosted Jira, which uses a personal access token instead.",
    },
    {
      key: "token",
      label: "API token or personal access token",
      required: true,
      secret: true,
      help: "Cloud: id.atlassian.com, Security, API tokens. Self-hosted: your profile, Personal Access Tokens. Read-only use only.",
    },
    {
      key: "jql",
      label: "Which tickets (optional)",
      placeholder: "project in (REF, PORT)",
      help: "A Jira search. Leave empty for every project you can see.",
    },
  ],
  async sync({ config, secrets, now, http }) {
    const site = config.site?.trim().replace(/\/+$/, "") ?? "";
    if (!/^https:\/\//i.test(site)) throw new Error("The Jira address must start with https://.");
    const auth = authOf(config, secrets);
    const api = `${site}/rest/api/${auth.cloud ? 3 : 2}`;

    const fields = await getJson<JiraField[]>(http, `${api}/field`, auth);
    const ids = {
      sprint: fieldId(fields, "Sprint"),
      team: fieldId(fields, "Team", "Scrum Team", "Delivery Team"),
      epicLink: fieldId(fields, "Epic Link"),
    };
    const wanted = ["summary", "status", "issuetype", "assignee", "parent", "duedate", "created", "updated", "resolutiondate", ids.sprint, ids.team, ids.epicLink]
      .filter(Boolean)
      .join(",");
    const scope = config.jql?.trim();
    const jql = `${scope ? `(${scope}) AND ` : ""}(statusCategory != Done OR resolved >= -${DONE_WINDOW_DAYS}d) ORDER BY updated DESC`;

    const issues: JiraIssue[] = [];
    if (auth.cloud) {
      // Cloud's search pages with a token.
      let token: string | undefined;
      do {
        const params = new URLSearchParams({ jql, fields: wanted, maxResults: String(PAGE_SIZE) });
        if (token) params.set("nextPageToken", token);
        const page = await getJson<{ issues: JiraIssue[]; nextPageToken?: string; isLast?: boolean }>(http, `${api}/search/jql?${params}`, auth);
        issues.push(...page.issues);
        token = page.isLast === false || (page.isLast === undefined && page.nextPageToken) ? page.nextPageToken : undefined;
      } while (token && issues.length < MAX_ISSUES);
    } else {
      // Self-hosted pages by position.
      let startAt = 0;
      let total = Infinity;
      while (startAt < total && issues.length < MAX_ISSUES) {
        const params = new URLSearchParams({ jql, fields: wanted, maxResults: String(PAGE_SIZE), startAt: String(startAt) });
        const page = await getJson<{ issues: JiraIssue[]; total: number }>(http, `${api}/search?${params}`, auth);
        issues.push(...page.issues);
        total = page.total;
        if (page.issues.length === 0) break;
        startAt += page.issues.length;
      }
    }

    return {
      activities: [],
      work: issues.map((issue) => toRecord(issue, site, ids, now)),
      // Stopped early at the cap: keep what was there rather than delete what was not read.
      workComplete: issues.length < MAX_ISSUES,
    };
  },
};
