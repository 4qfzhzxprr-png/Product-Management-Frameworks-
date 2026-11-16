import { useEffect, useState } from "react";
import { CaptureStore } from "../core/store";
import { isTauri, openDb } from "../platform";

let storePromise: Promise<CaptureStore> | undefined;

async function openStore(): Promise<CaptureStore> {
  const store = await CaptureStore.open(await openDb());
  // The browser preview shows sample data. Adding ?empty to the address starts it blank, like a new install.
  if (!isTauri && !new URLSearchParams(window.location.search).has("empty")) {
    const { seedSampleData } = await import("../platform/sampleData");
    await seedSampleData(store);
  }
  return store;
}

/** One store per window, opened on first use. */
export function useStore(): { store: CaptureStore | null; error: string | null } {
  const [store, setStore] = useState<CaptureStore | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    storePromise ??= openStore();
    storePromise.then(setStore, (cause) => setError(`Could not open the local database. ${message(cause)}`));
  }, []);

  return { store, error };
}

export function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
