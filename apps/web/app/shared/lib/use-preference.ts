import { useCallback, useSyncExternalStore } from "react";
import { preferences } from "./storage";

const CHANGE_EVENT = "coursebook:preference";

/**
 * Read and write one browser preference (localStorage) as React state.
 *
 * Implemented with `useSyncExternalStore` so server rendering and hydration
 * use the empty server snapshot and the client value appears on the first
 * client render without a state update inside an effect.
 *
 * Args:
 *     key: Storage key.
 *
 * Returns:
 *     `[value, setValue]`; `value` is "" when unset or unavailable and
 *     `setValue("")` removes the key.
 */
export function usePreference(key: string): [string, (value: string) => void] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const listener = (event: Event) => {
        if (
          event instanceof StorageEvent
            ? event.key === null || event.key === key
            : (event as CustomEvent<string>).detail === key
        )
          onChange();
      };
      window.addEventListener("storage", listener);
      window.addEventListener(CHANGE_EVENT, listener);
      return () => {
        window.removeEventListener("storage", listener);
        window.removeEventListener(CHANGE_EVENT, listener);
      };
    },
    [key],
  );
  const value = useSyncExternalStore(
    subscribe,
    () => preferences().read(key) ?? "",
    () => "",
  );
  const setValue = useCallback(
    (next: string) => {
      const store = preferences();
      if (next) store.write(key, next);
      else store.remove(key);
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: key }));
    },
    [key],
  );
  return [value, setValue];
}
