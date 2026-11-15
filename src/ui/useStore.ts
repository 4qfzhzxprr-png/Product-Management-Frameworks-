import { useEffect, useState } from "react";
import { CaptureStore } from "../core/store";
import { openDb } from "../platform";

let storePromise: Promise<CaptureStore> | undefined;

/** One store per window, opened on first use. */
export function useStore(): { store: CaptureStore | null; error: string | null } {
  const [store, setStore] = useState<CaptureStore | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    storePromise ??= openDb().then((db) => CaptureStore.open(db));
    storePromise.then(setStore, (cause) => setError(`Could not open the local database. ${message(cause)}`));
  }, []);

  return { store, error };
}

export function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
