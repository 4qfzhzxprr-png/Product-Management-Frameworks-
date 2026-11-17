import type { AgentRun } from "./agents";
import type { Priority, RoadmapItem } from "./leadership";
import { KIND_LABELS, namesOf, type Capture, type Person, type Project } from "./models";
import type { WorkItem } from "./work";

/** One place to find anything: what Command-K searches, and where each result leads. */

export type SearchTarget =
  | { type: "page"; view: string }
  | { type: "capture"; capture: Capture }
  | { type: "person"; person: Person }
  | { type: "project"; project: Project }
  | { type: "work"; item: WorkItem }
  | { type: "run"; run: AgentRun }
  | { type: "roadmap" }
  | { type: "priority" };

export interface SearchResult {
  /** What kind of thing it is, shown as a label. */
  group: string;
  title: string;
  detail: string;
  target: SearchTarget;
  score: number;
}

export interface SearchData {
  pages: { view: string; label: string }[];
  captures: Capture[];
  people: Person[];
  projects: Project[];
  work: WorkItem[];
  runs: AgentRun[];
  roadmap: RoadmapItem[];
  priorities: Priority[];
  now: number;
}

const words = (query: string) => query.toLowerCase().split(/\s+/).filter(Boolean);

/** Every word must appear; a title that starts with the query ranks first, then whole words. */
function match(query: string, text: string): number {
  const haystack = text.toLowerCase();
  const terms = words(query);
  if (terms.length === 0 || !terms.every((term) => haystack.includes(term))) return 0;
  const phrase = query.trim().toLowerCase();
  if (haystack.startsWith(phrase)) return 3;
  if (new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(haystack)) return 2;
  return 1;
}

const day = (time: number) => new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function search(query: string, data: SearchData, limit = 30): SearchResult[] {
  if (!query.trim()) return [];
  const name = (id: number | null) => data.people.find((person) => person.id === id)?.name;
  const results: SearchResult[] = [];
  const add = (score: number, result: Omit<SearchResult, "score">, boost = 0) => {
    if (score > 0) results.push({ ...result, score: score * 10 + boost });
  };

  for (const page of data.pages) add(match(query, page.label), { group: "Page", title: page.label, detail: "Go to page", target: { type: "page", view: page.view } }, 5);
  for (const person of data.people) {
    add(Math.max(...namesOf(person).map((entry) => match(query, entry))), {
      group: "Person",
      title: person.name,
      detail: [person.isPM ? "PM: open the 1:1 workspace" : "Show their captures", person.aliases.length ? `also ${person.aliases.join(", ")}` : null].filter(Boolean).join(" · "),
      target: { type: "person", person },
    }, 4);
  }
  for (const project of data.projects) add(match(query, project.name), { group: "Project", title: project.name, detail: "Show its captures", target: { type: "project", project } }, 3);
  for (const capture of data.captures) {
    const ageDays = (data.now - capture.createdAt) / 86_400_000;
    add(match(query, `${capture.body} ${name(capture.personId) ?? ""}`), {
      group: "Capture",
      title: capture.body.split("\n")[0],
      detail: [KIND_LABELS[capture.kind], name(capture.personId), day(capture.createdAt), capture.doneAt ? "done" : null].filter(Boolean).join(" · "),
      target: { type: "capture", capture },
    }, Math.max(0, 2 - ageDays / 30));
  }
  for (const item of data.work) {
    add(match(query, `${item.externalId} ${item.title} ${item.ownerName}`), {
      group: item.level === "epic" ? "Epic" : "Ticket",
      title: `${item.externalId} ${item.title}`,
      detail: [item.statusLabel || item.status, item.ownerName, item.team].filter(Boolean).join(" · "),
      target: { type: "work", item },
    }, 1);
  }
  for (const run of data.runs) {
    add(match(query, `${run.title} ${run.brief} ${run.agentName}`), {
      group: "Agent run",
      title: run.title,
      detail: `${run.agentName} · ${day(run.startedAt)}`,
      target: { type: "run", run },
    }, 1);
  }
  for (const item of data.roadmap) add(match(query, `${item.title} ${item.notes}`), { group: "Roadmap", title: item.title, detail: item.committedAt ? `Promised for ${day(item.committedAt)}` : "No date", target: { type: "roadmap" } }, 2);
  for (const priority of data.priorities) add(match(query, `${priority.title} ${priority.notes}`), { group: "Priority", title: priority.title, detail: "The CPO's priorities", target: { type: "priority" } }, 2);

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
