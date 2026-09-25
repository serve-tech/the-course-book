import type { Hook } from "@hono/zod-openapi";
import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiError } from "../contract/schemas";
import { AppError, ErrorCode } from "../services/errors";
import type { AppEnv } from "./env";

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
 * Map thrown errors to the envelope.
 *
 * Args:
 *     log: Receives unexpected errors with the request id.
 */
export function errorHandler(log: (message: string, detail: unknown) => void): ErrorHandler<AppEnv> {
  return (error, c) => {
    if (error instanceof AppError) return c.json(errorBody(c, error.code, error.message), error.status);
    if (error instanceof HTTPException && error.status < 500) {
      const code = exceptionCodes[error.status] ?? ErrorCode.BadRequest;
      const message = exceptionMessages[error.status] ?? error.message;
      return c.json(errorBody(c, code, message), error.status);
    }
    log("Unhandled API error " + c.get("requestId"), error);
    return c.json(errorBody(c, ErrorCode.Internal, "Something went wrong. Please try again."), 500);
  };
}

export const notFoundHandler: NotFoundHandler<AppEnv> = (c) =>
  c.json(errorBody(c, ErrorCode.NotFound, "There is nothing at this address."), 404);
