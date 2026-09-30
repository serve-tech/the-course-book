import { useOutletContext } from "react-router";

/**
 * Shell services the layout route provides to every page through the
 * router outlet context.
 */
/** A follow-up the toast offers, such as Undo: fields posted to the `/journal` action. */
export interface ToastAction {
  label: string;
  fields: Record<string, string>;
}

/** Show a transient toast message; one with a follow-up button stays up longer. */
export type Notify = (message: string, followUp?: ToastAction) => void;

export interface Shell {
  /** Show a transient toast message, optionally with a follow-up button. */
  notify: Notify;
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
