import type { Course } from "@coursebook/domain/catalog/course";
import { MemberRole, type CommonsCandidate, type CurationCourse, type RoledMember } from "@coursebook/domain/curation/types";
import { useState } from "react";
import { Form, Link, useNavigate } from "react-router";
import { cx } from "../../shared/lib/cx";
import { useActionFetcher } from "../../shared/lib/use-action-fetcher";
import { PageHeader } from "../../shared/ui/PageHeader";
import { CourseImage } from "../courses/CourseImage";
import { CreditStyle } from "../courses/credit-style";
import { coursePath } from "../courses/paths";
import { Avatar } from "../social/Avatar";
import { displayName } from "../social/paths";
import { AvatarSize } from "../social/sizes";
import { CurationFilter, CurationTab, filterCourses, openingFilter, photoProgress } from "./curation";
import styles from "./curation.module.css";

/** Reply shape of the curator screen's action. */
export interface CurationReply {
  ok?: boolean;
  message?: string;
  error?: string;
  /** The course whose photo was set, to return to the list. */
  courseId?: string;
}

/** What the curator screen's loader found. */
export type CurationView =
  | { role: MemberRole; tab: CurationTab.Curators; members: RoledMember[] }
  | {
      role: MemberRole;
      tab: CurationTab.Photos;
      courses: CurationCourse[];
      picking: { course: Course; query: string; candidates: CommonsCandidate[]; searchError: string | null } | null;
    };

const ACTION = "/curate";

/**
 * The curator screen (decision 2026-11-13): the courses members rank with
 * how far their photos have come, a Wikimedia Commons search for one
 * course, and, for admins, who curates. Photos come only from Commons until
 * uploads arrive with R2 (#67).
 *
 * @param view - What the route's loader found.
 * @param notify - Shows the outcome of a change as a toast.
 */
export function CurationPage({ view, notify }: { view: CurationView; notify: (message: string) => void }) {
  const admin = view.role === MemberRole.Admin;
  const progress = view.tab === CurationTab.Photos ? photoProgress(view.courses) : null;
  return (
    <section className={styles.page} aria-labelledby="curation-title">
      <PageHeader
        eyebrow="Curate"
        title="Course photos"
        titleId="curation-title"
        lede="Give every course members rank a free-licensed photo from Wikimedia Commons. Its credit and license come with it."
        aside={
          progress && (
            <div className={styles.progress}>
              <p className={styles.progressLabel}>Photos</p>
              <p className={styles.progressLine}>
                <b>{progress.withPhoto}</b> of {progress.total} courses
              </p>
              <div className={styles.bar} aria-hidden="true">
                <span style={{ width: progress.total ? String((progress.withPhoto / progress.total) * 100) + "%" : "0%" }} />
              </div>
            </div>
          )
        }
      />
      {admin && (
        <nav className={styles.tabs} aria-label="Curation">
          <Link to={ACTION} className={styles.tab} aria-current={view.tab === CurationTab.Photos ? "page" : undefined}>
            Photos
          </Link>
          <Link to={ACTION + "?tab=" + CurationTab.Curators} className={styles.tab} aria-current={view.tab === CurationTab.Curators ? "page" : undefined}>
            Curators
          </Link>
        </nav>
      )}
      {view.tab === CurationTab.Curators ? (
        <Curators members={view.members} notify={notify} />
      ) : view.picking ? (
        <PhotoPicker {...view.picking} notify={notify} />
      ) : (
        <CourseList courses={view.courses} />
      )}
    </section>
  );
}

/** The courses members rank, those still missing a photo first. */
function CourseList({ courses }: { courses: readonly CurationCourse[] }) {
  const [filter, setFilter] = useState(() => openingFilter(courses));
  const shown = filterCourses(courses, filter);
  const missing = courses.length - photoProgress(courses).withPhoto;
  return (
    <>
      <div className={styles.filters} role="group" aria-label="Show">
        <button type="button" className={styles.filter} aria-pressed={filter === CurationFilter.Missing} onClick={() => { setFilter(CurationFilter.Missing); }}>
          Needs a photo ({missing})
        </button>
        <button type="button" className={styles.filter} aria-pressed={filter === CurationFilter.All} onClick={() => { setFilter(CurationFilter.All); }}>
          All ({courses.length})
        </button>
      </div>
      {shown.length === 0 ? (
        <p className={styles.quiet}>Every course members rank has a photo.</p>
      ) : (
        <ul className={styles.courses} aria-label="Courses">
          {shown.map(({ course, members }) => (
            <li key={course.id}>
              <Link to={ACTION + "?course=" + encodeURIComponent(course.id)} className={styles.course}>
                <CourseImage course={course} credit={CreditStyle.None} className={styles.courseThumb} />
                <span className={styles.courseText}>
                  <span className={styles.courseName}>{course.name}</span>
                  <span className={styles.coursePlace}>{course.location}</span>
                </span>
                <span className={styles.courseMembers}>
                  {members} {members === 1 ? "member" : "members"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** One course: its photo now, and Commons photos to choose from. */
function PhotoPicker({
  course,
  query,
  candidates,
  searchError,
  notify,
}: {
  course: Course;
  query: string;
  candidates: CommonsCandidate[];
  searchError: string | null;
  notify: (message: string) => void;
}) {
  const navigate = useNavigate();
  const action = useActionFetcher<CurationReply>(ACTION, (reply) => {
    notify(reply.error ?? reply.message ?? "Done");
    if (reply.ok && reply.courseId) void navigate(ACTION);
  });
  const pendingFile = action.busy ? action.fetcher.formData?.get("file") : null;

  return (
    <div className={styles.picker}>
      <Link to={ACTION} className={styles.back}>
        ← All courses
      </Link>
      <div className={styles.current}>
        <CourseImage course={course} credit={CreditStyle.Link} className={styles.currentImage} />
        <div className={styles.currentText}>
          <h2 className={styles.heading}>{course.name}</h2>
          <p className={styles.quiet}>{course.location}</p>
          <div className={styles.currentActions}>
            <Link to={coursePath(course.id)} className={cx(styles.button, styles.buttonGhost)}>
              Course page
            </Link>
            {course.photo && (
              <button
                type="button"
                className={cx(styles.button, styles.buttonGhost)}
                disabled={action.busy}
                onClick={() => {
                  action.submit({ intent: "remove-photo", courseId: course.id });
                }}
              >
                Remove photo
              </button>
            )}
          </div>
        </div>
      </div>

      <section className={styles.results} aria-labelledby="commons-heading">
        <h3 id="commons-heading" className={styles.subheading}>
          Photos on Wikimedia Commons
        </h3>
        <Form method="get" action={ACTION} className={styles.search} role="search">
          <input type="hidden" name="course" value={course.id} />
          <input type="search" name="q" defaultValue={query} aria-label="Search Wikimedia Commons" minLength={2} required />
          <button type="submit" className={styles.button}>
            Search
          </button>
        </Form>
        {searchError ? (
          <p className={styles.error} role="alert">
            {searchError}
          </p>
        ) : candidates.length === 0 ? (
          <p className={styles.quiet}>No usable photos for “{query}”. Try fewer words, or the club's or town's name.</p>
        ) : (
          <ul className={styles.candidates} aria-label="Commons photos">
            {candidates.map((candidate) => {
              const current = course.photo?.sourceUrl === candidate.sourceUrl;
              return (
                <li key={candidate.file} className={styles.candidate}>
                  <img src={candidate.thumbUrl} alt={candidate.description || candidate.file} loading="lazy" />
                  <div className={styles.candidateText}>
                    <p className={styles.candidateCredit}>
                      <a href={candidate.sourceUrl} target="_blank" rel="noreferrer">
                        {candidate.credit}
                      </a>{" "}
                      · {candidate.license}
                    </p>
                    <p className={styles.candidateMeta}>
                      {candidate.width} × {candidate.height}
                      {candidate.description && " · " + candidate.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={cx(styles.button, current && styles.buttonGhost)}
                    disabled={current || action.busy}
                    onClick={() => {
                      action.submit({ intent: "set-photo", courseId: course.id, file: candidate.file });
                    }}
                  >
                    {current ? "Current photo" : pendingFile === candidate.file ? "Saving…" : "Use this photo"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Every member and their role; admins make members curators and back. */
function Curators({ members, notify }: { members: readonly RoledMember[]; notify: (message: string) => void }) {
  const action = useActionFetcher<CurationReply>(ACTION, (reply) => {
    notify(reply.error ?? reply.message ?? "Done");
  });
  return (
    <ul className={styles.members} aria-label="Members">
      {members.map(({ member, role }) => (
        <li key={member.username} className={styles.memberRow}>
          <Avatar member={member} size={AvatarSize.Small} />
          <span className={styles.courseText}>
            <span className={styles.courseName}>{displayName(member)}</span>
            <span className={styles.coursePlace}>@{member.username}</span>
          </span>
          {role === MemberRole.Admin ? (
            <span className={styles.roleBadge}>Admin</span>
          ) : (
            <button
              type="button"
              className={cx(styles.button, role === MemberRole.Curator && styles.buttonGhost)}
              disabled={action.busy}
              onClick={() => {
                action.submit({ intent: "set-role", username: member.username, role: role === MemberRole.Curator ? MemberRole.Member : MemberRole.Curator });
              }}
            >
              {role === MemberRole.Curator ? "Remove curator" : "Make curator"}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
