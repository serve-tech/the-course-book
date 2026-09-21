import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  useJournal,
  useServices,
} from "./context";
import { AuthDialog } from "../features/auth/AuthDialog";
import { RankingsPage } from "../features/catalog/RankingsPage";
import { JournalPage } from "../features/journal/JournalPage";
import { FriendsPage } from "../features/friends/FriendsPage";
import { LogRoundDialog } from "../features/rounds/LogRoundDialog";
import { AddCourseDialog } from "../features/rounds/AddCourseDialog";
import type { RankedCourse } from "../features/catalog/course";
import { detectState } from "../shared/lib/geolocation";
import { errorMessage } from "../shared/lib/errors";
import { Brand } from "./Brand";

enum Page {
  Mine = "mine",
  Top = "top",
  Friends = "friends",
}

enum Dialog {
  Auth = "auth",
  Log = "log",
  Add = "add",
}

export function App() {
  const services = useServices();
  const { user } = useJournal();

  const [page, setPage] =
    useState(Page.Mine);

  const [dialog, setDialog] =
    useState<Dialog | null>(
      null,
    );

  const [rankings, setRankings] =
    useState<
      readonly RankedCourse[]
    >([]);

  const [
    selectedState,
    setSelectedState,
  ] = useState(
    () =>
      services.storage
        .read(
          "theCourseBookSelectedState",
        )
        ?.toUpperCase() ?? "",
  );

  const [toast, setToast] =
    useState("");

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const toastTimer =
    useRef<
      ReturnType<
        typeof setTimeout
      > | undefined
    >(undefined);

  const pageRef =
    useRef(page);

  const notify =
    useCallback(
      (message: string) => {
        clearTimeout(
          toastTimer.current,
        );

        setToast(message);

        toastTimer.current =
          setTimeout(
            () => {
              setToast("");
            },
            1900,
          );
      },
      [],
    );

  const onState =
    useCallback(
      (code: string) => {
        services.storage.write(
          "theCourseBookSelectedState",
          code,
        );

        setSelectedState(
          code,
        );
      },
      [services],
    );

  useEffect(() => {
    pageRef.current =
      page;
  }, [page]);

  useEffect(() => {
    let active = true;

    let timer:
      | ReturnType<
          typeof setTimeout
        >
      | undefined;

    let authEvents = 0;

    const hydrate = () => {
      if (
        !active ||
        !services.journal
          .getSnapshot()
          .user
      )
        return;

      if (
        pageRef.current ===
        Page.Friends
      ) {
        timer =
          setTimeout(
            hydrate,
            2000,
          );

        return;
      }

      void services.journal
        .initialize()
        .catch(
          (
            error: unknown,
          ) => {
            if (active) {
              console.warn(
                "Account synchronization failed",
                error,
              );

              notify(
                "Cloud sync failed; try again",
              );
            }
          },
        );
    };

    const apply = (
      session: Awaited<
        ReturnType<
          typeof services.auth.session
        >
      >,
    ) => {
      if (!active) return;

      services.journal.activate(
        session?.user ?? null,
      );

      clearTimeout(timer);

      if (session)
        timer =
          setTimeout(
            hydrate,
            1500,
          );
    };

    const unsubscribe =
      services.auth.subscribe(
        (session) => {
          authEvents++;

          queueMicrotask(
            () => {
              apply(session);
            },
          );
        },
      );

    void services.auth
      .session()
      .then(
        (session) => {
          if (
            authEvents === 0
          )
            apply(session);
        },
        (
          error: unknown,
        ) => {
          if (active)
            notify(
              errorMessage(
                error,
              ),
            );
        },
      );

    void services.catalog
      .loadRankings()
      .then(
        (rows) => {
          if (active)
            setRankings(
              rows,
            );
        },
        (
          error: unknown,
        ) => {
          console.warn(
            "Rankings unavailable",
            error,
          );
        },
      );

    return () => {
      active = false;

      clearTimeout(timer);

      clearTimeout(
        toastTimer.current,
      );

      unsubscribe();
    };
  }, [
    services,
    notify,
  ]);

  useEffect(
    () =>
      detectState(
        services.storage,
        onState,
      ),
    [
      services,
      onState,
    ],
  );

  useEffect(() => {
    const resize = () => {
      document.documentElement.style.setProperty(
        "--vvh",
        String(
          window.visualViewport
            ?.height ??
            window.innerHeight,
        ) + "px",
      );
    };

    resize();

    window.visualViewport?.addEventListener(
      "resize",
      resize,
    );

    return () => {
      window.visualViewport?.removeEventListener(
        "resize",
        resize,
      );

      document.body.classList.remove(
        "mobile-searching",
      );
    };
  }, []);

  const searchFocus = (
    focused: boolean,
  ) => {
    document.body.classList.toggle(
      "mobile-searching",
      focused &&
        window.innerWidth <=
          760,
    );

    if (
      focused &&
      window.innerWidth <=
        760
    )
      window.scrollTo(0, 0);
  };

  const navigate = (
    next: Page,
  ) => {
    searchFocus(false);

    setPage(next);

    if (
      next === Page.Top
    )
      void services.catalog
        .loadRankings()
        .then(
          setRankings,
          (
            error: unknown,
          ) => {
            console.warn(
              error,
            );
          },
        );
  };

  const authLabel = user
    ? user.email ??
      "Signed in"
    : "Not signed in";

  return (
    <div className="app">
      <Brand />

      <div
        className="authbar"
        id="authbar"
      >
        <div>
          <span
            className="authdot"
            style={{
              background: user
                ? "#c7aa6b"
                : "#9a7b3f",
            }}
          />

          <span id="authLabel">
            {authLabel}
          </span>
        </div>

        <button
          className="authbtn"
          id="authOpen"
          onClick={() => {
            if (user) {
              void services.auth
                .signOut()
                .catch(
                  (
                    error: unknown,
                  ) => {
                    notify(
                      errorMessage(
                        error,
                      ),
                    );
                  },
                );
            } else {
              setDialog(
                Dialog.Auth,
              );
            }
          }}
        >
          {user
            ? "Sign out"
            : "Sign in"}
        </button>
      </div>

      <nav>
        {(
          [
            [
              Page.Mine,
              "My List",
            ],
            [
              Page.Top,
              "Top 100",
            ],
            [
              Page.Friends,
              "Friends",
            ],
          ] as const
        ).map(
          ([value, label]) => (
            <button
              key={value}
              className={
                "nav" +
                (
                  page ===
                  value
                    ? " active"
                    : ""
                )
              }
              data-page={value}
              onClick={() => {
                navigate(
                  value,
                );
              }}
            >
              {label}
            </button>
          ),
        )}
      </nav>

      <main>
        <RankingsPage
          active={
            page === Page.Top
          }
          rows={rankings}
          selectedState={
            selectedState
          }
          onState={onState}
          notify={notify}
          onSearchFocus={
            searchFocus
          }
        />

        <JournalPage
          key={
            user?.id ??
            "anonymous"
          }
          active={
            page === Page.Mine
          }
          selectedState={
            selectedState
          }
          onState={onState}
          onLog={() => {
            setDialog(
              Dialog.Log,
            );
          }}
          notify={notify}
          onSearchFocus={
            searchFocus
          }
        />

        <FriendsPage
          key={
            (
              user?.id ??
              "anonymous"
            ) +
            "-friends"
          }
          active={
            page === Page.Friends
          }
          notify={notify}
        />
      </main>

      {dialog ===
        Dialog.Auth && (
        <AuthDialog
          onClose={() => {
            setDialog(
              null,
            );
          }}
        />
      )}

      {dialog ===
        Dialog.Log && (
        <LogRoundDialog
          key={
            user?.id ??
            "anonymous"
          }
          onClose={() => {
            setDialog(
              null,
            );
          }}
          onAdd={() => {
            setDialog(
              Dialog.Add,
            );
          }}
          onSignIn={() => {
            setDialog(
              Dialog.Auth,
            );
          }}
          notify={notify}
        />
      )}

      {dialog ===
        Dialog.Add && (
        <AddCourseDialog
          key={
            user?.id ??
            "anonymous"
          }
          onClose={() => {
            setDialog(
              null,
            );
          }}
          notify={notify}
        />
      )}

      <div
        className={
          "toast" +
          (
            toast
              ? " show"
              : ""
          )
        }
        id="toast"
        role="status"
      >
        {toast}
      </div>

      <footer className="app-footer">
        <button
          className="app-refresh"
          id="refreshApp"
          disabled={
            refreshing
          }
          onClick={() => {
            setRefreshing(
              true,
            );

            requestAnimationFrame(
              () => {
                setTimeout(
                  () => {
                    window.location.reload();
                  },
                  220,
                );
              },
            );
          }}
        >
          {refreshing
            ? "Refreshing…"
            : "Refresh App"}
        </button>

        <span id="refreshedDate">
          Last updated{" "}
          {new Date(
            "2026-09-22T00:00:00-04:00",
          ).toLocaleString(
            [],
            {
              month:
                "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute:
                "2-digit",
            },
          )}{" "}
          · v180
        </span>
      </footer>

      <div
        className={
          "app-refresh-overlay" +
          (
            refreshing
              ? " open"
              : ""
          )
        }
        id="appRefreshOverlay"
        aria-hidden={
          !refreshing
        }
      >
        <div
          className="app-refresh-panel"
          role="status"
          aria-live="polite"
        >
          <div
            className="app-refresh-spinner"
            aria-hidden="true"
          />

          <div className="app-refresh-label">
            Refreshing Course Book…
          </div>
        </div>
      </div>
    </div>
  );
}