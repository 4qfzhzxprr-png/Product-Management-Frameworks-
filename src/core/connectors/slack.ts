import type { Connector, HttpClient } from "../connectors";
import type { Activity } from "../items";

/**
 * Slack, read-only: messages that mention David and direct messages to him, from the last two
 * weeks on the first sync and since the last one after that. They land in the brief and the
 * queue like any other activity, sorted by the same rules.
 *
 * Uses a user token (xoxp-) with the search:read and users:read scopes, which a workspace
 * admin has to approve for a Slack app. Not yet run against the company's Slack: built and
 * tested against recorded responses.
 */

const FIRST_SYNC_DAYS = 14;
const PER_PAGE = 100;
const MAX_PAGES = 5;

interface SlackMatch {
  iid?: string;
  ts: string;
  text: string;
  user?: string;
  username?: string;
  permalink?: string;
  channel?: { id: string; name?: string; is_im?: boolean; is_mpim?: boolean };
}

async function call<T extends { ok: boolean; error?: string }>(http: HttpClient, token: string, method: string, params: Record<string, string>): Promise<T> {
  const response = await http(`https://slack.com/api/${method}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 429) throw new Error("Slack asked to slow down. The next sync will try again.");
  if (response.status >= 400) throw new Error(`Slack answered with error ${response.status}.`);
  const body = JSON.parse(await response.text()) as T;
  if (!body.ok) {
    const reasons: Record<string, string> = {
      invalid_auth: "Slack did not accept the token. Make a new one and paste it again.",
      not_authed: "Slack did not get a token.",
      token_revoked: "The Slack token was revoked. Make a new one.",
      account_inactive: "The Slack account for this token is inactive.",
      missing_scope: "The Slack token lacks a permission it needs: search:read and users:read.",
      not_allowed_token_type: "This needs a user token (starting xoxp-), not a bot token.",
    };
    throw new Error(reasons[body.error ?? ""] ?? `Slack refused: ${body.error ?? "unknown error"}.`);
  }
  return body;
}

/** Slack's markup to plain text: <@U123> to @name, <url|label> to label, entities decoded. */
export function plainText(markup: string, names: Map<string, string>): string {
  return markup
    .replace(/<@([UW][A-Z0-9]+)(?:\|([^>]+))?>/g, (_, id: string, label?: string) => `@${label ?? names.get(id) ?? "someone"}`)
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1")
    .replace(/<!(here|channel|everyone)>/g, "@$1")
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, "$2")
    .replace(/<(https?:[^>]+)>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function toActivity(match: SlackMatch, kind: "Mention" | "Direct message", me: string, names: Map<string, string>): Activity {
  const author = (match.user && names.get(match.user)) || match.username || "Someone";
  const channel = match.channel;
  const where = channel?.is_im ? `Direct message from ${author}` : channel?.is_mpim ? "Group message" : `#${channel?.name ?? "a channel"}`;
  const text = plainText(match.text, names);
  return {
    externalId: `${channel?.id ?? "?"}:${match.ts}`,
    kind,
    title: where,
    snippet: text.length > 400 ? `${text.slice(0, 399)}…` : text,
    author,
    url: match.permalink ?? "",
    occurredAt: Math.round(Number(match.ts) * 1000),
    addressedToMe: true,
    fromMe: match.user === me,
  };
}

const ymd = (time: number) => new Date(time).toISOString().slice(0, 10);

export const slackConnector: Connector = {
  id: "slack",
  name: "Slack",
  description:
    "Messages that mention you and direct messages to you, read-only, into the brief and the queue. Needs a Slack app with a user token that your workspace admin approves.",
  fields: [
    {
      key: "token",
      label: "User token",
      required: true,
      secret: true,
      placeholder: "xoxp-…",
      help: "From the Slack app your admin approved, with the search:read and users:read scopes.",
    },
  ],
  async sync({ secrets, cursor, now, http }) {
    const token = secrets.token?.trim();
    if (!token) throw new Error("Add the Slack user token.");
    if (!/^xoxp-/.test(token)) throw new Error("This needs a user token, which starts with xoxp-.");

    const me = (await call<{ ok: boolean; user_id: string }>(http, token, "auth.test", {})).user_id;
    const users = await call<{ ok: boolean; members: { id: string; name: string; real_name?: string; profile?: { display_name?: string; real_name?: string } }[] }>(
      http,
      token,
      "users.list",
      { limit: "1000" },
    );
    const names = new Map(users.members.map((member) => [member.id, member.profile?.real_name || member.real_name || member.profile?.display_name || member.name]));

    // Slack's "after:" is a whole day, exclusive, so step back one day and drop older matches below.
    const since = cursor ? Number(cursor) : now - FIRST_SYNC_DAYS * 86_400_000;
    const after = ymd(since - 86_400_000);
    const activities = new Map<string, Activity>();
    for (const [kind, query] of [
      ["Mention", `<@${me}> after:${after}`],
      ["Direct message", `to:me after:${after}`],
    ] as const) {
      for (let page = 1; page <= MAX_PAGES; page++) {
        const result = await call<{ ok: boolean; messages: { matches: SlackMatch[]; paging?: { pages: number } } }>(http, token, "search.messages", {
          query,
          sort: "timestamp",
          sort_dir: "desc",
          count: String(PER_PAGE),
          page: String(page),
        });
        for (const match of result.messages.matches) {
          const activity = toActivity(match, kind, me, names);
          if (activity.occurredAt >= since && !activity.fromMe && !activities.has(activity.externalId)) activities.set(activity.externalId, activity);
        }
        if (page >= (result.messages.paging?.pages ?? 1)) break;
      }
    }
    return { activities: [...activities.values()], cursor: String(now) };
  },
};
