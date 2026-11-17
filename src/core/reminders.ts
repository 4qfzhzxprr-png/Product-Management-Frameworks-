import { commitmentBoard } from "./commitments";
import { overlap, type HandoffSettings } from "./handoff";
import type { Capture } from "./models";

/**
 * When to nudge David. Each reminder has a key; one that was already shown is never shown again,
 * so the once-a-minute check can run freely.
 */

export const REMINDER_SETTINGS = "reminders";

export interface ReminderSettings {
  enabled: boolean;
  /** "HH:MM" on weekdays. Empty for no morning summary. */
  morning: string;
  slipping: boolean;
  /** Minutes before the shared hours with the offshore team end. 0 for none. */
  handoffLead: number;
  agents: boolean;
  /** The weekly review prompt on Fridays at this time, "HH:MM". Empty for none. */
  weekly: string;
}

export function completeReminderSettings(saved: Partial<ReminderSettings> | null): ReminderSettings {
  return {
    enabled: saved?.enabled ?? true,
    morning: saved?.morning ?? "08:30",
    slipping: saved?.slipping ?? true,
    handoffLead: saved?.handoffLead ?? 30,
    agents: saved?.agents ?? true,
    weekly: saved?.weekly ?? "16:00",
  };
}

export interface Reminder {
  key: string;
  title: string;
  body: string;
  /** The page it is about. */
  view: "overview" | "commitments" | "handoff" | "agents" | "review";
}

export interface ReminderState {
  captures: Capture[];
  /** Items waiting on David's decision. */
  decisions: number;
  handoff: HandoffSettings | null;
  /** Finished agent runs waiting for review: id, agent and title. */
  agentRuns: { id: number; agentName: string; title: string }[];
}

const ymd = (time: number) => {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

function at(now: number, time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const date = new Date(now);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), Number(match[1]), Number(match[2])).getTime();
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** The reminders due now that have not been shown. */
export function dueReminders(state: ReminderState, settings: ReminderSettings, now: number, shown: Set<string>): Reminder[] {
  if (!settings.enabled) return [];
  const reminders: Reminder[] = [];
  const today = new Date(now);
  const weekday = today.getDay() >= 1 && today.getDay() <= 5;
  const board = commitmentBoard(state.captures, now);

  // The morning summary, once, from its time until noon (a late start still gets it).
  const morning = at(now, settings.morning);
  if (weekday && morning !== null && now >= morning && today.getHours() < 12) {
    const dueToday = board.mine.filter((entry) => entry.dueInDays === 0).length;
    const slipped = board.mine.filter((entry) => entry.slippedDays > 0).length;
    const waiting = board.mine.length;
    const parts = [
      waiting > 0 ? `${plural(waiting, "promise or ask", "promises and asks")} open` : null,
      dueToday > 0 ? `${dueToday} due today` : null,
      slipped > 0 ? `${slipped} slipped` : null,
      state.decisions > 0 ? plural(state.decisions, "decision") + " waiting" : null,
    ].filter(Boolean);
    reminders.push({
      key: `morning:${ymd(now)}`,
      title: "Good morning",
      body: parts.length > 0 ? `${parts.join(", ")}.` : "Nothing is waiting on you.",
      view: "overview",
    });
  }

  // A promise that has just slipped: once per promise.
  if (settings.slipping) {
    for (const entry of board.mine.filter((item) => item.slippedDays > 0)) {
      reminders.push({
        key: `slipped:${entry.capture.id}`,
        title: "A promise has slipped",
        body: `${entry.capture.body} was due ${plural(entry.slippedDays, "day")} ago.`,
        view: "commitments",
      });
    }
  }

  // Before the shared hours with the offshore team end, on weekdays.
  if (weekday && settings.handoffLead > 0 && state.handoff?.offshoreZone) {
    const hours = overlap(state.handoff, now);
    if (hours.window) {
      const [, end] = hours.window;
      if (now >= end - settings.handoffLead * 60_000 && now < end) {
        reminders.push({
          key: `handoff:${ymd(now)}`,
          title: "Handoff window closing",
          body: `The offshore team's shared hours end in ${Math.max(1, Math.round((end - now) / 60_000))} minutes. Send the handoff note.`,
          view: "handoff",
        });
      }
    }
  }

  if (settings.agents) {
    for (const run of state.agentRuns) {
      reminders.push({ key: `run:${run.id}`, title: `${run.agentName} finished`, body: `${run.title} is waiting for your review.`, view: "agents" });
    }
  }

  const weekly = at(now, settings.weekly);
  if (today.getDay() === 5 && weekly !== null && now >= weekly) {
    reminders.push({ key: `weekly:${ymd(now)}`, title: "Weekly review", body: "Five minutes on what shipped, what slipped and next week's three priorities.", view: "review" });
  }

  return reminders.filter((reminder) => !shown.has(reminder.key));
}

/** Keeps the record of shown reminders small: keys older than two weeks are dropped. */
export function pruneShown(shown: Record<string, number>, now: number): Record<string, number> {
  return Object.fromEntries(Object.entries(shown).filter(([, time]) => now - time < 14 * 86_400_000));
}
