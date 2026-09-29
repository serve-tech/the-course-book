import { ApiError } from "../../lib/api/client";

export function errorMessage(
  error: unknown,
  fallback = "Unable to complete this request.",
): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  )
    return error.message;
  return fallback;
}

/**
 * The member-facing message for a failed API call: the API's own message, a
 * timeout or a network failure.
 *
 * Returns:
 *     The message, or null for any other error (a bug, not a failed call);
 *     each caller decides whether to rethrow it or report something generic.
 */
export function apiFailureMessage(error: unknown): string | null {
  if (error instanceof ApiError) return error.message;
  if (error instanceof DOMException && error.name === "TimeoutError")
    return "The server took too long to answer. Please try again.";
  if (error instanceof TypeError) return "Could not reach the server. Check your connection and try again.";
  return null;
}
