import { useMemo } from "react";
import { Link } from "react-router";
import type { MemberListRow, PublicMember } from "@coursebook/domain/friends/types";
import { sharePath } from "@coursebook/domain/sharing/view";
import { cx } from "../../shared/lib/cx";
import { CourseTile } from "./CourseTile";
import { displayName, profilePath } from "./paths";
import profileStyles from "./profile.module.css";
import { TileSize } from "./sizes";
import socialStyles from "./social.module.css";
import { mostPlayed, nationalProgress, placeBreakdown, stateView, type PlaceCount } from "./stats";
import styles from "./stats.module.css";

/**
 * A profile's Stats tab, from the member's ranking alone: how many courses,
 * states and countries, which states and countries with how many courses in
 * each, and how far through the national Top 100s. Rounds barely matter
 * (decision 2026-11-03, ranking-first product), so the one line about them,
 * the most played course, sits last and shows only when a course has a
 * second round.
 *
 * Each part is its own section, so a later line (architects, favourite holes)
 * is one more section with a `Breakdown` or a list of its own.
 *
 * @param member - Whose stats.
 * @param self - Whether it is the viewer's own profile.
 * @param rows - Their ranking, in rank order.
 */
export function StatsView({ member, self, rows }: { member: PublicMember; self: boolean; rows: readonly MemberListRow[] }) {
  const places = useMemo(() => placeBreakdown(rows), [rows]);
  const national = useMemo(() => nationalProgress(rows), [rows]);
  const most = useMemo(() => mostPlayed(rows), [rows]);
  const { username } = member;
  const name = displayName(member);
  const showCountries = places.countries.length > 1;

  return (
    <div className={profileStyles.columns}>
      <div className={styles.main}>
        <section aria-labelledby="places">
          <h2 id="places" className={socialStyles.sectionLabel}>
            {self ? "Where you've played" : "Where they've played"}
          </h2>
          <dl className={styles.figures}>
            <Figure label="Courses" value={rows.length} />
            <Figure label="States" value={places.states.length} target={places.states.length ? { id: "states", noun: "state" } : null} />
            <Figure label="Countries" value={places.countries.length} target={showCountries ? { id: "countries", noun: "country" } : null} />
          </dl>
          {!rows.length && (
            <div className={cx(socialStyles.emptyNote, styles.empty)}>
              <strong>No courses yet</strong>
              {self ? "Rank a course and the places you've played show up here." : name + " hasn't ranked any courses yet."}
            </div>
          )}
        </section>
        {places.states.length > 0 && (
          <Breakdown
            id="states"
            title="States"
            places={places.states}
            link={(place) => {
              const view = stateView(rows, place.key);
              return view && sharePath(username, view);
            }}
          />
        )}
        {showCountries && <Breakdown id="countries" title="Countries" places={places.countries} />}
      </div>

      <aside className={profileStyles.aside}>
        <section aria-labelledby="top-100s">
          <h2 id="top-100s" className={socialStyles.sectionLabel}>
            Top 100s <Link to={profilePath(username, "lists")}>All lists</Link>
          </h2>
          <ul className={styles.lists}>
            {national.map((list) => (
              <li key={list.list}>
                <Link className={styles.listLink} to={profilePath(username, "lists/" + list.list)}>
                  <span className={styles.listCount}>{list.played}</span>{" "}
                  <span>
                    of the <span className={styles.listTitle}>{list.title}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        {most && (
          <section aria-labelledby="most-played">
            <h2 id="most-played" className={socialStyles.sectionLabel}>
              Most played
            </h2>
            <div className={styles.mostPlayed}>
              <CourseTile course={most.course} size={TileSize.Thumb} />
              <div>
                <span className={styles.courseName}>{most.course.name}</span>
                <span className={styles.coursePlace}>{most.course.location}</span>
              </div>
              <span className={styles.rounds}>
                <b>{most.played}</b> rounds
              </span>
            </div>
          </section>
        )}
      </aside>
    </div>
  );
}

/** The section a headline number jumps to, and what it counts ("state"), for the link's name. */
interface FigureTarget {
  id: string;
  noun: string;
}

/** "1 state", "8 states", "2 countries". */
function countOf(count: number, noun: string): string {
  if (count === 1) return "1 " + noun;
  return String(count) + " " + (noun.endsWith("y") ? noun.slice(0, -1) + "ies" : noun + "s");
}

/**
 * One headline number. With a target, the number jumps to the section that
 * breaks it down.
 */
function Figure({ label, value, target = null }: { label: string; value: number; target?: FigureTarget | null }) {
  return (
    <div className={styles.figure}>
      <dt className={styles.figureLabel}>{label}</dt>
      <dd className={styles.figureValue}>
        {target ? (
          <a href={"#" + target.id} aria-label={"See the " + countOf(value, target.noun)}>
            {value.toLocaleString()}
          </a>
        ) : (
          value.toLocaleString()
        )}
      </dd>
    </div>
  );
}

/**
 * A list of places with their course counts and a bar for each, most first.
 *
 * @param id - The section's id, which the headline number links to.
 * @param title - The section's heading.
 * @param places - The places, most courses first.
 * @param link - Where a place opens; null or omitted when it opens nothing.
 */
export function Breakdown({
  id,
  title,
  places,
  link,
}: {
  id: string;
  title: string;
  places: readonly PlaceCount[];
  link?: (place: PlaceCount) => string | null;
}) {
  const most = places[0]?.courses ?? 0;
  return (
    <section id={id} className={styles.breakdown} aria-labelledby={id + "-title"}>
      <h2 id={id + "-title"} className={socialStyles.sectionLabel}>
        {title} <span>{places.length}</span>
      </h2>
      <ol className={styles.places}>
        {places.map((place) => {
          const href = link?.(place) ?? null;
          const content = (
            <>
              <span className={styles.placeName}>{place.name}</span>{" "}
              <progress className={styles.bar} value={place.courses} max={most} aria-hidden="true" />
              <span className={styles.placeCount}>
                {place.courses} <span className={styles.unit}>{place.courses === 1 ? "course" : "courses"}</span>
              </span>
            </>
          );
          return (
            <li key={place.key}>
              {href ? (
                <Link className={styles.place} to={href}>
                  {content}
                </Link>
              ) : (
                <div className={styles.place}>{content}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
