import { createContext, useContext } from "react";

/** The pages an empty state can send David to. */
export type Destination = "connections" | "team" | "captures";

export const NavigateContext = createContext<(to: Destination) => void>(() => {});

/** Lets an empty state open the page where its data comes from, without threading a callback through every page. */
export function useNavigate(): (to: Destination) => void {
  return useContext(NavigateContext);
}
