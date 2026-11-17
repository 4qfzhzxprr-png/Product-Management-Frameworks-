import type { AgentFile } from "../core/agents";

/**
 * Invented agent files for the browser preview only. The Mac app reads David's real files from
 * his agent folder; these exist so the Agents page can be tried and tested in a browser.
 */
const agent = (name: string, description: string, tools: string | null, model: string | null, body: string): AgentFile => ({
  fileName: `${name}.md`,
  text: [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    ...(tools ? [`tools: ${tools}`] : []),
    ...(model ? [`model: ${model}`] : []),
    "---",
    "",
    body,
  ].join("\n"),
});

export const SAMPLE_AGENT_FILES: AgentFile[] = [
  agent(
    "product-lead",
    "Leads the product agent team. Breaks a request into tasks, hands each to the right specialist and assembles the answer.",
    "Task, Read, Grep, Glob",
    "opus",
    "You lead eight specialist agents. Plan the work, delegate, check what comes back, and return one finished answer.",
  ),
  agent(
    "market-researcher",
    "Competitor, pricing and market scans for pharmacy and healthcare software.",
    "WebSearch, WebFetch, Read",
    "sonnet",
    "Research competitors and the market. Cite every source with a link.",
  ),
  agent(
    "customer-insights",
    "Synthesizes interview notes, support tickets and feedback into themes with evidence.",
    "Read, Grep, Glob",
    "sonnet",
    "Find patterns in customer evidence. Rank themes by how often they appear and how much they matter.",
  ),
  agent(
    "spec-writer",
    "Drafts PRDs and feature specs from a brief: problem, goals, non-goals, requirements, metrics.",
    "Read, Grep, Write",
    "opus",
    "Write clear, testable specs in the team's PRD template.",
  ),
  agent(
    "data-analyst",
    "Reads metric exports and explains what changed, why it might have, and what to check next.",
    "Read, Bash",
    "sonnet",
    "Analyse data carefully. Say what the numbers show and what they do not.",
  ),
  agent(
    "ux-reviewer",
    "Reviews flows and copy for usability and accessibility problems, ranked by severity.",
    "Read, WebFetch",
    "sonnet",
    "Review designs against usability heuristics and WCAG 2.1 AA.",
  ),
  agent(
    "roadmap-planner",
    "Turns priorities and delivery data into a now, next, later roadmap and flags what is at risk.",
    "Read, Grep",
    "sonnet",
    "Plan the roadmap from priorities and capacity. Be explicit about trade-offs.",
  ),
  agent(
    "release-notes-writer",
    "Writes customer-facing release notes and internal changelogs from shipped tickets.",
    "Read",
    "haiku",
    "Write short, plain release notes. Lead with what the customer can now do.",
  ),
  agent(
    "stakeholder-comms",
    "Drafts updates for executives in the format each one prefers, leading with the ask.",
    "Read",
    "sonnet",
    "Write for busy executives: the point first, then the evidence, then the ask.",
  ),
];

/** A stand-in answer for a preview run, built from the brief so it reads sensibly. */
export function sampleOutput(agentName: string, prompt: string): string {
  const brief = prompt.split("\n---\n")[0].trim();
  return [
    `Preview only: no agent ran. In the Mac app, ${agentName} answers here.`,
    "",
    `Brief: ${brief.split("\n")[0]}`,
    "",
    "## Summary",
    "- Three findings, each with its evidence.",
    "- One recommendation and what it would take.",
    "",
    "## Next steps",
    "1. Review this draft.",
    "2. Approve it, or send it back with what to change.",
  ].join("\n");
}

/**
 * A stand-in answer for a plain question to Claude in the preview, by purpose. Meeting notes are
 * read with the same simple rules the app falls back on, so the preview behaves sensibly.
 */
export async function samplePurposeAnswer(purpose: string, prompt: string): Promise<string> {
  if (purpose === "meeting-actions") {
    const { proposeByRules } = await import("../core/meetingNotes");
    const names = /People David works with: (.+)\.$/m.exec(prompt)?.[1].split(", ") ?? [];
    const people = names.map((name, index) => ({ id: index + 1, name, isPM: false, aliases: [] }));
    const withName = /This was a meeting with (.+)\.$/m.exec(prompt)?.[1] ?? null;
    const notes = prompt.split("\nNotes:\n")[1] ?? prompt;
    const found = proposeByRules(notes, people, Date.now(), people.find((person) => person.name === withName) ?? null);
    return JSON.stringify(
      found.map((item) => ({
        kind: item.kind,
        text: item.text,
        person: people.find((person) => person.id === item.personId)?.name ?? null,
        due: item.due || null,
      })),
    );
  }
  return `Preview only: Claude was not asked. In the Mac app, the answer for "${purpose}" appears here.\n\n${prompt.split("\n").slice(0, 3).join("\n")}`;
}
