import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Relationship, type FriendRequests, type MemberRelationship, type PublicMember } from "@coursebook/domain/friends/types";
import { api, unwrap } from "../../lib/api";
import { apiFailureMessage } from "../../shared/lib/errors";
import { useActionFetcher } from "../../shared/lib/use-action-fetcher";
import type { FriendReply } from "../../routes/friends";
import { replyMessage } from "../journal/use-journal-fetcher";
import { cx } from "../../shared/lib/cx";
import { Avatar } from "../social/Avatar";
import { displayName, profilePath } from "../social/paths";
import { AvatarSize } from "../social/sizes";
import socialStyles from "../social/social.module.css";
import { FriendIntent, UnfriendReason, relationshipButton, toRelationship } from "./friend-actions";
import styles from "./friends.module.css";

const SEARCH_MIN_LENGTH = 3;
const SEARCH_DEBOUNCE_MS = 250;


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
 * Friends: requests to answer, finding members by username, and the people
 * the member is friends with, each linking to their profile. A friend's
 * ranking, rounds and Remove friend live on their profile now.
 */
export function FriendsPage({
  signedIn,
  members,
  requests,
  notify,
}: {
  signedIn: boolean;
  members: readonly PublicMember[];
  requests: FriendRequests;
  notify: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [searchVersion, setSearchVersion] = useState(0);
  const search = useMemberSearch(query, searchVersion);
  const friend = useActionFetcher<FriendReply>("/friends", (reply) => {
    notify(replyMessage(reply));
    setSearchVersion((version) => version + 1);
  });
  const friendBusy = friend.busy;

  const befriend = (username: string) => {
    if (friendBusy) return;
    friend.submit({ intent: FriendIntent.Befriend, username });
  };
  const unfriend = (username: string, reason: UnfriendReason) => {
    if (friendBusy) return;
    friend.submit({ intent: FriendIntent.Unfriend, username, reason });
  };

  return (
    <section id="friends" className={styles.page}>
      <div className={styles.head}>
        <span className={styles.eyebrow}>Golfing with friends</span>
        <h1 className={styles.title}>Friends</h1>
        <p className={styles.lede}>Friends see each other&apos;s rounds, rankings and profiles. Nobody else does.</p>
      </div>

      {!signedIn ? (
        <div className={socialStyles.emptyNote}>
          <strong>Sign in to see your friends</strong>
          Your friends and their rounds show up here once you sign in.
        </div>
      ) : (
        <div className={styles.columns}>
          <div className={styles.main}>
            {(requests.incoming.length > 0 || requests.outgoing.length > 0) && (
              <section id="friendRequests" aria-labelledby="requests-label">
                <h2 id="requests-label" className={socialStyles.sectionLabel}>
                  Friend requests
                </h2>
                <div className={styles.rows}>
                  {requests.incoming.map((member) => (
                    <div className={cx("friend-person", styles.row)} key={"in-" + member.username} data-request="incoming">
                      <Avatar member={member} />
                      <div className={styles.who}>
                        <div className="course">{displayName(member)}</div>
                        <div className="loc">@{member.username} · wants to be friends</div>
                      </div>
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={[socialStyles.button, socialStyles.buttonSolid].join(" ")}
                          disabled={friendBusy}
                          onClick={() => {
                            befriend(member.username);
                          }}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          className={[socialStyles.button, socialStyles.buttonGhost].join(" ")}
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
                    <div className={cx("friend-person", styles.row)} key={"out-" + member.username} data-request="outgoing">
                      <Avatar member={member} />
                      <div className={styles.who}>
                        <div className="course">{displayName(member)}</div>
                        <div className="loc">@{member.username} · request sent</div>
                      </div>
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={[socialStyles.button, socialStyles.buttonGhost].join(" ")}
                          disabled={friendBusy}
                          onClick={() => {
                            unfriend(member.username, UnfriendReason.Cancel);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section id="friendsList" aria-labelledby="friends-label">
              <h2 id="friends-label" className={socialStyles.sectionLabel}>
                Your friends · {members.length}
              </h2>
              {members.length ? (
                <div className={styles.grid}>
                  {members.map((member) => (
                    <Link key={member.username} className={styles.card} to={profilePath(member.username)} data-friend={member.username}>
                      <Avatar member={member} size={AvatarSize.Large} />
                      <span className={styles.cardName}>{displayName(member)}</span>
                      <span className={styles.cardHandle}>@{member.username}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className={socialStyles.emptyNote}>
                  <strong>No friends yet</strong>
                  Search for a username to send a friend request.
                </div>
              )}
            </section>
          </div>

          <aside className={styles.aside}>
            <div className={styles.find} id="friendFind">
              <label htmlFor="friendSearch" className={socialStyles.sectionLabel}>
                Add a friend
              </label>
              <input
                id="friendSearch"
                className={styles.search}
                type="search"
                autoComplete="off"
                placeholder="Search by username"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                }}
              />
              {search.error && <div className="error-text">{search.error}</div>}
              {search.answered && !search.error && (
                <div className={styles.rows} id="friendSearchResults">
                  {search.results.length ? (
                    search.results.map((hit) => {
                      const button = relationshipButton(hit.relationship);
                      const intent = button.intent;
                      return (
                        <div className={cx("friend-person", styles.row)} key={hit.member.username}>
                          <Avatar member={hit.member} size={AvatarSize.Small} />
                          <div className={styles.who}>
                            <div className="course">{displayName(hit.member)}</div>
                            <div className="loc">@{hit.member.username}</div>
                          </div>
                          {hit.relationship === Relationship.Friends ? (
                            <Link className={[socialStyles.button, socialStyles.buttonGhost].join(" ")} to={profilePath(hit.member.username)}>
                              View profile
                            </Link>
                          ) : (
                            <button
                              type="button"
                              className={socialStyles.button}
                              disabled={!intent || friendBusy}
                              onClick={() => {
                                if (intent) befriend(hit.member.username);
                              }}
                            >
                              {button.label}
                            </button>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="friends-empty">No members match that username.</div>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
