import { useState } from "react";
import type { Course } from "@coursebook/domain/catalog/course";
import { replyMessage, useJournalFetcher } from "./use-journal-fetcher";

/** Inline "times played" editor for one list row; posts the set-count intent. */
export function CountEditor({
  course,
  count,
  onClose,
  notify,
}: {
  course: Course;
  count: number;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const [value, setValue] = useState(String(count));
  const { busy, submit } = useJournalFetcher((reply) => {
    notify(replyMessage(reply));
    if (!reply.error) onClose();
  });
  const save = () => {
    if (busy) return;
    const quantity = Math.max(0, Number.parseInt(value) || 0);
    submit({ intent: "set-count", courseId: course.id, count: String(quantity) });
  };
  return (
    <div
      className="count editing"
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      {busy ? (
        "Saving…"
      ) : (
        <>
          <input
            autoFocus
            onFocus={(event) => {
              event.currentTarget.select();
            }}
            className="counteditinput"
            type="number"
            min="0"
            inputMode="numeric"
            value={value}
            aria-label="Times played"
            onChange={(event) => {
              setValue(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") save();
              if (event.key === "Escape") onClose();
            }}
          />
          <div className="counteditactions">
            <button className="savecount" onClick={save}>
              Save
            </button>
            <button className="cancelcount" onClick={onClose}>
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
