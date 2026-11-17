import { useCallback, useEffect, useRef, useState } from "react";
import { createRegistry } from "../core/connectors/index";
import { syncAll, type SyncReport } from "../core/connectors";
import type { CaptureStore } from "../core/store";
import { platformHttp, platformSecrets } from "../platform";

/** How often connections sync while the app is open. */
export const SYNC_EVERY_MINUTES = 15;

export const registry = createRegistry();

/**
 * Syncs every connection when the app opens and every 15 minutes after, and on request.
 * Runs in the main window only, so two windows never sync at once.
 */
export function useSync(store: CaptureStore | null, onSynced: () => Promise<void>) {
  const [syncing, setSyncing] = useState(false);
  const [lastRun, setLastRun] = useState<number | null>(null);
  const [reports, setReports] = useState<SyncReport[]>([]);
  const running = useRef(false);

  const syncNow = useCallback(async () => {
    if (!store || running.current) return;
    running.current = true;
    setSyncing(true);
    try {
      const results = await syncAll({
        registry,
        connections: store.connections,
        items: store.items,
        work: store.work,
        calendar: store.calendar,
        secrets: platformSecrets(),
        http: platformHttp(),
      });
      setReports(results);
      setLastRun(Date.now());
      if (results.length > 0) await onSynced();
    } finally {
      running.current = false;
      setSyncing(false);
    }
  }, [store, onSynced]);

  useEffect(() => {
    if (!store) return;
    void syncNow();
    const timer = window.setInterval(() => void syncNow(), SYNC_EVERY_MINUTES * 60_000);
    return () => window.clearInterval(timer);
    // Start once per store; syncNow changing must not restart the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  return { syncing, lastRun, reports, syncNow };
}
