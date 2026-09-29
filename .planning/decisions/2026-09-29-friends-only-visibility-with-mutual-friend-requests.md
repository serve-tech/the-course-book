# Friends-only visibility with mutual friend requests

**Date:** 2026-09-29
**Status:** Accepted

## Context

Issue #11. Every signed-in member could page through the whole member directory (`GET /v1/members`) and open any member's list (`GET /v1/members/{username}`), as in the retired app; Clerk sign-up is public, so anyone who signed up could read every member's list. The maintainer requires that members see and edit only their own list and see (not edit) their friends' lists, before launch on 2026-09-30.

## Options Considered

1. **Mutual friendship by request and accept**: one member requests, the other accepts; both then see each other's lists; either removes it.
   - Pros: common and easy to explain; symmetric visibility; one row per pair.
   - Cons: needs request/accept UI and pending states.
2. **One-way follow with approval**: A asks to follow B; B approves; A sees B's list only.
   - Pros: flexible.
   - Cons: two relationships per pair, more rules and UI.
3. **Invite link or code**: sharing a link makes friends.
   - Pros: no member search at all.
   - Cons: links leak; still needs a way to manage friends.

Finding people: username search (3+ characters) was chosen over exact-username lookup (more private, clumsier) and a visible directory (reveals every member).

Starting state for the 11 imported members: all friends with each other (keeps what they had in the old app) was chosen over no friendships.

Timing: ship before launch was chosen over launching with Clerk sign-up restricted.

## Decision

Option 1, with username search, imported members starting as mutual friends, shipped before launch (maintainer, 2026-09-29).

- A `friendships` row per pair of members, in either direction: requester, addressee, status `pending` or `accepted`. A unique index on the unordered pair allows at most one row per pair.
- Requesting someone who already requested you accepts their request. Removing deletes the row, whatever its state (unfriend, cancel, decline).
- Only accepted friends appear in `GET /v1/members` and can be opened with `GET /v1/members/{username}`; anyone else is "not found", so the API does not reveal who exists beyond the username search.
- The search returns username, display name and the viewer's relationship, never a list.
- Account deletion removes the member's friendships. The importer makes imported members friends with each other; reruns do not duplicate them.

## Consequences

- New members see nothing of others until a request is accepted.
- The contract gains friendship and search operations (additive); the meaning of the two member operations narrows to friends before any native app ships.
- Usernames are discoverable through search (3+ characters), which the maintainer accepted.
