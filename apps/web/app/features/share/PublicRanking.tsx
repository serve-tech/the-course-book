import { useMemo, useState } from "react";
import { RegionFilter } from "@coursebook/domain/catalog/course";
import type { PublicRanking as Ranking } from "@coursebook/domain/friends/types";
import { coursesLabel, rankingRows } from "../journal/ranking";
import { RankingFilters } from "../journal/RankingFilters";
import { Avatar } from "../social/Avatar";
import { displayName } from "../social/paths";
import profileStyles from "../social/profile.module.css";
import { AvatarSize } from "../social/sizes";
import socialStyles from "../social/social.module.css";
import { placeCounts } from "../social/stats";
import { coursePath } from "../courses/paths";
import { CourseRow } from "../top-lists/CourseRow";
import { isFeatured } from "../top-lists/lists";
import listStyles from "../top-lists/top-lists.module.css";
import type { RankingImageContent } from "./ranking-image";
import { viewRows, type ShareView } from "@coursebook/domain/sharing/view";
import styles from "./share.module.css";
import { SEARCH_FROM, TopChoices, ViewHeader } from "./ViewHeader";

/**
 * A member's ranking as anyone sees it, signed in or not, and the place to
 * share it from: what you see here is what the link and the image show. Its
 * stats come from the courses alone, because a public ranking carries no
 * rounds (decision 2026-11-03, ranking-first product).
 *
 * @param ranking - The member and their whole ranking in order.
 * @param view - The view in the link.
 * @param onView - Changes the view, which the route keeps in the link.
 * @param signedOut - Whether to invite the visitor to make their own ranking.
 * @param onJoin - Opens sign-up.
 * @param notify - Shows a toast.
 * @param onSearchFocus - Tells the shell when the search gains or loses focus.
 * @param renderImage - Draws the image; for tests, because jsdom has no canvas.
 */
export function PublicRanking({
  ranking,
  view,
  onView,
  signedOut,
  onJoin,
  notify,
  onSearchFocus,
  renderImage,
}: {
  ranking: Ranking;
  view: ShareView;
  onView: (view: ShareView) => void;
  signedOut: boolean;
  onJoin: () => void;
  notify: (message: string) => void;
  onSearchFocus: (focused: boolean) => void;
  renderImage?: (content: RankingImageContent) => Promise<Blob>;
}) {
  const [query, setQuery] = useState("");
  const name = displayName(ranking.member);
  const { username } = ranking.member;
  const places = useMemo(() => placeCounts(ranking.rows), [ranking.rows]);
  const { region: shownRegion, top: shownTop } = view;
  // The state tab names the member's most-played state until another is chosen, so it is never a blank list.
  const tabState = view.state || (places.topStateCode ?? "");
  const shownState = shownRegion === RegionFilter.State ? tabState : "";
  const shown = useMemo<ShareView>(() => ({ region: shownRegion, state: shownState, top: shownTop }), [shownRegion, shownState, shownTop]);
  const rows = useMemo(() => viewRows(ranking.rows, shown), [ranking.rows, shown]);
  const searchable = rows.length > SEARCH_FROM;
  const searching = searchable && query.trim() !== "";
  const visible = rankingRows(rows, { region: RegionFilter.All, state: "", query: searching ? query : "" });

  return (
    <section className={listStyles.page} aria-label={name + "'s ranking"}>
      <div className={profileStyles.hero}>
        <div className={profileStyles.heroInner}>
          <Avatar member={ranking.member} size={AvatarSize.Large} />
          <hgroup className={profileStyles.identity}>
            <p className={profileStyles.eyebrow}>Course ranking</p>
            <h1 className={profileStyles.name}>{name}</h1>
            <p className={profileStyles.handle}>
              <b>@{username}</b>
            </p>
          </hgroup>
          <dl className={profileStyles.stats} aria-label="Stats">
            <Stat value={ranking.rows.length} label="Courses" />
            <Stat value={places.states} label="States" />
            <Stat value={places.countries} label="Countries" />
          </dl>
        </div>
      </div>

      <RankingFilters
        region={shown.region}
        state={tabState}
        query={query}
        onRegion={(region) => {
          onView({ ...view, region, state: region === RegionFilter.State ? tabState : "" });
          onSearchFocus(false);
        }}
        onState={(state) => {
          onView({ ...view, state });
        }}
        onQuery={setQuery}
        onSearchFocus={onSearchFocus}
        searchable={searchable}
      >
        <TopChoices
          top={view.top}
          onTop={(top) => {
            onView({ ...view, top });
          }}
        />
      </RankingFilters>

      <ViewHeader username={username} memberName={name} view={shown} rows={rows} notify={notify} render={renderImage}>
        <span id="publicRankingCount">{coursesLabel(rows.length)}</span>
        {places.topState && <> · Most courses in {places.topState}</>}
      </ViewHeader>

      {!ranking.rows.length ? (
        <div className={listStyles.empty}>{name} hasn't ranked any courses yet.</div>
      ) : !visible.length ? (
        <div className={listStyles.empty}>No courses here match.</div>
      ) : (
        <ol id="ranking" className={listStyles.list} aria-label={name + "'s ranking"}>
          {visible.map((row, index) => (
            <CourseRow
              key={row.course.id}
              course={row.course}
              rank={row.rank}
              current={null}
              marks={[]}
              // Visitors can't open a course page yet; members can.
              href={signedOut ? undefined : coursePath(row.course.id)}
              featured={isFeatured(index, !searching)}
            />
          ))}
        </ol>
      )}

      {signedOut && (
        <div className={styles.invite}>
          <p>Played a few courses? Rank them and share your own list.</p>
          <button type="button" className={[socialStyles.button, socialStyles.buttonSolid].join(" ")} onClick={onJoin}>
            Make your ranking
          </button>
        </div>
      )}
    </section>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className={profileStyles.stat}>
      <dd className={profileStyles.statValue} style={{ margin: 0 }}>
        {value}
      </dd>
      <dt className={profileStyles.statLabel}>{label}</dt>
    </div>
  );
}
