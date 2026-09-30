import { useActionFetcher } from "../../shared/lib/use-action-fetcher";

/** Reply shape of the `/journal` action as seen by fetchers. */
export interface JournalReply {
  ok?: boolean;
  message?: string;
  error?: string;
  rank?: number;
  count?: number;
  removed?: boolean;
  removedCourse?: boolean;
  courseId?: string;
  /** Rounds a log created, for Undo. */
  roundIds?: string[];
}

/**
 * A fetcher bound to the journal action; see `useActionFetcher`.
 */
export function useJournalFetcher(onSettled?: (reply: JournalReply) => void) {
  return useActionFetcher<JournalReply>("/journal", onSettled);
}

/** The message to show for a reply: the error, else the success message. */
export function replyMessage(reply: JournalReply, fallback = "Done"): string {
  return reply.error ?? reply.message ?? fallback;
}
