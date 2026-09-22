import { useState } from "react";
import { useNavigate } from "react-router";
import type { PublicMember } from "../../server/authz.server";
import type { MemberList } from "../../server/friends.server";
import { replyMessage, useJournalFetcher } from "../journal/use-journal-fetcher";

enum FriendsFilter {
  All = "all",
  Mine = "mine",
  NotMine = "notmine",
}

const memberName = (member: PublicMember) => member.username || member.displayName || "Member";

/**
 * Friends: a directory of other members and a read-only view of one
 * member's ranking. Choosing a member navigates to `/friends/<username>`;
 * "Add to my list" posts the `friend` intent.
 */
export function FriendsPage({
  signedIn,
  members,
  selected,
  notify,
}: {
  signedIn: boolean;
  members: readonly PublicMember[];
  selected: MemberList | null;
  notify: (message: string) => void;
}) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState(FriendsFilter.All);
  const { busy, submit, fetcher } = useJournalFetcher((reply) => {
    notify(replyMessage(reply));
  });
  const adding = busy ? fetcher.formData?.get("courseId") : null;
  const rows = selected?.rows ?? [];
  const visible = rows.filter(
    (row) =>
      filter === FriendsFilter.All ||
      (filter === FriendsFilter.Mine ? row.onMyList : !row.onMyList),
  );

  return (
    <section id="friends" className="page active">
      <div className="listhead">
        <div>
          <div className="eyebrow">Golfing with friends</div>
          <h2>Friends</h2>
          <p>View another member’s personal ranking. Friend lists are read-only.</p>
        </div>
      </div>
      <div className="controls friends-controls">
        <div className="friend-picker-wrap">
          <label htmlFor="friendSelect">Friend</label>
          <select
            id="friendSelect"
            value={selected?.member.username ?? ""}
            disabled={!signedIn}
            onChange={(event) => {
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
            <option value="all">All</option>
            <option value="mine">On My List</option>
            <option value="notmine">Not on My List</option>
          </select>
        </div>
      </div>
      <div className="label" id="friendsLabel">
        {selected ? memberName(selected.member) + " · Personal ranking" : "Personal ranking"}
      </div>
      <div className="list" id="friendsList">
        {!signedIn ? (
          <div className="friends-empty">Sign in to see registered members and their lists.</div>
        ) : !selected ? (
          <div className="friends-empty">
            {members.length
              ? "Select a friend above to view their My List."
              : "No other registered members yet."}
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
                    if (busy) return;
                    submit({ intent: "friend", courseId: row.course.id });
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
