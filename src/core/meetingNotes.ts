import { extractJson } from "./claude";
import { dueFromDateInput } from "./commitments";
import { isNamed, type CaptureKind, type NewCapture, type Person } from "./models";

/**
 * Meeting notes into actions. Claude reads the notes and proposes what to capture; David ticks
 * what to keep. When Claude cannot be asked, simple rules find the obvious ones.
 */

export type ActionKind = "commitment" | "ask_of_me" | "ask_of_them" | "decision";

export const ACTION_KINDS: ActionKind[] = ["commitment", "ask_of_me", "ask_of_them", "decision"];

export interface ProposedAction {
  kind: ActionKind;
  text: string;
  /** Matched to a known person when the name (or another name they go by) fits. */
  personId: number | null;
  /** The name as written, when no known person matched. */
  personName: string | null;
  /** "YYYY-MM-DD", or empty. */
  due: string;
}

const ymd = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const MEETING_SYSTEM = `You turn a product leader's meeting notes into a list of follow-ups.
The notes are written by David, so "I", "me" and "David" mean him.

Return only a JSON array, no other text. Each item is an object:
- "kind": "commitment" (David promised to do it), "ask_of_me" (someone asked David for it),
  "ask_of_them" (someone else promised or was asked to do it for David), or "decision" (something agreed).
- "text": a short, specific line that makes sense on its own, starting with a verb for actions.
- "person": the other person's name as written, or null.
- "due": a date as "YYYY-MM-DD" if one was given or clearly implied, otherwise null.

Leave out discussion that led nowhere. Do not invent dates or owners. Return [] if there is nothing.`;

/** What is sent with the notes: today's date (for "by Friday") and the names David already uses. */
export function meetingPrompt(notes: string, people: Person[], now: number, meetingWith: Person | null): string {
  const date = new Date(now);
  return [
    `Today is ${date.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} (${ymd(date)}).`,
    meetingWith ? `This was a meeting with ${meetingWith.name}.` : "",
    people.length > 0 ? `People David works with: ${people.map((person) => person.name).join(", ")}.` : "",
    "",
    "Notes:",
    notes.trim(),
  ]
    .filter((line, index) => line !== "" || index === 3)
    .join("\n");
}

function matchPerson(name: string | null, people: Person[]): Person | null {
  if (!name?.trim()) return null;
  const clean = name.trim();
  return people.find((person) => isNamed(person, clean)) ?? people.find((person) => clean.toLowerCase().startsWith(person.name.toLowerCase())) ?? null;
}

/** Reads Claude's answer. Anything that does not fit the shape is dropped rather than guessed at. */
export function parseProposals(answer: string, people: Person[], meetingWith: Person | null = null): ProposedAction[] {
  const raw = extractJson<unknown>(answer);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): ProposedAction[] => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const kind = ACTION_KINDS.includes(item.kind as ActionKind) ? (item.kind as ActionKind) : null;
    const text = typeof item.text === "string" ? item.text.trim() : "";
    if (!kind || !text) return [];
    const name = typeof item.person === "string" ? item.person : null;
    const person = matchPerson(name, people) ?? (kind !== "decision" && !name ? meetingWith : null);
    const due = typeof item.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.due) ? item.due : "";
    return [{ kind, text, personId: person?.id ?? null, personName: person ? null : name, due }];
  });
}

// ---------- The simple rules ----------

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Finds a date written the usual ways: "by Friday", "tomorrow", "next week", "Nov 20", "2026-11-20". */
export function dueFromText(text: string, now: number): string {
  const today = new Date(now);
  const lower = text.toLowerCase();
  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(text);
  if (iso) return iso[1];
  if (/\b(today|eod|end of day)\b/.test(lower)) return ymd(today);
  if (/\btomorrow\b/.test(lower)) return ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
  if (/\b(end of (the )?week|this week)\b/.test(lower)) {
    return ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + ((5 - today.getDay() + 7) % 7)));
  }
  if (/\bnext week\b/.test(lower)) {
    return ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + ((8 - today.getDay()) % 7 || 7) + 4));
  }
  const weekday = new RegExp(`\\b(?:by|on|before|until)\\s+(?:next\\s+)?(${WEEKDAYS.join("|")})\\b`).exec(lower);
  if (weekday) {
    const target = WEEKDAYS.indexOf(weekday[1]);
    const ahead = (target - today.getDay() + 7) % 7 || 7;
    return ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + ahead));
  }
  const monthDay = new RegExp(`\\b(${MONTHS.join("|")})[a-z]*\\.?\\s+(\\d{1,2})\\b`).exec(lower);
  if (monthDay) {
    const month = MONTHS.indexOf(monthDay[1]);
    const day = Number(monthDay[2]);
    let date = new Date(today.getFullYear(), month, day);
    if (date.getTime() < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - 31 * 86_400_000) {
      date = new Date(today.getFullYear() + 1, month, day);
    }
    return ymd(date);
  }
  return "";
}

/** One idea per line or sentence, without bullets. */
function sentences(notes: string): string[] {
  return notes
    .replace(/([.!?])\s+(?=[A-Z])/g, "$1\n")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)]|\[\s?\]|action( item)?s?:|todo:|ai:)\s*/i, "").trim())
    .filter((line) => line.length > 3);
}

/**
 * Finds the obvious follow-ups without Claude: "I'll …", "Priya will …", "can you …",
 * "decided …". Used when Claude Code is not available, and by the browser preview.
 */
export function proposeByRules(notes: string, people: Person[], now: number, meetingWith: Person | null = null): ProposedAction[] {
  const results: ProposedAction[] = [];
  for (const line of sentences(notes)) {
    const lower = line.toLowerCase();
    const mentioned = people.find((person) => new RegExp(`\\b${person.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(line)) ?? null;
    let kind: ActionKind | null = null;
    let person: Person | null = null;
    if (/\b(decided|decision|we agreed|agreed to|agreed that|going with)\b/.test(lower)) kind = "decision";
    else if (/^(i('ll| will| am going to|'m going to| need to| owe)|david (will|to)\b)/.test(lower) || /\b(i'll|i will) (send|share|follow|draft|write|check|get|book|set up|review)\b/.test(lower)) {
      kind = "commitment";
      person = mentioned ?? meetingWith;
    } else if (/\b(can you|could you|would you|asked (me|david)|wants (me|david) to|needs (me|david) to)\b/.test(lower)) {
      kind = "ask_of_me";
      person = mentioned ?? meetingWith;
    } else if (mentioned && new RegExp(`^${mentioned.name}\\b.*\\b(will|to|owes|is going to|'ll)\\b`, "i").test(line)) {
      kind = "ask_of_them";
      person = mentioned;
    } else if (/^(they|he|she) (will|'ll)\b/.test(lower) && meetingWith) {
      kind = "ask_of_them";
      person = meetingWith;
    }
    if (!kind) continue;
    const text = line.replace(/\.$/, "");
    results.push({ kind, text: text.charAt(0).toUpperCase() + text.slice(1), personId: person?.id ?? null, personName: null, due: dueFromText(line, now) });
  }
  return results;
}

/** Turns the kept proposals into captures. */
export function toCaptures(actions: ProposedAction[], now: number): NewCapture[] {
  return actions.map((action) => ({
    body: action.text,
    kind: action.kind as CaptureKind,
    personId: action.personId,
    dueAt: action.kind === "decision" ? null : dueFromDateInput(action.due),
    at: now,
  }));
}
