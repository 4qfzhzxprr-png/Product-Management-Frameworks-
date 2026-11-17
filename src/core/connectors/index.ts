import { ConnectorRegistry } from "../connectors";
import { icalConnector } from "./ical";
import { ticketFileConnector } from "./ticketFile";

/**
 * Every connector the app ships with. A new kind of system means one new file in this folder
 * and one line here; nothing else in the app changes.
 */
export function createRegistry(): ConnectorRegistry {
  return new ConnectorRegistry().register(icalConnector).register(ticketFileConnector);
}
