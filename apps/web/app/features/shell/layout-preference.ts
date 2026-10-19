import { preferences, type SafeStorage } from "../../shared/lib/storage";
import {
  LAYOUT_PREFERENCE_KEY,
  LayoutMode,
  resolveLayout,
} from "./layout-preview";

/** Browser-only: use from a clientLoader, effect or event handler. */
export function readLayoutPreference(
  storage: () => SafeStorage = preferences,
): LayoutMode {
  try {
    return resolveLayout(storage().read(LAYOUT_PREFERENCE_KEY));
  } catch (error) {
    // Some browsers block access to the localStorage property itself.
    console.warn("Could not access the layout preference", error);
    return LayoutMode.Classic;
  }
}

/** A failed write leaves the current layout in place; the UI explains how to retry. */
export function saveLayoutPreference(
  layout: LayoutMode,
  storage: () => SafeStorage = preferences,
): boolean {
  try {
    return storage().write(LAYOUT_PREFERENCE_KEY, layout);
  } catch (error) {
    console.warn("Could not access the layout preference", error);
    return false;
  }
}
