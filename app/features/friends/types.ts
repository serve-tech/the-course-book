import type { Course } from "../catalog/course";

/**
 * Member directory shapes shared by the server modules that produce them and
 * the Friends page. Nothing here carries an email address or a user id.
 */

/** Another member as the directory shows them. */
export interface PublicMember {
  username: string;
  displayName: string;
}

/** One course on another member's list, relative to the viewer. */
export interface MemberListRow {
  course: Course;
  rank: number;
  /** Whether the viewer already has this course (by id or equivalent identity). */
  onMyList: boolean;
}

/** Another member's list as the viewer sees it. */
export interface MemberList {
  member: PublicMember;
  rows: MemberListRow[];
}
