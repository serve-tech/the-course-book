/**
 * Whether a URL hash is a step of the sign-in dialog's Clerk flow.
 *
 * The dialog's `<SignIn routing="hash">` keeps its steps in the hash
 * (`#/factor-one`, `#/create/continue`, …), and an OAuth provider returns
 * to the page the dialog was opened on with one (`#/create/sso-callback`,
 * observed 2026-10-05). The app has no hash routes of its own, so any hash
 * starting with `#/` belongs to Clerk.
 *
 * @param hash - `location.hash`, including the leading `#`.
 * @returns True when the dialog has to be open to finish the step.
 */
export function isClerkFlowHash(hash: string): boolean {
  return hash.startsWith("#/");
}
