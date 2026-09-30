import { getToken } from "@clerk/react-router";
import { ProfileRelationship } from "@coursebook/domain/social/types";
import { Link } from "react-router";
import type { Route } from "./+types/profile.timeline";
import { profileUnavailable, useProfileData } from "./profile";
import { displayName, profilePath } from "../features/social/paths";
import { ComingSoon } from "../features/social/ComingSoon";
import { ComparisonCard } from "../features/social/ComparisonCard";
import { TimelineView } from "../features/social/TimelineView";
import { timelineKey } from "../features/social/format";
import { TopFour } from "../features/social/TopFour";
import profileStyles from "../features/social/profile.module.css";
import styles from "../features/social/social.module.css";
import { nationalProgress } from "../features/social/stats";
import { api, unwrap } from "../lib/api";
import { fromTimelineRound } from "../lib/api/mappers";
import { RouteError } from "../shared/ui/RouteError";

const FIRST_PAGE = 20;

/** The first page of the member's timeline. */
export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  if (!(await getToken())) return { rounds: [], nextCursor: null };
  try {
    const page = unwrap(
      await api.GET("/v1/members/{username}/rounds", { params: { path: { username: params.username }, query: { limit: FIRST_PAGE } } }),
    );
    return { rounds: page.rounds.map(fromTimelineRound), nextCursor: page.nextCursor };
  } catch (error) {
    throw profileUnavailable(error);
  }
}

/** The profile's main tab: Top Four and the timeline, with comparisons and Top list progress alongside. */
export default function ProfileTimeline({ loaderData, params }: Route.ComponentProps) {
  const { profile, list } = useProfileData();
  const self = profile.relationship === ProfileRelationship.Self;
  const name = displayName(profile.member);
  return (
    <div className={profileStyles.columns}>
      <div className={profileStyles.section}>
        <TopFour rows={profile.topFour} self={self} />
        <section className={profileStyles.section} aria-labelledby="timeline">
          <h2 id="timeline" className={styles.sectionLabel}>
            Timeline
          </h2>
          <TimelineView key={timelineKey(params.username, loaderData)} username={params.username} first={loaderData} self={self} />
        </section>
      </div>
      <aside className={profileStyles.aside}>
        {profile.comparison && <ComparisonCard comparison={profile.comparison} name={name} />}
        <section aria-labelledby="progress">
          <h2 id="progress" className={styles.sectionLabel}>
            Top lists <Link to={profilePath(profile.member.username, "lists")}>All</Link>
          </h2>
          <div className={profileStyles.progressList}>
            {nationalProgress(list.rows).map((item) => (
              <div key={item.title} className={profileStyles.progressRow}>
                <div className={profileStyles.progressHead}>
                  <span className={profileStyles.progressTitle}>{item.title}</span>
                  <span className={profileStyles.progressCount}>
                    {item.played}
                    <small> / {item.size}</small>
                  </span>
                </div>
                <div className={profileStyles.bar} role="progressbar" aria-label={item.title} aria-valuemin={0} aria-valuemax={item.size} aria-valuenow={item.played}>
                  <span style={{ width: String(item.played) + "%" }} />
                </div>
              </div>
            ))}
          </div>
        </section>
        {self ? (
          <ComingSoon title="Want to play">Save the courses you want to play and see which friends want them too.</ComingSoon>
        ) : (
          <ComingSoon title={"You and " + name + " both want to play"}>The courses on both your Want to play lists, for planning the next trip.</ComingSoon>
        )}
      </aside>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteError error={error} />;
}
