/** Path of a course's page: `/courses/<id>`. */
export function coursePath(courseId: string): string {
  return "/courses/" + encodeURIComponent(courseId);
}
