import { useEffect, useState } from "react";
import type { Course } from "@coursebook/domain/catalog/course";
import { CourseSearchSource, type SearchResult } from "@coursebook/domain/catalog/search-results";
import { deriveState, isUSCourse, withUSState } from "@coursebook/domain/catalog/geography";
import { Modal } from "../../shared/ui/Modal";
import type { Notify } from "../../shared/ui/shell";
import { StateSelect } from "../../shared/ui/StateSelect";
import { apiFailureMessage } from "../../shared/lib/errors";
import { localDate } from "../../shared/lib/local-date";
import { api, unwrap } from "../../lib/api";
import { fromSearchHit } from "../../lib/api/mappers";
import { replyMessage, useJournalFetcher } from "../journal/use-journal-fetcher";
import styles from "./course-search.module.css";

const SEARCH_DEBOUNCE_MS = 180;

/**
 * Log a round: search courses through the API, pick one, set the count and
 * the date played (today unless changed). The toast afterwards offers Undo,
 * which deletes exactly the rounds just logged. A hit already in the catalog
 * posts its id; anything else posts the course details for the API to find
 * or create.
 *
 * @param initial - A catalog course to log, skipping the search (a course row's Log button).
 * @param onAdd - Opens the hand-entered course dialog; the "+ Add Course" button shows only with it.
 */
export function LogRoundDialog({
  signedIn,
  played,
  onClose,
  onAdd,
  onSignIn,
  notify,
  initial = null,
}: {
  signedIn: boolean;
  played: Readonly<Record<string, number>>;
  onClose: () => void;
  onAdd?: () => void;
  onSignIn: () => void;
  notify: Notify;
  initial?: Course | null;
}) {
  const [query, setQuery] = useState(initial?.name ?? "");
  const [source, setSource] = useState(CourseSearchSource.Catalog);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<SearchResult | null>(
    initial ? { course: initial, display: initial, catalogId: initial.id } : null,
  );
  const [quantity, setQuantity] = useState("1");
  const [today] = useState(localDate);
  const [playedOn, setPlayedOn] = useState(today);
  const [retry, setRetry] = useState(0);
  const [searchError, setSearchError] = useState("");
  const { busy, submit } = useJournalFetcher((reply) => {
    const logged = reply.roundIds ?? [];
    notify(replyMessage(reply), logged.length ? { label: "Undo", fields: { intent: "undo-log", roundIds: logged.join(",") } } : undefined);
    if (!reply.error) onClose();
  });

  useEffect(() => {
    if (!signedIn || selected) return;
    const text = query.trim();
    if (text.length < 2) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      api
        .GET("/v1/course-search", { params: { query: { q: text, page, source } }, signal: controller.signal })
        .then((result) => {
          const value = unwrap(result);
          return { ...value, results: value.results.map(fromSearchHit) };
        })
        .then(
          (value) => {
            if (controller.signal.aborted) return;
            setSearchError("");
            setResults(value.results);
            setTotal(value.total);
            setPageSize(value.pageSize);
            setLoading(false);
          },
          (error: unknown) => {
            if (controller.signal.aborted) return;
            console.warn("Course search failed", error);
            setResults([]);
            setLoading(false);
            setSearchError(
              apiFailureMessage(error) ?? "Course search is temporarily unavailable. Please try again.",
            );
          },
        );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query, page, source, retry, selected, signedIn]);

  const changeQuery = (value: string) => {
    setQuery(value);
    setSource(CourseSearchSource.Catalog);
    setPage(1);
    setTotal(0);
    setLoading(signedIn && value.trim().length >= 2);
    setResults([]);
    setSearchError("");
  };

  const changeSource = (value: CourseSearchSource) => {
    setSource(value);
    setPage(1);
    setTotal(0);
    setResults([]);
    setSearchError("");
    setLoading(true);
  };

  const changePage = (value: number) => {
    setPage(value);
    setResults([]);
    setSearchError("");
    setLoading(true);
  };

  const retrySearch = () => {
    setSearchError("");
    setResults([]);
    setLoading(true);
    setRetry((value) => value + 1);
  };

  const choose = (result: SearchResult) => {
    setSelected(result);
    setLoading(false);
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
    if (!playedOn || playedOn > today) {
      notify("Choose the date you played, today or earlier");
      return;
    }
    const course = selected.course;
    const count = Math.max(1, Math.floor(Number(quantity)) || 1);
    submit({
      intent: "log",
      quantity: String(count),
      playedAt: playedOn,
      ...(selected.catalogId
        ? { courseId: selected.catalogId }
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
            ) : loading ? (
              <div className="empty" role="status">Searching courses…</div>
            ) : searchError ? (
              <div className="empty" role="alert">
                {searchError}
                <button
                  className="secondary"
                  id="apiRetry"
                  onClick={retrySearch}
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
                      {course.global ? " · World #" + String(course.global) : ""}
                      {course.usa ? " · USA #" + String(course.usa) : ""}
                      {course.world ? " · International #" + String(course.world) : ""}
                      {course.public ? " · Public #" + String(course.public) : ""}
                    </small>
                  </button>
                );
              })
            ) : (
              <div className="empty">
                {query.trim().length < 2
                  ? "Start typing a course name."
                  : page > 1
                    ? "No courses on this page. Try the previous page."
                    : source === CourseSearchSource.Catalog
                      ? "No courses found in our catalog. Try Search more courses."
                      : onAdd
                        ? "No courses found. Add the course below."
                        : "No courses found."}
                {query.trim().length >= 2 && (
                  <button
                    className="secondary"
                    id="apiRetry"
                    onClick={retrySearch}
                  >
                    Retry
                  </button>
                )}
              </div>
            )}
          </div>

          {signedIn && (total > 0 || page > 1) && (
            <div className={styles["pagination"]} role="group" aria-label="Course search pages">
              <div className={styles["summary"]} role="status">
                {total} {total === 1 ? "course" : "courses"} · A–Z · Page {page} of {Math.max(page, Math.ceil(total / pageSize))}
              </div>
              <button className="secondary" disabled={loading || page <= 1} onClick={() => { changePage(page - 1); }}>
                Previous
              </button>
              <button className="secondary" disabled={loading || page * pageSize >= total} onClick={() => { changePage(page + 1); }}>
                Next
              </button>
            </div>
          )}

          {signedIn && query.trim().length >= 2 && (
            <div className={styles["discovery"]}>
              <p>{source === CourseSearchSource.Catalog ? "Can't find your course? Search beyond our catalog." : "Showing results from OpenGolfAPI."}</p>
              <button
                className="secondary"
                disabled={loading}
                onClick={() => { changeSource(source === CourseSearchSource.Catalog ? CourseSearchSource.External : CourseSearchSource.Catalog); }}
              >
                {source === CourseSearchSource.Catalog ? "Search more courses" : "Back to catalog"}
              </button>
            </div>
          )}

          <div className="actions" id="searchActions">
            {onAdd && (
              <button className="secondary" id="add" onClick={onAdd}>
                + Add Course
              </button>
            )}
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
                      setSelected({ ...selected, course, display: course });
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

          <div className="quantity">
            <div>
              <div className="quantitylabel">Date played</div>
              <div className="quantityhint">Today, unless you're catching up.</div>
            </div>
            <input
              id="playedOn"
              type="date"
              aria-label="Date played"
              max={today}
              required
              value={playedOn}
              onChange={(event) => {
                setPlayedOn(event.target.value);
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
