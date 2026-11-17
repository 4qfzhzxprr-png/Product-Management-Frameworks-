import { useEffect, useRef } from "react";
import type { HandoffSettings } from "../core/handoff";
import { completeReminderSettings, dueReminders, pruneShown, REMINDER_SETTINGS, type Reminder, type ReminderSettings, type ReminderState } from "../core/reminders";
import type { CaptureStore } from "../core/store";
import { notify } from "../platform";

const SHOWN = "reminders-shown";
/** The last reminders, newest first, listed under Settings. */
export const REMINDER_HISTORY = "reminders-history";

export interface ShownReminder {
  at: number;
  title: string;
  body: string;
  /** False where notifications are off or unavailable (the browser preview). */
  notified: boolean;
}
const CHECK_EVERY_MS = 60_000;

/**
 * Checks once a minute, in the main window only, for reminders that are due, and shows each
 * once as a Mac notification. Every reminder is also kept in a short history under Settings.
 */
export function useReminders(store: CaptureStore, ready: boolean, state: () => Omit<ReminderState, "handoff">) {
  const stateRef = useRef(state);
  stateRef.current = state;
  const busy = useRef(false);

  useEffect(() => {
    if (!ready) return;
    const check = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const now = Date.now();
        const settings = completeReminderSettings(await store.settings.get<Partial<ReminderSettings>>(REMINDER_SETTINGS));
        const handoff = await store.settings.get<HandoffSettings>("handoff");
        const shown = (await store.settings.get<Record<string, number>>(SHOWN)) ?? {};
        const due = dueReminders({ ...stateRef.current(), handoff }, settings, now, new Set(Object.keys(shown)));
        if (due.length === 0) return;
        // Several slipped promises at once become one notice, not a stack of them.
        const slipped = due.filter((entry) => entry.key.startsWith("slipped:"));
        const toShow: Reminder[] =
          slipped.length > 2
            ? [...due.filter((entry) => !entry.key.startsWith("slipped:")), { key: "", title: `${slipped.length} promises have slipped`, body: "See Commitments for which ones.", view: "commitments" }]
            : due;
        const history = (await store.settings.get<ShownReminder[]>(REMINDER_HISTORY)) ?? [];
        for (const reminder of toShow) {
          const notified = await notify(reminder.title, reminder.body).catch(() => false);
          history.unshift({ at: now, title: reminder.title, body: reminder.body, notified });
        }
        await store.settings.set(REMINDER_HISTORY, history.slice(0, 30));
        const next = pruneShown({ ...shown, ...Object.fromEntries(due.map((entry) => [entry.key, now])) }, now);
        await store.settings.set(SHOWN, next);
      } catch (cause) {
        console.warn("Reminder check failed:", cause);
      } finally {
        busy.current = false;
      }
    };
    void check();
    const timer = setInterval(() => void check(), CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [ready, store]);
}
