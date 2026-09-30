import { ProfileRelationship } from "@coursebook/domain/social/types";
import type { Route } from "./+types/profile.stats";
import { useProfileData } from "./profile";
import { ComingSoon } from "../features/social/ComingSoon";
import { CourseTile } from "../features/social/CourseTile";
import { TileSize } from "../features/social/sizes";
import profileStyles from "../features/social/profile.module.css";
import styles from "../features/social/social.module.css";
import { placeStats } from "../features/social/stats";
import { RouteError } from "../shared/ui/RouteError";

/** The Stats tab: where the member has played, from their ranking; charts to come. */
export default function ProfileStats() {
  const { profile, list } = useProfileData();
  const places = placeStats(list.rows);
  const top = places.mostPlayed;
  return (
    <div className={profileStyles.columns}>
      <section className={profileStyles.section} aria-labelledby="places">
        <h2 id="places" className={styles.sectionLabel}>
          {profile.relationship === ProfileRelationship.Self ? "Where you've played" : "Where they've played"}
        </h2>
        <dl className={profileStyles.stats} style={{ justifyContent: "start", marginBottom: 26 }}>
          <div className={profileStyles.stat}>
            <dd className={profileStyles.statValue} style={{ margin: 0 }}>
              {profile.stats.courses}
            </dd>
            <dt className={profileStyles.statLabel}>Courses</dt>
          </div>
          <div className={profileStyles.stat}>
            <dd className={profileStyles.statValue} style={{ margin: 0 }}>
              {places.states}
            </dd>
            <dt className={profileStyles.statLabel}>States</dt>
          </div>
          <div className={profileStyles.stat}>
            <dd className={profileStyles.statValue} style={{ margin: 0 }}>
              {places.countries}
            </dd>
            <dt className={profileStyles.statLabel}>Countries</dt>
          </div>
          <div className={profileStyles.stat}>
            <dd className={profileStyles.statValue} style={{ margin: 0 }}>
              {profile.stats.rounds}
            </dd>
            <dt className={profileStyles.statLabel}>Rounds</dt>
          </div>
        </dl>
        {top && top.played > 1 && (
          <div className={profileStyles.rankRow} style={{ gridTemplateColumns: "44px minmax(0, 1fr) auto" }}>
            <CourseTile course={top.course} size={TileSize.Thumb} />
            <div>
              <span className={profileStyles.entryName}>{top.course.name}</span>
              <div className={profileStyles.rankPlace}>Most played · {top.course.location}</div>
            </div>
            <span className={profileStyles.you}>
              <b>{top.played}</b> rounds
            </span>
          </div>
        )}
        {places.topState && <p className={profileStyles.editHint} style={{ marginTop: 14 }}>Most courses in {places.topState}.</p>}
      </section>
      <aside className={profileStyles.aside}>
        <ComingSoon title="Charts and records">Rounds by year, a map of every course, scoring and a year in golf you can share.</ComingSoon>
      </aside>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteError error={error} />;
}
