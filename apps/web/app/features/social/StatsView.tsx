import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import type { MemberListRow, PublicMember } from "@coursebook/domain/friends/types";
import { cx } from "../../shared/lib/cx";
import { coursePath } from "../courses/paths";
import { ordinal } from "./format";
import { displayName, profilePath } from "./paths";
import socialStyles from "./social.module.css";
import { GemReason, listedPhrase, profileStats, shownPlaces, type Disagreement, type HiddenGem, type ListProgress, type PublishedEntry, type RankedRef } from "./stats";
import styles from "./stats.module.css";

/**
 * A profile's Stats tab: the member's progress through the published lists,
 * then how their ranking compares with those lists. The counts of courses,
 * states and countries are in the profile's header, above every tab.
 *
 * The national Top 100s are one section. The states are another: one row per
 * state the member has played in, with the courses played there and, on its
 * own labelled line, their progress through that state's "Best in" list. The
 * two numbers differ whenever a course played in the state is not on its
 * list, so each is named. Every row names the member's top-ranked course on
 * it and opens the list with their ticks.
 *
 * Further down: the best course they have played on each national list, the
 * course their ranking and a list disagree on most, and their hidden gem.
 * Each part is its own section, so a later line (architects, favourite
 * holes) is one more section.
 *
 * @param member - Whose stats.
 * @param self - Whether it is the viewer's own profile.
 * @param rows - Their ranking, in rank order.
 * @param entries - Every published ranking entry, for progress through the lists.
 */
export function StatsView({
  member,
  self,
  rows,
  entries,
}: {
  member: PublicMember;
  self: boolean;
  rows: readonly MemberListRow[];
  entries: readonly PublishedEntry[];
}) {
  const stats = useMemo(() => profileStats(rows, entries), [rows, entries]);
  const listPath = (slug: string) => profilePath(member.username, "lists/" + slug);
  const whose = self ? "Your" : "Their";
  const { disagreement, hiddenGem } = stats;

  return (
    <div className={styles.page}>
      {!stats.courses && (
        <div className={socialStyles.emptyNote}>
          <strong>No courses yet</strong>
          {self ? "Rank a course and your progress through the lists shows up here." : displayName(member) + " hasn't ranked any courses yet."}
        </div>
      )}

      <section aria-labelledby="top-100s">
        <h2 id="top-100s" className={socialStyles.sectionLabel}>
          Top 100s
        </h2>
        <ul className={styles.grid}>
          {stats.national.map((list) => (
            <li key={list.slug} className={styles.row}>
              <div className={styles.rowHead}>
                <Link className={cx(styles.rowTitle, styles.rowLink)} to={listPath(list.slug)} aria-label={list.title + ": " + playedOf(list)}>
                  {list.title}
                </Link>
                <Count value={list.played} unit={"/ " + String(list.size)} />
              </div>
              <Bar list={list} />
              <TopRanked whose={whose} course={list.top} />
            </li>
          ))}
        </ul>
      </section>

      {stats.states.length > 0 && (
        <PlaceSection id="states" title="States" noun="states" places={stats.states}>
          {(state) => {
            const onList = state.list && listedPhrase(state.courses, state.list.played, whose.toLowerCase()) + " " + state.list.title + " (" + courses(state.list.size) + ")";
            return (
              <li key={state.key} className={styles.row}>
                <div className={styles.rowHead}>
                  {state.list ? (
                    <Link className={cx(styles.rowTitle, styles.rowLink)} to={listPath(state.list.slug)} aria-label={state.name + ": " + courses(state.courses) + ". " + String(onList)}>
                      {state.name}
                    </Link>
                  ) : (
                    <span className={styles.rowTitle}>{state.name}</span>
                  )}
                  <Count value={state.courses} unit={state.courses === 1 ? "course" : "courses"} />
                </div>
                {state.list && (
                  <>
                    <p className={styles.onList}>{onList}</p>
                    <Bar list={state.list} />
                  </>
                )}
                <TopRanked whose={whose} course={state.top} />
              </li>
            );
          }}
        </PlaceSection>
      )}
      {stats.countries.length > 1 && (
        <PlaceSection id="countries" title="Countries" noun="countries" places={stats.countries}>
          {(country) => (
            <li key={country.key} className={styles.row}>
              <div className={styles.rowHead}>
                <span className={styles.rowTitle}>{country.name}</span>
                <Count value={country.courses} unit={country.courses === 1 ? "course" : "courses"} />
              </div>
              <TopRanked whose={whose} course={country.top} />
            </li>
          )}
        </PlaceSection>
      )}

      <div className={styles.pair}>
        {(disagreement || hiddenGem) && (
          <section aria-labelledby="versus">
            <h2 id="versus" className={socialStyles.sectionLabel}>
              {whose} ranking vs the lists
            </h2>
            <div className={styles.notes}>
              {hiddenGem && (
                <Note label="Hidden gem" course={hiddenGem.course}>
                  <GemText gem={hiddenGem} self={self} listPath={listPath} />
                </Note>
              )}
              {disagreement && (
                <Note label="Biggest disagreement" course={disagreement.course}>
                  <GapText gap={disagreement} self={self} listPath={listPath} />
                </Note>
              )}
            </div>
          </section>
        )}

        {stats.best.length > 0 && (
          <section aria-labelledby="best">
            <h2 id="best" className={socialStyles.sectionLabel}>
              {self ? "The best you've played" : "The best they've played"}
            </h2>
            <ul className={styles.rows}>
              {stats.best.map((best) => (
                <li key={best.slug} className={styles.best}>
                  <span className={styles.bestRank}>#{best.published}</span>
                  <span>
                    <Link className={styles.courseLink} to={coursePath(best.course.id)}>
                      {best.course.name}
                    </Link>
                    <span className={styles.bestList}>
                      on the <Link to={listPath(best.slug)}>{best.title}</Link>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

/**
 * A section of places, which can run long: a member may have played in
 * every state. It shows the first few, most courses first, and a button for
 * the rest, so nothing below is pushed out of reach (`shownPlaces`).
 *
 * @param id - The heading's id.
 * @param title - The heading.
 * @param noun - What the places are, for the button: "states".
 * @param places - Every place, most courses first.
 * @param children - Draws one place as a list item.
 */
function PlaceSection<T>({ id, title, noun, places, children }: { id: string; title: string; noun: string; places: readonly T[]; children: (place: T) => ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const capped = shownPlaces(places, false).length < places.length;
  return (
    <section aria-labelledby={id}>
      <h2 id={id} ref={heading} className={cx(socialStyles.sectionLabel, styles.anchor)}>
        {title}
      </h2>
      <ol className={styles.grid}>{shownPlaces(places, expanded).map(children)}</ol>
      {capped && (
        <button
          type="button"
          className={cx(socialStyles.button, styles.more)}
          aria-expanded={expanded}
          onClick={() => {
            // Folding a long list away from its foot would leave the page far below the section.
            if (expanded) heading.current?.scrollIntoView({ block: "start" });
            setExpanded(!expanded);
          }}
        >
          {expanded ? "Show fewer" : "Show all " + String(places.length) + " " + noun}
        </button>
      )}
    </section>
  );
}

/** "1 course", "14 courses". */
function courses(count: number): string {
  return count === 1 ? "1 course" : String(count) + " courses";
}

/** "13 of 100 played". */
function playedOf(list: ListProgress): string {
  return String(list.played) + " of " + String(list.size) + " played";
}

/** A row's number with its unit beside it: "5 / 100", "14 courses". */
function Count({ value, unit }: { value: number; unit: string }) {
  return (
    <span className={styles.rowCount}>
      {value} <small>{unit}</small>
    </span>
  );
}

/** A list's progress as a bar; the numbers beside it say the same in words. */
function Bar({ list }: { list: ListProgress }) {
  // A progress element's max must be above zero.
  return <progress className={styles.bar} value={list.played} max={Math.max(list.size, 1)} aria-hidden="true" />;
}

/**
 * The member's top-ranked course on a row's list or in its place, opening
 * the course's page. Nothing for a list they have played none of.
 */
function TopRanked({ whose, course }: { whose: string; course: RankedRef | null }) {
  if (!course) return null;
  return (
    <p className={styles.topRanked}>
      {whose} top-ranked: <b>#{course.rank}</b>{" "}
      <Link className={styles.courseLink} to={coursePath(course.id)}>
        {course.name}
      </Link>
    </p>
  );
}

/** "USA Top 100 has it 6th of your 7 courses on that list. You have it 1st." */
function GapText({ gap, self, listPath }: { gap: Disagreement; self: boolean; listPath: (slug: string) => string }) {
  return (
    <>
      <Link to={listPath(gap.slug)}>{gap.title}</Link> has it {ordinal(gap.listPosition)} of {self ? "your" : "their"} {gap.of} courses on that list.{" "}
      {self ? "You have" : "They have"} it {ordinal(gap.ownPosition)}.
    </>
  );
}

/** Why the course is the gem, in a sentence. */
function GemText({ gem, self, listPath }: { gem: HiddenGem; self: boolean; listPath: (slug: string) => string }) {
  const theirs = (self ? "Your" : "Their") + " #" + String(gem.course.rank);
  if (gem.reason === GemReason.RankedHigher && gem.gap) return <GapText gap={gem.gap} self={self} listPath={listPath} />;
  if (gem.reason === GemReason.StateListOnly && gem.stateList)
    return (
      <>
        {theirs}, and on no national list. It's #{gem.stateList.published} on <Link to={listPath(gem.stateList.slug)}>{gem.stateList.title}</Link>.
      </>
    );
  return <>{theirs}, and on no published list.</>;
}

/** One comparison with the lists: what it is, the course, and the sentence that explains it. */
function Note({ label, course, children }: { label: string; course: RankedRef; children: ReactNode }) {
  return (
    <div className={styles.note}>
      <span className={styles.noteLabel}>{label}</span>
      <Link className={cx(styles.courseLink, styles.noteCourse)} to={coursePath(course.id)}>
        {course.name}
      </Link>
      <p className={styles.noteText}>{children}</p>
    </div>
  );
}
