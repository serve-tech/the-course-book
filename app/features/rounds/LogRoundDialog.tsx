import { useEffect, useState } from "react";
import type { SearchResult } from "../catalog/search-results";
import { deriveState, isUSCourse, withUSState } from "../catalog/geography";
import { Modal } from "../../shared/ui/Modal";
import { StateSelect } from "../../shared/ui/StateSelect";
import { errorMessage } from "../../shared/lib/errors";
import { replyMessage, useJournalFetcher } from "../journal/use-journal-fetcher";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEARCH_DEBOUNCE_MS = 180;

interface SearchFailure {
  error: string;
}

/**
 * Log a round: search courses through the server, pick one, set the count.
 * A result that resolved to a catalog course posts its id; anything else
 * posts the course details for the server to find or create.
 */
export function LogRoundDialog({
  signedIn,
  played,
  onClose,
  onAdd,
  onSignIn,
  notify,
}: {
  signedIn: boolean;
  played: Readonly<Record<string, number>>;
  onClose: () => void;
  onAdd: () => void;
  onSignIn: () => void;
  notify: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [retry, setRetry] = useState(0);
  const [searchError, setSearchError] = useState("");
  const { busy, submit } = useJournalFetcher((reply) => {
    notify(replyMessage(reply));
    if (!reply.error) onClose();
  });

  useEffect(() => {
    if (!signedIn || selected) return;
    const text = query.trim();
    if (text.length < 2) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetch("/api/course-search?q=" + encodeURIComponent(text), {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      })
        .then(async (response) => {
          const body = (await response.json()) as SearchResult[] | SearchFailure;
          if (!response.ok || !Array.isArray(body))
            throw new Error(
              Array.isArray(body) ? "Course search failed" : body.error,
            );
          return body;
        })
        .then(
          (value) => {
            if (controller.signal.aborted) return;
            setSearchError("");
            setResults(value);
          },
          (error: unknown) => {
            if (controller.signal.aborted) return;
            console.warn("Course search failed", error);
            setResults([]);
            setSearchError(
              errorMessage(error, "Course search is temporarily unavailable. Please try again."),
            );
          },
        );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query, retry, selected, signedIn]);

  const changeQuery = (value: string) => {
    setQuery(value);
    setResults([]);
    setSearchError("");
  };

  const choose = (result: SearchResult) => {
    setSelected(result);
    setQuantity("1");
    setQuery(result.course.name);
    setResults([]);
    setSearchError("");
  };

  const needsState =
    selected !== null && isUSCourse(selected.display) && !deriveState(selected.display);

  const log = () => {
    if (!selected || busy) return;
    if (needsState) {
      notify("Select a state before logging this U.S. course");
      return;
    }
    const course = selected.course;
    const count = Math.max(1, Math.floor(Number(quantity)) || 1);
    submit({
      intent: "log",
      quantity: String(count),
      ...(UUID.test(course.id)
        ? { courseId: course.id }
        : {
            course: JSON.stringify({
              name: course.name,
              location: course.location,
              city: course.city,
              state: course.state,
              country: course.country,
              logo: course.logo,
              website: course.website,
            }),
          }),
    });
  };

  return (
    <Modal
      id="modal"
      className="logmodal"
      title="Log a Round"
      eyebrow="Round log"
      onClose={onClose}
    >
      <div className="sub" id="modalSub">
        {selected
          ? needsState
            ? "This U.S. course is missing a state. Select the state before logging the round."
            : "How many rounds are you adding?"
          : "Search for the course you played."}
      </div>

      {!selected && (
        <>
          <div className="group searchgroup">
            <label htmlFor="modalsearch">Course</label>
            <input
              id="modalsearch"
              autoFocus
              autoComplete="off"
              placeholder="Start typing a course name..."
              value={query}
              disabled={!signedIn}
              onChange={(event) => {
                changeQuery(event.target.value);
              }}
            />
          </div>

          <div id="results">
            {!signedIn ? (
              <div className="empty">
                Sign in to log rounds.
                <button className="primary" onClick={onSignIn}>
                  Sign In
                </button>
              </div>
            ) : searchError ? (
              <div className="empty">
                {searchError}
                <button
                  className="secondary"
                  id="apiRetry"
                  onClick={() => {
                    setSearchError("");
                    setResults([]);
                    setRetry((value) => value + 1);
                  }}
                >
                  Retry
                </button>
              </div>
            ) : results.length ? (
              results.map((result) => {
                const course = result.display;
                return (
                  <button
                    className="result"
                    key={course.id}
                    onClick={() => {
                      choose(result);
                    }}
                  >
                    <strong>{course.name}</strong>
                    <small>
                      {course.location}
                      {course.michigan ? " · Michigan #" + String(course.michigan) : ""}
                      {course.usa ? " · USA #" + String(course.usa) : ""}
                      {course.world ? " · World #" + String(course.world) : ""}
                      {course.public ? " · Public #" + String(course.public) : ""}
                    </small>
                  </button>
                );
              })
            ) : (
              <div className="empty">
                {query.trim().length < 2
                  ? "Start typing a course name."
                  : "No courses found. Add the course below."}
                {query.trim().length >= 2 && (
                  <button
                    className="secondary"
                    id="apiRetry"
                    onClick={() => {
                      setRetry((value) => value + 1);
                    }}
                  >
                    Retry
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="actions" id="searchActions">
            <button className="secondary" id="add" onClick={onAdd}>
              + Add Course
            </button>
          </div>
        </>
      )}

      {selected && (
        <div id="quantityBox">
          <div className="selectedcourse" id="selectedCourseCard">
            <strong>{selected.display.name}</strong>
            <small>
              {selected.display.location || "Location not specified"}
              {played[selected.course.id]
                ? " · Already played " + String(played[selected.course.id]) + "×"
                : ""}
            </small>
            {needsState && (
              <>
                <div className="selectedcourse-state">
                  <label htmlFor="logCourseState">
                    State <span aria-hidden="true">*</span>
                  </label>
                  <StateSelect
                    id="logCourseState"
                    value={selected.display.state}
                    includeDC
                    onChange={(value) => {
                      const course = withUSState(selected.course, value);
                      setSelected({ course, display: course });
                    }}
                  />
                </div>
                <div className="required-note">State is required for U.S. courses.</div>
              </>
            )}
          </div>

          <div className="quantity">
            <div>
              <div className="quantitylabel">Times played</div>
              <div className="quantityhint">How many rounds are you adding?</div>
            </div>
            <input
              id="timesPlayed"
              autoFocus
              aria-label="Times played"
              onFocus={(event) => {
                event.currentTarget.select();
                setTimeout(() => {
                  document.getElementById("confirmLog")?.scrollIntoView({ block: "nearest" });
                }, 300);
              }}
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={quantity}
              onChange={(event) => {
                setQuantity(event.target.value);
              }}
            />
          </div>

          <div className="actions logactions">
            <button
              className="secondary"
              id="backToSearch"
              onClick={() => {
                setSelected(null);
                setResults([]);
                changeQuery(query);
              }}
            >
              Change Course
            </button>
            <button className="primary" id="confirmLog" disabled={busy} onClick={log}>
              {busy ? "Saving…" : "Log Round"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
