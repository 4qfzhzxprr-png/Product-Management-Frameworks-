import type { Connection } from "./connectors";

/** A first-run step on the Overview, and where to do it. */
export interface SetupStep {
  id: "calendar" | "tickets" | "team" | "manager" | "capture";
  label: string;
  detail: string;
  done: boolean;
}

export const SETUP_SETTINGS = "setup";

export interface SetupSettings {
  dismissed: boolean;
}

/**
 * What a new user should do first, worked out from what is already stored.
 * `manual` tells a file import from a connection that syncs on its own.
 */
export function setupSteps(input: {
  connections: Connection[];
  manual: (connection: Connection) => boolean;
  hasPMs: boolean;
  managerChosen: boolean;
  hasCaptures: boolean;
}): SetupStep[] {
  const { connections, manual } = input;
  return [
    {
      id: "calendar",
      label: "Connect your calendar",
      detail: "Meetings appear in the brief, on PM cards and in the handoff window.",
      done: connections.some((connection) => !manual(connection)),
    },
    {
      id: "tickets",
      label: "Import tickets",
      detail: "A CSV export from your tracker feeds delivery, epic health and the roadmap.",
      done: connections.some(manual),
    },
    {
      id: "team",
      label: "Add your PMs",
      detail: "Each PM gets a card and a 1:1 workspace.",
      done: input.hasPMs,
    },
    {
      id: "manager",
      label: "Choose who you report to",
      detail: "Used for 1:1 prep and the weekly update.",
      done: input.managerChosen,
    },
    {
      id: "capture",
      label: "Try quick capture",
      detail: "Control-Option-Space from anywhere on the Mac.",
      done: input.hasCaptures,
    },
  ];
}

/** The number shown in the menu bar and on the Overview: open captures waiting on David plus items needing his decision. */
export function waitingTotal(capturesWaiting: number, decisions: number): number {
  return capturesWaiting + decisions;
}
