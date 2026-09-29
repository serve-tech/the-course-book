import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { FriendRequests, MemberList, MemberRelationship, PublicMember } from "@coursebook/domain/friends/types";
import { api, unwrap } from "../../lib/api";
import { apiFailureMessage } from "../../shared/lib/errors";
import { useActionFetcher } from "../../shared/lib/use-action-fetcher";
import type { FriendReply } from "../../routes/friends";
import { replyMessage, useJournalFetcher } from "../journal/use-journal-fetcher";
import { FriendIntent, UnfriendReason, relationshipButton, toRelationship } from "./friend-actions";

enum FriendsFilter {
  All = "all",
  Mine = "mine",
  NotMine = "notmine",
}

const SEARCH_MIN_LENGTH = 3;
const SEARCH_DEBOUNCE_MS = 250;

const memberName = (member: PublicMember) => member.username || member.displayName || "Member";

interface MemberSearch {
  results: MemberRelationship[];
  error: string | null;
  /** Whether results for the current query are in (never below three characters). */
  answered: boolean;
}

/**
 * Members matching `query` with the viewer's relationship, debounced and
 * aborted on change; idle below three characters. Bumping `version` asks
 * again for the same query after a friend action changed a relationship.
 */
function useMemberSearch(query: string, version: number): MemberSearch {
  const [answer, setAnswer] = useState<{ query: string; version: number; results: MemberRelationship[]; error: string | null } | null>(
    null,
  );
  const text = query.trim();
  useEffect(() => {
    if (text.length < SEARCH_MIN_LENGTH) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      api
        .GET("/v1/member-search", { params: { query: { q: text } }, signal: controller.signal })
        .then((result) =>
          unwrap(result).results.map((hit) => ({ member: hit.member, relationship: toRelationship(hit.relationship) })),
        )
        .then(
          (results) => {
            if (controller.signal.aborted) return;
            setAnswer({ query: text, version, results, error: null });
          },
          (error: unknown) => {
            if (controller.signal.aborted) return;
            console.warn("Member search failed", error);
            setAnswer({ query: text, version, results: [], error: apiFailureMessage(error) ?? "Search is temporarily unavailable. Please try again." });
          },
        );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [text, version]);
  if (text.length < SEARCH_MIN_LENGTH || answer?.query !== text || answer.version !== version)
    return { results: [], error: null, answered: false };
  return { results: answer.results, error: answer.error, answered: true };
}

/**
 * Friends: find members by username and send requests, answer requests,
 * and view a friend's ranking read-only. Only friends appear in the picker
 * and can be opened at `/friends/<username>`; "Add to my list" posts the
 * `friend` journal intent.
 */
export function FriendsPage({
  signedIn,
  members,
  requests,
  selected,
  notify,
}: {
  signedIn: boolean;
  members: readonly PublicMember[];
  requests: FriendRequests;
  selected: MemberList | null;
  notify: (message: string) => void;
}) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState(FriendsFilter.All);
  const [query, setQuery] = useState("");
  const [searchVersion, setSearchVersion] = useState(0);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [leavingFriend, setLeavingFriend] = useState(false);
  const search = useMemberSearch(query, searchVersion);
  const journal = useJournalFetcher((reply) => {
    notify(replyMessage(reply));
  });
  const friend = useActionFetcher<FriendReply>("/friends", (reply) => {
    notify(replyMessage(reply));
    setSearchVersion((version) => version + 1);
  });
  const adding = journal.busy ? journal.fetcher.formData?.get("courseId") : null;
  const friendBusy = friend.busy || leavingFriend;
  const rows = selected?.rows ?? [];
  const visible = rows.filter(
    (row) =>
      filter === FriendsFilter.All ||
      (filter === FriendsFilter.Mine ? row.onMyList : !row.onMyList),
  );

  const befriend = (username: string) => {
    if (friendBusy) return;
    friend.submit({ intent: FriendIntent.Befriend, username });
  };
  const unfriend = (username: string, reason: UnfriendReason) => {
    if (friendBusy) return;
    friend.submit({ intent: FriendIntent.Unfriend, username, reason });
  };

  // Leave their page before sending the removal: the action revalidates the
  // current route, and /friends/<them> would then 404 into the error boundary.
  // `leavingFriend` keeps every friend button disabled meanwhile, because a
  // second submission on the shared fetcher would abort this one. Replace the
  // history entry so Back does not return to the removed friend's page.
  const removeSelectedFriend = async (username: string) => {
    if (friendBusy) return;
    setLeavingFriend(true);
    setConfirmingRemove(false);
    await navigate("/friends", { replace: true });
    friend.submit({ intent: FriendIntent.Unfriend, username, reason: UnfriendReason.Remove });
    setLeavingFriend(false);
  };

  return (
    <section id="friends" className="page active">
      <div className="listhead">
        <div>
          <div className="eyebrow">Golfing with friends</div>
          <h2>Friends</h2>
          <p>View your friends’ personal rankings. Friend lists are read-only; only friends see your list.</p>
        </div>
      </div>

      {signedIn && (
        <div className="friend-panel" id="friendFind">
          <label htmlFor="friendSearch">Add a friend</label>
          <input
            id="friendSearch"
            type="search"
            autoComplete="off"
            placeholder="Search by username (3 or more letters)"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
          {search.error && <div className="error-text">{search.error}</div>}
          {search.answered && !search.error && (
            <div className="friend-people" id="friendSearchResults">
              {search.results.length ? (
                search.results.map((hit) => {
                  const button = relationshipButton(hit.relationship);
                  const intent = button.intent;
                  return (
                    <div className="friend-person" key={hit.member.username}>
                      <div>
                        <div className="course">{hit.member.username}</div>
                        <div className="loc">{hit.member.displayName}</div>
                      </div>
                      <button
                        className="friend-list-action"
                        disabled={!intent || friendBusy}
                        onClick={() => {
                          if (intent) befriend(hit.member.username);
                        }}
                      >
                        {button.label}
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="friends-empty">No members match that username.</div>
              )}
            </div>
          )}
        </div>
      )}

      {signedIn && (requests.incoming.length > 0 || requests.outgoing.length > 0) && (
        <div className="friend-panel" id="friendRequests">
          <div className="label">Friend requests</div>
          <div className="friend-people">
            {requests.incoming.map((member) => (
              <div className="friend-person" key={"in-" + member.username} data-request="incoming">
                <div>
                  <div className="course">{member.username}</div>
                  <div className="loc">{member.displayName} · wants to be friends</div>
                </div>
                <div className="friend-person-actions">
                  <button
                    className="friend-list-action"
                    disabled={friendBusy}
                    onClick={() => {
                      befriend(member.username);
                    }}
                  >
                    Accept
                  </button>
                  <button
                    className="secondary"
                    disabled={friendBusy}
                    onClick={() => {
                      unfriend(member.username, UnfriendReason.Decline);
                    }}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
            {requests.outgoing.map((member) => (
              <div className="friend-person" key={"out-" + member.username} data-request="outgoing">
                <div>
                  <div className="course">{member.username}</div>
                  <div className="loc">{member.displayName} · request sent</div>
                </div>
                <button
                  className="secondary"
                  disabled={friendBusy}
                  onClick={() => {
                    unfriend(member.username, UnfriendReason.Cancel);
                  }}
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="controls friends-controls">
        <div className="friend-picker-wrap">
          <label htmlFor="friendSelect">Friend</label>
          <select
            id="friendSelect"
            value={selected?.member.username ?? ""}
            disabled={!signedIn}
            onChange={(event) => {
              setConfirmingRemove(false);
              const username = event.target.value;
              void navigate(username ? "/friends/" + encodeURIComponent(username) : "/friends");
            }}
          >
            <option value="">{signedIn ? "Select a friend…" : "Sign in to see friends…"}</option>
            {signedIn &&
              members.map((member) => (
                <option key={member.username} value={member.username}>
                  {memberName(member)}
                </option>
              ))}
          </select>
        </div>
        <div className="friends-filter-wrap">
          <label htmlFor="friendsFilter">Courses</label>
          <select
            id="friendsFilter"
            aria-label="Friends course filter"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value as FriendsFilter);
            }}
          >
            <option value={FriendsFilter.All}>All</option>
            <option value={FriendsFilter.Mine}>On My List</option>
            <option value={FriendsFilter.NotMine}>Not on My List</option>
          </select>
        </div>
      </div>
      <div className="label" id="friendsLabel">
        {selected ? memberName(selected.member) + " · Personal ranking" : "Personal ranking"}
      </div>
      {selected && selected.member.username && members.some((member) => member.username === selected.member.username) && (
        <div className="friend-remove">
          {confirmingRemove ? (
            <div className="actions" id="confirmRemoveFriendRow">
              <span className="loc">Remove {memberName(selected.member)} as a friend? You will no longer see each other’s lists.</span>
              <button
                className="secondary"
                onClick={() => {
                  setConfirmingRemove(false);
                }}
              >
                Keep
              </button>
              <button
                className="primary"
                id="confirmRemoveFriend"
                disabled={friendBusy}
                onClick={() => {
                  void removeSelectedFriend(selected.member.username);
                }}
              >
                Remove friend
              </button>
            </div>
          ) : (
            <button
              className="secondary"
              id="removeFriend"
              disabled={friendBusy}
              onClick={() => {
                setConfirmingRemove(true);
              }}
            >
              Remove friend…
            </button>
          )}
        </div>
      )}
      <div className="list" id="friendsList">
        {!signedIn ? (
          <div className="friends-empty">Sign in to see your friends and their lists.</div>
        ) : !selected ? (
          <div className="friends-empty">
            {members.length
              ? "Select a friend above to view their My List."
              : "No friends yet. Search for a username above to send a friend request."}
          </div>
        ) : !rows.length ? (
          <div className="friends-empty">This friend has not ranked any courses yet.</div>
        ) : !visible.length ? (
          <div className="friends-empty">
            {filter === FriendsFilter.Mine
              ? "You don't have any of this friend's courses on your list yet."
              : "You already have all of this friend's courses on your list."}
          </div>
        ) : (
          visible.map((row) => (
            <div className="rankrow friend-row" key={row.course.id} data-course-id={row.course.id}>
              <div className="handle">⋮⋮</div>
              <div className="myrank">{row.rank}</div>
              <div>
                <div className="course">{row.course.name}</div>
                <div className="loc">{row.course.location}</div>
              </div>
              <div>
                <button
                  className="friend-list-action"
                  disabled={row.onMyList || adding === row.course.id}
                  onClick={() => {
                    if (journal.busy) return;
                    journal.submit({ intent: "friend", courseId: row.course.id });
                  }}
                >
                  {row.onMyList
                    ? "On my list"
                    : adding === row.course.id
                      ? "Adding…"
                      : "Add to my list"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
