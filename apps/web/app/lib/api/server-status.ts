import { useSyncExternalStore } from "react";

/**
 * Whether some API request has been pending long enough that the server is
 * probably waking up (a free Render instance sleeps after 15 idle minutes and
 * takes about a minute to start).
 */
let waking = false;
const listeners = new Set<() => void>();

export const serverStatus = {
  set: (value: boolean): void => {
    if (value === waking) return;
    waking = value;
    for (const listener of listeners) listener();
  },
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: (): boolean => waking,
};

/** True while the API is slow to answer; false during server rendering. */
export function useServerWaking(): boolean {
  return useSyncExternalStore(serverStatus.subscribe, serverStatus.get, () => false);
}
