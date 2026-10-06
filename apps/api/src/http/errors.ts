import type { Hook } from "@hono/zod-openapi";
import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiError } from "../contract/schemas";
import { AppError, causeChain, ErrorCode } from "../services/errors";
import type { AppEnv } from "./env";
import { loggableError, type LoggedError } from "./loggable-error";

/**
 * One error envelope for every failure: `{ error: { code, message,
 * requestId, fields } }`. Services throw `AppError`; Hono raises
 * `HTTPException` for malformed bodies (400), oversized bodies (413) and
 * wrong content types (415); anything else is an internal error, logged with
 * its request id and never echoed to the client.
 */

type FieldError = NonNullable<ApiError["error"]["fields"]>[number];

export function errorBody(
  c: Context<AppEnv>,
  code: ErrorCode,
  message: string,
  fields: FieldError[] | null = null,
): ApiError {
  return { error: { code, message, requestId: c.get("requestId"), fields } };
}

const GENERIC_INVALID = "Some of the information sent is not valid.";

/**
 * Validation failures from route schemas become 400 `validation_failed` with
 * per-field messages. The summary is the first custom message (Zod's
 * built-in messages start with "Invalid" and are too technical to show).
 */
export const validationHook: Hook<unknown, AppEnv, string, unknown> = (result, c) => {
  if (result.success) return;
  const fields = result.error.issues.map((issue) => ({
    path: issue.path.map(String).join(".") || "(body)",
    message: issue.message,
  }));
  const summary = fields.find((field) => !field.message.startsWith("Invalid"))?.message;
  return c.json(errorBody(c, ErrorCode.ValidationFailed, summary ?? GENERIC_INVALID, fields), 400);
};

const exceptionCodes: Partial<Record<ContentfulStatusCode, ErrorCode>> = {
  400: ErrorCode.BadRequest,
  401: ErrorCode.Unauthenticated,
  404: ErrorCode.NotFound,
  413: ErrorCode.PayloadTooLarge,
  415: ErrorCode.UnsupportedMediaType,
};

const exceptionMessages: Partial<Record<ContentfulStatusCode, string>> = {
  400: "The request could not be read.",
  413: "The request is too large.",
  415: "Send JSON with Content-Type: application/json.",
};

/**
 * nginx's "client closed request". Not a standard status: only the request
 * log sees it, because the client that would read it is gone.
 */
export const CLIENT_CLOSED_REQUEST = 499;

/** Receives a server-side failure, already reduced by `loggableError`, with its request id. */
export type ErrorLog = (message: string, error: LoggedError, detail: { requestId: string }) => void;

/**
 * Whether a failure is the cancellation of its request.
 *
 * @hono/node-server aborts a request's signal when the client goes away:
 * with the string "Client connection prematurely closed.", or, when the
 * incoming stream failed, with that stream error's text (`String(error)`,
 * e.g. "Error: aborted"). Whatever was waiting on the signal or the body
 * then fails with the reason itself or with the stream error.
 *
 * Args:
 *     error: The failure.
 *     reason: The aborted signal's reason.
 *
 * Returns:
 *     True when the reason, or an error whose text it is, is in the
 *     failure's cause chain.
 */
export function isCancellation(error: unknown, reason: unknown): boolean {
  return causeChain(error).some((link) => link === reason || (link instanceof Error && String(link) === reason));
}

/**
 * The log message for a failure the server must report, or null for an
 * expected client error (4xx), which is traffic rather than a fault.
 */
function serverFailure(error: Error): string | null {
  if (error instanceof AppError) return error.status >= 500 ? "API error " + error.code : null;
  if (error instanceof HTTPException && error.status < 500) return null;
  return "Unhandled API error";
}

/**
 * Map thrown errors to the envelope.
 *
 * Args:
 *     log: Receives server-side failures: unexpected errors, and
 *         `AppError`s with a 5xx status, whose `cause` (e.g. the Clerk error
 *         behind `account_deletion_incomplete`) exists only here. Client
 *         errors (4xx) are expected traffic and are not logged. Each failure
 *         goes through `loggableError` first.
 *
 * Note:
 *     A request whose client went away is answered with
 *     `CLIENT_CLOSED_REQUEST`, which only the request log sees. The web app
 *     cancels a stale search on every keystroke, and @hono/node-server then
 *     aborts the request's signal with a string reason, which surfaces as
 *     the failure of whatever was waiting on it (course discovery wraps it
 *     in `search_unavailable`). That failure is the cancellation and is not
 *     logged. Any other server-side failure of such a request still is: the
 *     member left, but an account deletion Clerk refused or a statement that
 *     timed out still went wrong.
 */
export function errorHandler(log: ErrorLog): ErrorHandler<AppEnv> {
  return (error, c) => {
    const failure = serverFailure(error);
    const { signal } = c.req.raw;
    const cancellation = signal.aborted && isCancellation(error, signal.reason);
    if (failure && !cancellation) log(failure, loggableError(error), { requestId: c.get("requestId") });
    if (signal.aborted) return new Response(null, { status: CLIENT_CLOSED_REQUEST });
    if (error instanceof AppError) return c.json(errorBody(c, error.code, error.message), error.status);
    if (error instanceof HTTPException && error.status < 500) {
      const code = exceptionCodes[error.status] ?? ErrorCode.BadRequest;
      const message = exceptionMessages[error.status] ?? error.message;
      return c.json(errorBody(c, code, message), error.status);
    }
    return c.json(errorBody(c, ErrorCode.Internal, "Something went wrong. Please try again."), 500);
  };
}

export const notFoundHandler: NotFoundHandler<AppEnv> = (c) =>
  c.json(errorBody(c, ErrorCode.NotFound, "There is nothing at this address."), 404);
