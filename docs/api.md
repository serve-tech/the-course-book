# API reference

The authoritative description is [contract/openapi.json](../contract/openapi.json) (OpenAPI 3.0.3, also served at `GET /v1/openapi.json`). This page summarizes it for people; generated clients use the contract.

## Basics

- **Base URL:** the `coursebook-golf-api` Render service, `https://coursebook-golf-api.onrender.com` (`https://api.coursebook.golf` after cutover).
- **Authentication:** `Authorization: Bearer <Clerk session token>` on member operations. Omit the header on public operations. Cookies are ignored.
- **Bodies:** JSON with `Content-Type: application/json`, at most 32 KB. Optional request fields may be missing or `null`.
- **Responses:** every documented field is always present; absent values are `null`. Changes to your list return the whole updated list (`courses`), so clients replace their copy.
- **Dates:** `playedOn` is `YYYY-MM-DD` in the member's time zone; send it, because the server's date is UTC.
- **Compatibility:** the contract only grows. Unknown response fields and unknown error codes must be tolerated. Read `GET /v1/client-config` at launch and ask the member to update when the app is older than `minimumVersions`.

## Errors

Every failure returns:

```json
{ "error": { "code": "not_on_list", "message": "That course is not on your list.", "requestId": "…", "fields": null } }
```

| Status | Codes |
| --- | --- |
| 400 | `bad_request` (unreadable JSON), `validation_failed` (with `fields`), `us_state_required` |
| 401 | `unauthenticated`, `account_deleted` |
| 403 | `username_invalid` |
| 404 | `not_found`, `course_not_found`, `not_on_list`, `round_not_found`, `member_not_found`, `friendship_not_found` |
| 413 | `payload_too_large` |
| 415 | `unsupported_media_type` |
| 500 | `internal` |
| 502 | `account_deletion_incomplete` (retry `DELETE /v1/me`) |
| 503 | `search_unavailable` |

`message` is written for members; `requestId` matches the server log and the `X-Request-Id` header.

## Operations

| Operation | `operationId` | Access | Notes |
| --- | --- | --- | --- |
| `GET /v1/client-config` | `getClientConfig` | public | Minimum app versions, privacy and account-deletion URLs |
| `GET /v1/rankings` | `listRankings` | public | Every published entry; `ETag` and `If-None-Match` (304), cacheable for an hour |
| `GET /v1/me` | `getMe` | member | Username and display name |
| `DELETE /v1/me` | `deleteMe` | member | Deletes the account; 204. Retry after a 502 |
| `GET /v1/me/courses` | `listMyCourses` | member | The list in personal rank order with play counts |
| `PUT /v1/me/courses/{courseId}` | `addToList` | member | Add a catalog course; logs one round if it has none; idempotent |
| `POST /v1/me/courses` | `addCourse` | member | Add a course by details (`source` `search` or `manual`), at `rank`, with `quantity` rounds |
| `DELETE /v1/me/courses/{courseId}` | `removeCourse` | member | Remove a course and its rounds |
| `PUT /v1/me/courses/{courseId}/rank` | `moveCourse` | member | Move to a position; renumbers the whole list |
| `PUT /v1/me/courses/{courseId}/play-count` | `setPlayCount` | member | Set the round count; zero removes the course |
| `GET /v1/me/courses/{courseId}/rounds` | `listMyCourseRounds` | member | Rounds at a course, newest first |
| `POST /v1/me/courses/{courseId}/rounds` | `logRounds` | member | Log rounds at a catalog course |
| `DELETE /v1/me/rounds/{roundId}` | `deleteRound` | member | Delete one round; the last one removes the course |
| `GET /v1/course-search?q=` | `searchCourses` | member | Up to ten hits; catalog hits carry `courseId` |
| `GET /v1/members?cursor=&limit=` | `listMembers` | member | The member's friends, paged by username (limit 1–200, default 50) |
| `GET /v1/members/{username}` | `getMemberList` | member | The member's own list or a friend's, with `onMyList` flags; anyone else is 404 `member_not_found` |
| `GET /v1/member-search?q=` | `searchMembers` | member | Up to 20 other members whose username contains `q` (3–64 characters), prefix matches first, each with the viewer's `relationship`; `no-store` |
| `GET /v1/me/friend-requests` | `listFriendRequests` | member | Pending requests: `incoming` (they asked) and `outgoing` (the viewer asked) |
| `PUT /v1/me/friends/{username}` | `befriendMember` | member | Send a request, or accept theirs; returns the resulting `relationship`; idempotent. 400 for the viewer's own username |
| `DELETE /v1/me/friends/{username}` | `removeFriend` | member | End the friendship, cancel the viewer's request or decline theirs; 204, or 404 `friendship_not_found` |
| `GET /v1/members/{username}/want-to-play` | `listWantToPlay` | member | The member's own or a friend's Want to play list, newest first; anyone else is 404 `member_not_found` |
| `PUT /v1/me/want-to-play/{courseId}` | `addWantToPlay` | member | Add a catalog course (played ones too); idempotent, keeps the original date; returns the list |
| `DELETE /v1/me/want-to-play/{courseId}` | `removeWantToPlay` | member | Remove a course; idempotent (removing one that is not there changes nothing); returns the list |

`relationship` is one of `none`, `friends`, `requested` (the viewer asked) and `incoming` (they asked); treat an unknown value as `none`. Friendships are mutual: one member asks, the other accepts, and either can end it. When both ask each other, they are friends ([decision](../.planning/decisions/2026-09-29-friends-only-visibility-with-mutual-friend-requests.md)).

`POST` operations are not idempotent: a retry after a lost response logs the rounds again. `PUT` and `DELETE` operations are safe to retry; a `DELETE` retried after success answers 404, except `removeWantToPlay`, which answers 200 with the list.

`GET /healthz` (outside `/v1`, not in the contract) answers `{ "ok": true }` after a database round-trip, for Render's health checks.
