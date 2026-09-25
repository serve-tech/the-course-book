/**
 * Expected failures raised by server modules.
 *
 * Services throw `AppError` instead of framework responses so they can serve
 * any transport. The transport layer (today the React Router routes, later
 * the JSON API) maps `status` to the response status and exposes `code` so
 * clients can branch without parsing messages.
 */

/** Machine-readable failure codes; values are part of the client contract. */
export enum ErrorCode {
  CourseNotFound = "course_not_found",
  NotOnList = "not_on_list",
  RoundNotFound = "round_not_found",
  UsernameInvalid = "username_invalid",
}

/** An expected failure with the status and code the transport should report. */
export class AppError extends Error {
  /**
   * Args:
   *     status: HTTP status the transport responds with.
   *     code: Stable code for clients.
   *     message: Human-readable explanation shown to members.
   */
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}
