/**
 * Success messages for journal changes. The API returns data, not UI text;
 * these are the words the toast shows.
 */

const rounds = (count: number) => `${String(count)} round${count === 1 ? "" : "s"}`;

export const replyMessages = {
  logged: (count: number) => rounds(count) + " added",
  addedToList: (added: boolean) => (added ? "Added to My List" : "Already on your list"),
  addedCourse: (rank: number) => "Course added at #" + String(rank),
  moved: (rank: number) => "Moved to #" + String(rank),
  counted: (count: number, removed: boolean) => (removed ? "Course removed" : "Rounds updated to " + String(count)),
  deletedRound: (removedCourse: boolean) =>
    removedCourse ? "Round deleted; course removed from My List" : "Round deleted",
  deletedCourse: () => "Course deleted from My List",
};
