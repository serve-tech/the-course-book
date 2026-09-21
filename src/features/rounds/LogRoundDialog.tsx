import { useEffect, useState } from "react";
import { useJournal, useServices } from "../../app/context";
import type { SearchResult } from "../catalog/search-results";
import {
  deriveState,
  isUSCourse,
  stateName,
  withUSState,
} from "../catalog/geography";
import { Modal } from "../../shared/ui/Modal";
import { StateSelect } from "../../shared/ui/StateSelect";
import { errorMessage } from "../../shared/lib/errors";

export function LogRoundDialog({
  onClose,
  onAdd,
  onSignIn,
  notify,
}: {
  onClose: () => void;
  onAdd: () => void;
  onSignIn: () => void;
  notify: (message: string) => void;
}) {
  const { search, catalog, journal, rounds } = useServices(),
    { user, account } = useJournal();

  const [query, setQuery] = useState(""),
    [results, setResults] = useState<SearchResult[]>(() =>
      search.local(""),
    ),
    [selected, setSelected] = useState<SearchResult | null>(
      null,
    ),
    [quantity, setQuantity] = useState("1"),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0);

  const [session] = useState(Date.now);

  useEffect(() => {
    if (!user || selected) return;

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      void search.search(
        query,
        session,
        controller.signal,
      ).then(
        (value) => {
          if (!controller.signal.aborted) setResults(value);
        },
        (error: unknown) => {
          if (!controller.signal.aborted)
            console.warn(
              "Course search failed",
              error,
            );
        },
      );
    }, 180);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [
    query,
    retry,
    search,
    selected,
    user,
    session,
  ]);

  const changeQuery = (value: string) => {
    setQuery(value);

    /*
     * Keep the immediate local response for an empty/very short
     * query. Once the user has typed two or more characters,
     * SearchService.search() becomes the source of truth and
     * searches OpenGolfAPI.
     */
    if (value.trim().length < 2)
      setResults(
        search.local(value.trim().toLowerCase()),
      );
  };

  const choose = (result: SearchResult) => {
    /*
     * The user has now selected the API result.
     *
     * Only at this point do we attempt to match it to the
     * canonical Course Book / Top 100 course.
     *
     * If there is no confident match, resolveSelection returns
     * the API course unchanged, which allows non-Top-100 courses
     * to be logged.
     */
    const resolved = catalog.resolveSelection(
      result.course,
    );

    const selectedCourse =
      resolved.id !== result.course.id
        ? resolved
        : result.course;

    setSelected({
      course: selectedCourse,
      display: selectedCourse,
    });

    setQuantity("1");
    setQuery(selectedCourse.name);
  };

  const needsState =
    selected &&
    isUSCourse(selected.display) &&
    !deriveState(selected.display);

  const log = async () => {
    if (!selected || busy) return;

    if (needsState) {
      notify(
        "Select a state before logging this U.S. course",
      );
      return;
    }

    setBusy(true);

    try {
      journal.remember(selected.course);

      const count = Math.max(
        1,
        Math.floor(Number(quantity)) || 1,
      );

      await rounds.log(selected.course, count);

      onClose();

      notify(
        String(count) +
          " round" +
          (count === 1 ? "" : "s") +
          " added",
      );
    } catch (error) {
      notify(errorMessage(error));
      setBusy(false);
    }
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
              disabled={!user}
              onChange={(event) => {
                changeQuery(event.target.value);
              }}
            />
          </div>

          <div id="results">
            {!user ? (
              <div className="empty">
                Sign in to log rounds.

                <button
                  className="primary"
                  onClick={onSignIn}
                >
                  Sign In
                </button>
              </div>
            ) : results.length ? (
              results.map((result) => {
                /*
                 * The search result remains the API course.
                 *
                 * Resolve only for purposes of displaying the
                 * Course Book ranking badge. This does NOT change
                 * what will be logged until the user actually
                 * selects the result.
                 */
                const course = result.display;
                const verified =
                  catalog.resolveSelection(course);

                const ranking =
                  catalog.rankings.find(
                    (row) =>
                      row.type === "state" &&
                      row.course.id === verified.id,
                  );

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

                      {ranking
                        ? " · " +
                          stateName(ranking.scope) +
                          " #" +
                          String(ranking.rank)
                        : ""}

                      {course.usa
                        ? " · USA #" +
                          String(course.usa)
                        : ""}

                      {course.world
                        ? " · World #" +
                          String(course.world)
                        : ""}

                      {course.public
                        ? " · Public #" +
                          String(course.public)
                        : ""}
                    </small>
                  </button>
                );
              })
            ) : (
              <div className="empty">
                No courses found. Add the course below.

                <button
                  className="secondary"
                  id="apiRetry"
                  onClick={() => {
                    setRetry((value) => value + 1);
                  }}
                >
                  Retry
                </button>
              </div>
            )}
          </div>

          <div
            className="actions"
            id="searchActions"
          >
            <button
              className="secondary"
              id="add"
              onClick={onAdd}
            >
              + Add Course
            </button>
          </div>
        </>
      )}

      {selected && (
        <div id="quantityBox">
          <div
            className="selectedcourse"
            id="selectedCourseCard"
          >
            <strong>{selected.display.name}</strong>

            <small>
              {selected.display.location ||
                "Location not specified"}

              {account.played[selected.course.id]
                ? " · Already played " +
                  String(
                    account.played[
                      selected.course.id
                    ],
                  ) +
                  "×"
                : ""}
            </small>

            {needsState && (
              <>
                <div className="selectedcourse-state">
                  <label htmlFor="logCourseState">
                    State{" "}
                    <span aria-hidden="true">
                      *
                    </span>
                  </label>

                  <StateSelect
                    id="logCourseState"
                    value={selected.display.state}
                    includeDC
                    onChange={(value) => {
                      const course = withUSState(
                        selected.course,
                        value,
                      );

                      journal.remember(course);

                      setSelected({
                        course,
                        display: course,
                      });
                    }}
                  />
                </div>

                <div className="required-note">
                  State is required for U.S. courses.
                </div>
              </>
            )}
          </div>

          <div className="quantity">
            <div>
              <div className="quantitylabel">
                Times played
              </div>

              <div className="quantityhint">
                How many rounds are you adding?
              </div>
            </div>

            <input
              id="timesPlayed"
              autoFocus
              aria-label="Times played"
              onFocus={(event) => {
                event.currentTarget.select();

                setTimeout(() => {
                  document
                    .getElementById("confirmLog")
                    ?.scrollIntoView({
                      block: "nearest",
                    });
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
                changeQuery(query);
              }}
            >
              Change Course
            </button>

            <button
              className="primary"
              id="confirmLog"
              disabled={busy}
              onClick={() => {
                void log();
              }}
            >
              {busy ? "Saving…" : "Log Round"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}