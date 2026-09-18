import { useState } from "react";
import type { Course } from "../catalog/course";
import { useServices } from "../../app/context";
import { errorMessage } from "../../shared/lib/errors";
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
  const { rounds } = useServices(),
    [value, setValue] = useState(String(count)),
    [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const quantity = Math.max(0, Number.parseInt(value) || 0);
      await rounds.setCount(course, quantity);
      onClose();
      notify(
        quantity ? "Rounds updated to " + String(quantity) : "Course removed",
      );
    } catch (error) {
      notify(errorMessage(error));
      setBusy(false);
    }
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
              if (event.key === "Enter") void save();
              if (event.key === "Escape") onClose();
            }}
          />
          <div className="counteditactions">
            <button
              className="savecount"
              onClick={() => {
                void save();
              }}
            >
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
