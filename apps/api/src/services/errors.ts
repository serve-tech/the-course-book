/**
 * Expected failures raised by server modules.
 *
 * Services throw `AppError` instead of framework responses so they can serve
 * any transport. The transport layer (today the React Router routes, later
 * the JSON API) maps `status` to the response status and exposes `code` so
 * clients can branch without parsing messages.
 */

/**
 * Machine-readable failure codes; the values are part of the client contract.
 *
 * The API publishes `code` as a documented string rather than an enum because
 * installed Swift builds cannot decode enum values added later. Add codes
 * freely; never rename or remove one.
 */
export enum ErrorCode {
  BadRequest = "bad_request",
  ValidationFailed = "validation_failed",
  UsStateRequired = "us_state_required",
  Unauthenticated = "unauthenticated",
  AccountDeleted = "account_deleted",
  UsernameInvalid = "username_invalid",
  NotFound = "not_found",
  CourseNotFound = "course_not_found",
  NotOnList = "not_on_list",
  RoundNotFound = "round_not_found",
  MemberNotFound = "member_not_found",
  PayloadTooLarge = "payload_too_large",
  UnsupportedMediaType = "unsupported_media_type",
  AccountDeletionIncomplete = "account_deletion_incomplete",
  SearchUnavailable = "search_unavailable",
  Internal = "internal",
}

/** HTTP statuses an `AppError` may carry. */
export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 413 | 415 | 500 | 502 | 503;

/** An expected failure with the status and code the transport should report. */
export class AppError extends Error {
  /**
   * Args:
   *     status: HTTP status the transport responds with.
   *     code: Stable code for clients.
   *     message: Human-readable explanation shown to members.
   *     options: Standard error options, e.g. the underlying `cause`.
   */
  constructor(
    readonly status: ErrorStatus,
    readonly code: ErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AppError";
  }
}
