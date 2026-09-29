import type { SearchResult } from "@coursebook/domain/catalog/search-results";
import { createApp, type AppDependencies, type Logger, type RequestLog } from "../app";
import { createClerkSessionVerifier } from "../auth/session";
import type { Database } from "../db/client";
import { createProvisioner, provisionUser } from "../services/provisioning";
import { createTestTokens, TEST_PUBLISHABLE_KEY, TEST_SECRET_KEY } from "./tokens";

/** The web origin the test app trusts. */
export const WEB_ORIGIN = "http://127.0.0.1:3000";

export const TEST_CLIENT_CONFIG = {
  minimumVersions: { ios: "1.0.0", android: "1.0.0" },
  privacyUrl: "https://coursebook.golf/privacy",
  accountDeletionUrl: "https://coursebook.golf/account",
};

/**
 * The real API over the test database. Tokens are signed locally and checked
 * by the real Clerk verifier; only the external services are replaced:
 * course discovery (`setSearchResults`) and Clerk account deletion
 * (`deletedAccounts`, `failAccountDeletion`).
 */
export function createTestApp(db: Database, overrides: Partial<AppDependencies> = {}) {
  const tokens = createTestTokens();
  const requests: RequestLog[] = [];
  const errors: unknown[] = [];
  let searchResults: SearchResult[] | Error = [];
  const deletedAccounts: string[] = [];
  let accountDeletionFailure: Error | null = null;
  const logger: Logger = {
    request: (entry) => requests.push(entry),
    error: (_message, detail) => errors.push(detail),
  };
  const app = createApp({
    db,
    verifySession: createClerkSessionVerifier({
      secretKey: TEST_SECRET_KEY,
      publishableKey: TEST_PUBLISHABLE_KEY,
      jwtKey: tokens.jwtKey,
      webOrigins: [WEB_ORIGIN],
    }),
    accounts: {
      deleteUser: (clerkId) => {
        if (accountDeletionFailure) return Promise.reject(accountDeletionFailure);
        deletedAccounts.push(clerkId);
        return Promise.resolve();
      },
    },
    provisioner: createProvisioner({
      provision: (clerkId, identity) => provisionUser(db, clerkId, identity),
      fetchIdentity: () => Promise.reject(new Error("test tokens always carry identity claims")),
    }),
    search: {
      search: (query) =>
        searchResults instanceof Error
          ? Promise.reject(searchResults)
          : Promise.resolve(searchResults.filter((result) => result.course.name.toLowerCase().includes(query.toLowerCase()))),
    },
    webOrigins: [WEB_ORIGIN],
    clientConfig: TEST_CLIENT_CONFIG,
    logger,
    ...overrides,
  });

  /** Authorization header for a member with the usual identity claims. */
  const bearer = (clerkId: string, username: string, extra: Record<string, unknown> = {}) => ({
    authorization:
      "Bearer " + tokens.issue({ sub: clerkId, username, name: username + " Name", email: username + "@example.com", ...extra }),
  });

  return {
    app,
    tokens,
    requests,
    errors,
    bearer,
    setSearchResults: (value: SearchResult[] | Error) => {
      searchResults = value;
    },
    deletedAccounts,
    failAccountDeletion: (error: Error | null) => {
      accountDeletionFailure = error;
    },
    /** Send a JSON body (or a raw string) with the given method. */
    send: async (method: string, path: string, body: unknown, headers: Record<string, string> = {}) => {
      const response = await app.request(path, {
        method,
        headers: { "content-type": "application/json", ...headers },
        body: typeof body === "string" ? body : JSON.stringify(body),
      });
      const type = response.headers.get("content-type") ?? "";
      const parsed: unknown = type.includes("json") ? await response.json() : await response.text();
      return { status: response.status, headers: response.headers, body: parsed };
    },
    /** GET with optional headers, parsed as JSON when the body is JSON. */
    get: async (path: string, headers: Record<string, string> = {}) => {
      const response = await app.request(path, { headers });
      const type = response.headers.get("content-type") ?? "";
      const body: unknown = type.includes("json") ? await response.json() : await response.text();
      return { status: response.status, headers: response.headers, body };
    },
  };
}
