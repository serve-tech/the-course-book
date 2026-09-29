import { useOutletContext } from "react-router";

/**
 * Shell services the layout route provides to every page through the
 * router outlet context.
 */
export interface Shell {
  /** Show a transient toast message. */
  notify: (message: string) => void;
  /** Two-letter US state code chosen for Best in State and My List filters, or "". */
  selectedState: string;
  /** Persist a new selected state ("" clears it). */
  onState: (code: string) => void;
  /** Toggle the mobile search layout while a search input has focus. */
  searchFocus: (focused: boolean) => void;
  /** Open the account dialog. */
  openAuth: () => void;
}

export function useShell(): Shell {
  return useOutletContext<Shell>();
}
