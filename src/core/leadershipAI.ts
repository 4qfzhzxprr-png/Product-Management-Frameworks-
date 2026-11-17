import { extractJson } from "./claude";
import type { Stakeholder } from "./influence";

/** The prompts behind the leadership tools that use Claude. Each one is a plain question with no tools. */

export interface Audience {
  /** "Morgan, CFO", or a role on its own such as "the board". */
  label: string;
  goals: string;
  concerns: string;
}

export const GENERIC_AUDIENCES: Audience[] = [
  { label: "the CEO", goals: "Growth, the company's strategy and its story to the board", concerns: "Surprises, slow decisions, distraction from the strategy" },
  { label: "the CFO", goals: "Margin, cost to serve and predictable spend", concerns: "Spend without a clear return, pilots that never pay" },
  { label: "the CTO", goals: "Reliability, security and engineering capacity", concerns: "Scope creep, tech debt, unclear requirements" },
  { label: "the board", goals: "Strategy, risk and returns", concerns: "Execution risk and anything that changes the plan" },
];

export function audienceOf(stakeholder: Stakeholder): Audience {
  const { person, profile } = stakeholder;
  return { label: profile.title ? `${person.name}, ${profile.title}` : person.name, goals: profile.goals, concerns: profile.concerns };
}

const describe = (audience: Audience) =>
  [`Audience: ${audience.label}.`, audience.goals ? `They are trying to achieve: ${audience.goals}.` : "", audience.concerns ? `They worry about: ${audience.concerns}.` : ""]
    .filter(Boolean)
    .join("\n");

export const TRANSLATE_SYSTEM = `You rewrite a product leader's text for one executive.
Lead with what this executive cares about, in their terms (money, risk, customers, time), and keep only the detail they need to decide or act.
Keep every fact; do not add numbers or claims that are not in the text. Plain English, short paragraphs, no headings unless the text had them.
Return only the rewritten text.`;

export function translatePrompt(text: string, audience: Audience): string {
  return `${describe(audience)}\n\nRewrite this for them:\n\n${text.trim()}`;
}

export const OBJECTIONS_SYSTEM = `You help a product leader prepare for a meeting with an executive.
List the objections or hard questions this executive is most likely to raise about the proposal, most likely first, at most six.
For each, give a short, honest answer the product leader could give, using only what the proposal says; where it has no answer, say what is missing.
Format each as:
**Objection:** ...
**Answer:** ...`;

export function objectionsPrompt(text: string, audience: Audience): string {
  return `${describe(audience)}\n\nThe proposal:\n\n${text.trim()}`;
}

export const SPEC_CHECK_SYSTEM = `You review a product spec or PRD before it goes to engineering and stakeholders.
Check it against: a clear problem and who has it; evidence; goals and non-goals; measurable success metrics with targets; requirements specific enough to build and test; edge cases and failure states; dependencies, risks and open questions; rollout and how it will be measured after launch; for healthcare, privacy and compliance considerations.
Start with a one-line verdict (Ready, Nearly ready, or Not ready). Then list the gaps, most important first, each with a concrete suggestion. Then note what is strong. Be specific to this spec; do not pad.`;

export const PREREAD_SYSTEM = `You draft sections of a one-page pre-read that leads with the ask, for a product leader.
Return only a JSON object with any of these keys you are asked to fill: "whyNow", "background", "options", "recommendation".
"options" lists two or three real alternatives, one per line, numbered. Keep each section to a few short sentences.
Use only the facts given; where a fact is missing, write [needs: ...] rather than inventing it.`;

export type PrereadSection = "whyNow" | "background" | "options" | "recommendation";

export const PREREAD_SECTIONS: PrereadSection[] = ["whyNow", "background", "options", "recommendation"];

export function prereadPrompt(input: {
  title: string;
  ask: string;
  filled: Partial<Record<PrereadSection, string>>;
  missing: PrereadSection[];
  audience: Audience | null;
  evidence: string[];
}): string {
  return [
    input.audience ? describe(input.audience) : "",
    `Title: ${input.title || "(none yet)"}`,
    `The ask: ${input.ask || "(none yet)"}`,
    ...PREREAD_SECTIONS.filter((key) => input.filled[key]?.trim()).map((key) => `${key}: ${input.filled[key]!.trim()}`),
    input.evidence.length > 0 ? `Evidence David chose to cite:\n${input.evidence.map((entry) => `- ${entry}`).join("\n")}` : "",
    `Fill these sections: ${input.missing.join(", ")}.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Reads the drafted sections, keeping only the ones asked for and only as text. */
export function parsePrereadDraft(answer: string, missing: PrereadSection[]): Partial<Record<PrereadSection, string>> {
  const raw = extractJson<Record<string, unknown>>(answer);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: Partial<Record<PrereadSection, string>> = {};
  for (const key of missing) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) result[key] = value.trim();
    else if (Array.isArray(value)) result[key] = value.map((entry, index) => `${index + 1}. ${String(entry)}`).join("\n");
  }
  return result;
}
