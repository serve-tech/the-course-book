import { api, unwrap } from ".";
import { fromMyCourse, fromWantToPlay } from "./mappers";

/** What the list pages need to know about the signed-in viewer. */
export interface ViewerCourses {
  username: string;
  /** Rounds per course id. */
  played: Record<string, number>;
  /** Ids of the courses on the viewer's Want to play list. */
  wanted: string[];
}

/**
 * Load the viewer's courses and Want to play list. Call it only when
 * signed in; Want to play is read by username, so it waits for `/v1/me`.
 */
export async function loadViewerCourses(): Promise<ViewerCourses> {
  const [me, mine] = await Promise.all([api.GET("/v1/me").then(unwrap), api.GET("/v1/me/courses").then(unwrap)]);
  const wanted = fromWantToPlay(unwrap(await api.GET("/v1/members/{username}/want-to-play", { params: { path: { username: me.username } } })));
  const entries = mine.courses.map(fromMyCourse);
  return {
    username: me.username,
    played: Object.fromEntries(entries.map((entry) => [entry.course.id, entry.played])),
    wanted: wanted.map((entry) => entry.course.id),
  };
}
