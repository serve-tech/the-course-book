/**
 * Join class names, skipping missing ones. CSS module lookups are typed
 * `string | undefined` under `noUncheckedIndexedAccess`, and some props
 * (React Router's `NavLink` `className`) do not accept undefined.
 *
 * Example:
 *     cx(styles.tab, active && styles.active) // "tab_x1 active_x2" or "tab_x1"
 */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}
