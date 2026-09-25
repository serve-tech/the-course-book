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
