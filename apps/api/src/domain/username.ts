/**
 * Username rule shared by the sign-up UI and server-side provisioning.
 * Clerk enforces its own username settings; this pattern is the product's
 * stricter rule and is re-checked when an account row is created.
 */
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,24}$/;

export const USERNAME_RULE =
  "Username must be 3–24 characters using letters, numbers, or _.";

export function isValidUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value);
}
