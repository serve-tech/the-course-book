/**
 * Top-level fields of the published OpenAPI document. Version 3.0.3 because
 * the Kotlin generator's 3.1 support is still beta (see
 * .planning/research/2026-09-25-api-split-spikes.md).
 */
export const documentConfig = {
  openapi: "3.0.3",
  info: {
    title: "coursebook.golf API",
    version: "1.0.0",
    description:
      "JSON API for the coursebook.golf web, iOS and Android clients. " +
      "Authenticate with a Clerk session token: `Authorization: Bearer <token>`. " +
      "Every failure returns the ApiError envelope. The contract only grows: fields and error codes are added, never renamed or removed.",
  },
  servers: [{ url: "https://api.coursebook.golf" }],
};

/** Name of the bearer security scheme referenced by secured operations. */
export const SECURITY_SCHEME = "ClerkSession";
