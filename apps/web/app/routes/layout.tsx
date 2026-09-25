import { getToken, useAuth, useClerk } from "@clerk/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useRevalidator, type ShouldRevalidateFunctionArgs } from "react-router";
import type { Route } from "./+types/layout";
import { AuthDialog } from "../features/auth/AuthDialog";
import { api, ApiError, unwrap } from "../lib/api";
import { useServerWaking } from "../lib/api/server-status";
import { detectState } from "../shared/lib/geolocation";
import { errorMessage } from "../shared/lib/errors";
import { preferences } from "../shared/lib/storage";
import { usePreference } from "../shared/lib/use-preference";
import { Brand } from "../shared/ui/Brand";
import type { Shell } from "../shared/ui/shell";

const SELECTED_STATE_KEY = "theCourseBookSelectedState";
const MOBILE_BREAKPOINT = 760;

/**
 * The signed-in member from the API. An account the app cannot use (its
 * Clerk username breaks the product rule, or it was deleted) shows as signed
 * out with the reason, instead of failing every page.
 */
export async function clientLoader() {
  if (!(await getToken())) return { user: null, problem: null };
  try {
    return { user: unwrap(await api.GET("/v1/me")), problem: null };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403))
      return { user: null, problem: error.message };
    throw error;
  }
}
clientLoader.hydrate = true as const;

/** Journal changes never change who is signed in. */
export function shouldRevalidate({ formAction, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  return formAction === "/journal" ? false : defaultShouldRevalidate;
}

export function HydrateFallback() {
  return (
    <div className="app">
      <Brand />
      <p className="empty">Loading coursebook.golf…</p>
    </div>
  );
}

/**
 * Application shell: header, account bar, tab navigation, the routed page,
 * toast, footer and the account dialog. Browser-only concerns (viewport
 * height, stored preferences, geolocation) run in effects so the server and
 * client render the same markup.
 */
export default function Layout({ loaderData }: Route.ComponentProps) {
  const { user, problem } = loaderData;
  const clerk = useClerk();
  const { userId } = useAuth();
  const revalidator = useRevalidator();
  const waking = useServerWaking();
  const lastUser = useRef<string | null | undefined>(undefined);

  // Signing in or out in the Clerk dialog changes the session without a
  // navigation; reload every route's data when the Clerk user changes.
  useEffect(() => {
    if (userId === undefined) return;
    if (lastUser.current !== undefined && lastUser.current !== userId) void revalidator.revalidate();
    lastUser.current = userId;
  }, [userId, revalidator]);
  const [authOpen, setAuthOpen] = useState(false);
  const [storedState, setStoredState] = usePreference(SELECTED_STATE_KEY);
  const selectedState = storedState.toUpperCase();
  const [toast, setToast] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const notify = useCallback((message: string) => {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => {
      setToast("");
    }, 1900);
  }, []);

  const onState = useCallback(
    (code: string) => {
      setStoredState(code.toUpperCase());
    },
    [setStoredState],
  );

  useEffect(() => detectState(preferences(), onState), [onState]);

  useEffect(() => {
    const resize = () => {
      document.documentElement.style.setProperty(
        "--vvh",
        String(window.visualViewport?.height ?? window.innerHeight) + "px",
      );
    };
    resize();
    window.visualViewport?.addEventListener("resize", resize);
    return () => {
      window.visualViewport?.removeEventListener("resize", resize);
      document.body.classList.remove("mobile-searching");
      clearTimeout(toastTimer.current);
    };
  }, []);

  const searchFocus = useCallback((focused: boolean) => {
    const mobile = focused && window.innerWidth <= MOBILE_BREAKPOINT;
    document.body.classList.toggle("mobile-searching", mobile);
    if (mobile) window.scrollTo(0, 0);
  }, []);

  const shell: Shell = {
    notify,
    selectedState,
    onState,
    searchFocus,
    openAuth: () => {
      setAuthOpen(true);
    },
  };

  const signOut = () => {
    clerk.signOut({ redirectUrl: "/" }).catch((error: unknown) => {
      notify(errorMessage(error, "Unable to sign out."));
    });
  };

  return (
    <div className="app">
      <Brand />

      <div className="authbar" id="authbar">
        <div>
          <span
            className="authdot"
            style={{ background: user ? "#c7aa6b" : "#9a7b3f" }}
          />
          <span id="authLabel">{user ? user.username : "Not signed in"}</span>
        </div>
        <button
          className="authbtn"
          id="authOpen"
          onClick={() => {
            if (user) signOut();
            else setAuthOpen(true);
          }}
        >
          {user ? "Sign out" : "Sign in"}
        </button>
      </div>
      {problem && (
        <p className="error-text" id="authProblem" role="alert">
          {problem}
        </p>
      )}

      <nav>
        {(
          [
            ["/", "mine", "My List"],
            ["/top-100", "top", "Top 100"],
            ["/friends", "friends", "Friends"],
          ] as const
        ).map(([to, page, label]) => (
          <NavLink
            key={page}
            to={to}
            end={to === "/"}
            className={({ isActive }) => "nav" + (isActive ? " active" : "")}
            data-page={page}
            onClick={() => {
              searchFocus(false);
            }}
          >
            {label}
          </NavLink>
        ))}
      </nav>

      <main>
        <Outlet context={shell} />
      </main>

      {authOpen && !user && (
        <AuthDialog
          onClose={() => {
            setAuthOpen(false);
          }}
        />
      )}

      <div className={"toast" + (toast ? " show" : "")} id="toast" role="status">
        {toast}
      </div>

      {waking && !toast && (
        <div className="toast show" id="wakingNotice" role="status">
          Waking the server… this can take up to a minute.
        </div>
      )}

      <footer className="app-footer">
        <button
          className="app-refresh"
          id="refreshApp"
          disabled={refreshing}
          onClick={() => {
            setRefreshing(true);
            requestAnimationFrame(() => {
              setTimeout(() => {
                window.location.reload();
              }, 220);
            });
          }}
        >
          {refreshing ? "Refreshing…" : "Refresh App"}
        </button>
        <span id="refreshedDate">coursebook.golf</span>
        <span className="app-footer-links">
          <Link to="/account">Account</Link> · <Link to="/privacy">Privacy</Link>
        </span>
      </footer>

      <div
        className={"app-refresh-overlay" + (refreshing ? " open" : "")}
        id="appRefreshOverlay"
        aria-hidden={!refreshing}
      >
        <div className="app-refresh-panel" role="status" aria-live="polite">
          <div className="app-refresh-spinner" aria-hidden="true" />
          <div className="app-refresh-label">Refreshing Course Book…</div>
        </div>
      </div>
    </div>
  );
}
