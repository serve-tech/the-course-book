import createClient, { type Middleware } from "openapi-fetch";
import type { components, paths } from "./schema";

/**
 * Typed client for the coursebook.golf API, generated from
 * contract/openapi.json (the same contract the iOS and Android apps use).
 */

export type ApiSchemas = components["schemas"];

/** A failed API call, with the error envelope's stable code. */
export class ApiError extends Error {
  /**
   * Args:
   *     status: HTTP status.
   *     code: The envelope's `code` (e.g. `not_on_list`), or `http_<status>`
   *         when the body was not an envelope.
   *     message: Text to show the member.
   *     requestId: Server request id for support, when known.
   */
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId: string | null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Public operations are called without a token so shared caches can keep them. */
const PUBLIC_PATHS: ReadonlySet<string> = new Set(["/v1/rankings", "/v1/client-config"]);

const isEnvelope = (value: unknown): value is ApiSchemas["ApiError"] =>
  typeof value === "object" &&
  value !== null &&
  "error" in value &&
  typeof value.error === "object" &&
  value.error !== null &&
  "code" in value.error &&
  "message" in value.error;

/** Build an ApiError from a failed response's parsed body. */
export function toApiError(body: unknown, response: Response): ApiError {
  if (isEnvelope(body))
    return new ApiError(response.status, body.error.code, body.error.message, body.error.requestId);
  return new ApiError(
    response.status,
    "http_" + String(response.status),
    "The server could not complete the request. Please try again.",
    response.headers.get("x-request-id"),
  );
}

/** A response's data, or its error envelope thrown as an ApiError. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (!result.response.ok || result.data === undefined) throw toApiError(result.error, result.response);
  return result.data;
}

/** Throw the error envelope of a failed response that carries no data (204). */
export function expectOk(result: { error?: unknown; response: Response }): void {
  if (!result.response.ok) throw toApiError(result.error, result.response);
}

/**
 * Counts requests pending longer than `delayMs` and reports when that
 * changes between none and some; drives the "waking the server" notice
 * (a free Render instance takes about a minute to wake).
 */
export function createSlowTracker(delayMs: number, onChange: (slow: boolean) => void) {
  let slowCount = 0;
  const report = (before: number) => {
    if ((before > 0) !== (slowCount > 0)) onChange(slowCount > 0);
  };
  return {
    /** Mark a request started; call the returned function when it settles. */
    start(): () => void {
      let fired = false;
      const timer = setTimeout(() => {
        fired = true;
        slowCount += 1;
        report(slowCount - 1);
      }, delayMs);
      return () => {
        clearTimeout(timer);
        if (fired) {
          slowCount -= 1;
          report(slowCount + 1);
        }
      };
    },
  };
}

export interface ApiClientOptions {
  /** API origin, e.g. https://api.coursebook.golf. */
  baseUrl: string;
  /** The current Clerk session token, or null when signed out. */
  getToken: () => Promise<string | null>;
  /** Told when some request has been pending longer than `slowAfterMs`. */
  onSlow?: (slow: boolean) => void;
  /** Defaults to 3 seconds. */
  slowAfterMs?: number;
  /** Abort a request after this long. Defaults to 90 seconds, beyond a cold start. */
  timeoutMs?: number;
  /** Sends a prepared request; injected in tests. */
  fetch?: (request: Request) => Promise<Response>;
}

export function createApiClient(options: ApiClientOptions) {
  const tracker = createSlowTracker(options.slowAfterMs ?? 3_000, options.onSlow ?? (() => undefined));
  const send = options.fetch ?? ((input: Request) => globalThis.fetch(input));
  const timeoutMs = options.timeoutMs ?? 90_000;
  const client = createClient<paths>({
    baseUrl: options.baseUrl,
    credentials: "omit",
    fetch: async (request: Request) => {
      const settle = tracker.start();
      try {
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]);
        return await send(new Request(request, { signal }));
      } finally {
        settle();
      }
    },
  });
  const bearer: Middleware = {
    async onRequest({ request, schemaPath }) {
      if (PUBLIC_PATHS.has(schemaPath)) return request;
      const token = await options.getToken();
      if (token) request.headers.set("Authorization", "Bearer " + token);
      return request;
    },
  };
  client.use(bearer);
  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;
