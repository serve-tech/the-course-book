/** The Top N Home opens on, once a member has more courses than that. */
const OPENING_TOP = 10;

/**
 * What Home opens on: the member's Top 10, or every course while they have ten
 * or fewer, so a short list is not titled "Top 10".
 *
 * @param courses - How many courses the member has ranked.
 * @returns The Top N to open on; null for every course.
 */
export function openingTop(courses: number): number | null {
  return courses > OPENING_TOP ? OPENING_TOP : null;
}
