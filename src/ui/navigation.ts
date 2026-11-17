import { createContext, useContext } from "react";

/** The pages an empty state can send David to. */
export type Destination = "connections" | "team" | "captures";

export const NavigateContext = createContext<(to: Destination) => void>(() => {});

/** Lets an empty state open the page where its data comes from, without threading a callback through every page. */
export function useNavigate(): (to: Destination) => void {
  return useContext(NavigateContext);
}

/** Things any page can start that live at the app level. */
export interface AppActions {
  /** Opens "Meeting notes into actions", optionally for a meeting with one person. */
  openMeetingNotes: (personId?: number | null) => void;
}

export const AppActionsContext = createContext<AppActions>({ openMeetingNotes: () => {} });

export function useAppActions(): AppActions {
  return useContext(AppActionsContext);
}
