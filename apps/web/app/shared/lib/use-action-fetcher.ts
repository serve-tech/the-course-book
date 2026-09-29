import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";

/**
 * A fetcher bound to one route action.
 *
 * `submit` posts form fields to `action`; `onSettled` runs once per
 * completed submission with the reply, whether it succeeded or carried an
 * error. React Router revalidates active loaders after every submission, so
 * callers only report the outcome, never patch local copies of loader data.
 *
 * Args:
 *     action: The route path whose `clientAction` handles the submission.
 *     onSettled: Called with each reply once the fetcher is idle again.
 *
 * Returns:
 *     `fetcher` (for `formData` while pending), `busy` and `submit`.
 */
export function useActionFetcher<Reply>(action: string, onSettled?: (reply: Reply) => void) {
  const fetcher = useFetcher<Reply>();
  // Replies are plain JSON objects, so serializing leaves their type as is;
  // TypeScript cannot prove that for an unconstrained type parameter.
  const reply = fetcher.data as Reply | undefined;
  const seen = useRef<Reply | undefined>(undefined);
  const settled = useRef(onSettled);

  useEffect(() => {
    settled.current = onSettled;
  }, [onSettled]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !reply || reply === seen.current) return;
    seen.current = reply;
    settled.current?.(reply);
  }, [fetcher.state, reply]);

  const submit = (fields: Record<string, string>) => {
    void fetcher.submit(fields, { method: "post", action });
  };
  return { fetcher, busy: fetcher.state !== "idle", submit };
}
