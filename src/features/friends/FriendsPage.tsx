import { useEffect, useState } from "react";
import { useJournal, useServices } from "../../app/context";
import type { Member } from "./friends-repository";
import { cloudLocation, courseSchema, type Course } from "../catalog/course";
import { equivalentCourses } from "../catalog/identity";
import { AddRoundMode } from "../rounds/round-service";
import { errorMessage } from "../../shared/lib/errors";
enum FriendsFilter {
  All = "all",
  Mine = "mine",
  NotMine = "notmine",
}
interface FriendCourse {
  course: Course;
  dbId: string;
  rank: number;
}
const memberName = (member: Member) =>
  member.username || member.display_name || member.email || "Member";
export function FriendsPage({
  active,
  notify,
}: {
  active: boolean;
  notify: (message: string) => void;
}) {
  const { friends, memberships, catalog, rounds, journal } = useServices(),
    { user, account } = useJournal();
  const [ownCourses, setOwnCourses] = useState<Course[]>([]);
  const [members, setMembers] = useState<Member[]>([]),
    [selected, setSelected] = useState(""),
    [filter, setFilter] = useState(FriendsFilter.All),
    [rows, setRows] = useState<FriendCourse[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [adding, setAdding] = useState<string | null>(null);
  useEffect(() => {
    if (!active || !user) return;
    let current = true;
    void friends.members(user.id).then(
      (value) => {
        if (current) setMembers(value);
      },
      (failure: unknown) => {
        if (current) setError(errorMessage(failure));
      },
    );
    return () => {
      current = false;
    };
  }, [active, user, friends]);
  useEffect(() => {
    if (!selected || !user) return;
    let current = true;
    const load = async () => {
      const membershipsRows = await memberships.memberships(selected),
        ids = membershipsRows.flatMap((row) =>
          row.course_id ? [row.course_id] : [],
        );
      const courses = await catalog.rows(ids),
        byId = new Map(courses.map((row) => [row.id, row]));
      const next = membershipsRows.flatMap((row, index) => {
        const course = row.course_id ? byId.get(row.course_id) : undefined;
        return course
          ? [
              {
                dbId: course.id,
                rank: row.personal_rank ?? index + 1,
                course: courseSchema.parse({
                  ...course,
                  location: cloudLocation(course),
                  city: course.city ?? "",
                  state: course.state ?? "",
                  country: course.country ?? "",
                }),
              },
            ]
          : [];
      });
      const ownMemberships = await memberships.memberships(user.id);
      const ownRows = await catalog.rows(
        ownMemberships.flatMap((row) => (row.course_id ? [row.course_id] : [])),
      );
      const evidence = ownRows.map((row) =>
        courseSchema.parse({
          ...row,
          location: cloudLocation(row),
          city: row.city ?? "",
          state: row.state ?? "",
          country: row.country ?? "",
        }),
      );
      if (current) {
        setRows(next);
        setOwnCourses(evidence);
        setLoading(false);
      }
    };
    void load().catch((failure: unknown) => {
      if (current) {
        setError(errorMessage(failure));
        setLoading(false);
      }
    });
    return () => {
      current = false;
    };
  }, [selected, user, memberships, catalog]);
  const mine = (course: Course) =>
    ownCourses.some(
      (own) => own.id === course.id || equivalentCourses(own, course),
    ) ||
    account.myList.some((id) => equivalentCourses(catalog.get(id), course));
  const visible = rows.filter(
    (row) =>
      filter === FriendsFilter.All ||
      (filter === FriendsFilter.Mine ? mine(row.course) : !mine(row.course)),
  );
  const add = async (row: FriendCourse) => {
    if (adding) return;
    setAdding(row.dbId);
    try {
      const token = journal.owner(),
        db = (await catalog.rows([row.dbId]))[0];
      journal.assertOwner(token);
      if (!db) throw new Error("Course unavailable");
      const course = catalog.fromRow(db, account.myList);
      await rounds.log(course, 1, AddRoundMode.Friend);
      notify("Added to My List");
    } catch (failure) {
      notify(errorMessage(failure));
    } finally {
      setAdding(null);
    }
  };
  const friend = members.find((member) => member.id === selected);
  return (
    <section id="friends" className={"page" + (active ? " active" : "")}>
      <div className="listhead">
        <div>
          <div className="eyebrow">Golfing with friends</div>
          <h2>Friends</h2>
          <p>
            View another member’s personal ranking. Friend lists are read-only.
          </p>
        </div>
      </div>
      <div className="controls friends-controls">
        <div className="friend-picker-wrap">
          <label htmlFor="friendSelect">Friend</label>
          <select
            id="friendSelect"
            value={selected}
            onChange={(event) => {
              setSelected(event.target.value);
              setRows([]);
              setError("");
              setLoading(!!event.target.value);
            }}
          >
            <option value="">
              {user ? "Select a friend…" : "Sign in to see friends…"}
            </option>
            {user &&
              members.map((member) => (
                <option key={member.id} value={member.id}>
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
        {friend
          ? memberName(friend) + " · Personal ranking"
          : "Personal ranking"}
      </div>
      <div className="list" id="friendsList">
        {!user ? (
          <div className="friends-empty">
            Sign in to see registered members and their lists.
          </div>
        ) : error ? (
          <div className="friends-empty">{error}</div>
        ) : loading ? (
          <div className="friends-loading">Loading their My List…</div>
        ) : !selected ? (
          <div className="friends-empty">
            {members.length
              ? "Select a friend above to view their My List."
              : "No other registered members yet."}
          </div>
        ) : !rows.length ? (
          <div className="friends-empty">
            This friend has not ranked any courses yet.
          </div>
        ) : !visible.length ? (
          <div className="friends-empty">
            {filter === FriendsFilter.Mine
              ? "You don't have any of this friend's courses on your list yet."
              : "You already have all of this friend's courses on your list."}
          </div>
        ) : (
          visible.map((row) => (
            <div
              className="rankrow friend-row"
              key={row.dbId}
              data-course-id={row.dbId}
            >
              <div className="handle">⋮⋮</div>
              <div className="myrank">{row.rank}</div>
              <div>
                <div className="course">{row.course.name}</div>
                <div className="loc">{row.course.location}</div>
              </div>
              <div>
                <button
                  className="friend-list-action"
                  disabled={mine(row.course) || adding === row.dbId}
                  onClick={() => {
                    void add(row);
                  }}
                >
                  {mine(row.course)
                    ? "On my list"
                    : adding === row.dbId
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
