import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";

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
  added?: boolean;
}

/**
 * A fetcher bound to the journal action.
 *
 * `submit` posts an intent; `onSettled` runs once per completed submission
 * with the reply, whether it succeeded or carried an error. The route
 * revalidates its loaders after every submission, so callers only need to
 * report the outcome, never patch local copies of the list.
 */
export function useJournalFetcher(onSettled?: (reply: JournalReply) => void) {
  const fetcher = useFetcher<JournalReply>();
  const seen = useRef<JournalReply | undefined>(undefined);
  const settled = useRef(onSettled);

  useEffect(() => {
    settled.current = onSettled;
  }, [onSettled]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data || fetcher.data === seen.current) return;
    seen.current = fetcher.data;
    settled.current?.(fetcher.data);
  }, [fetcher.state, fetcher.data]);

  const submit = (fields: Record<string, string>) => {
    void fetcher.submit(fields, { method: "post", action: "/journal" });
  };
  return { fetcher, busy: fetcher.state !== "idle", submit };
}

/** The message to show for a reply: the error, else the success message. */
export function replyMessage(reply: JournalReply, fallback = "Done"): string {
  return reply.error ?? reply.message ?? fallback;
}
