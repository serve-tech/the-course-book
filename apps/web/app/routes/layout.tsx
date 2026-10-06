import { getToken, useAuth, useClerk } from "@clerk/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useRevalidator, type ShouldRevalidateFunctionArgs } from "react-router";
import type { Route } from "./+types/layout";
import { AuthDialog } from "../features/auth/AuthDialog";
import { isClerkFlowHash } from "../features/auth/clerk-flow";
import { api, ApiError, unwrap } from "../lib/api";
import { useServerWaking } from "../lib/api/server-status";
import { detectState } from "../shared/lib/geolocation";
import { errorMessage } from "../shared/lib/errors";
import { preferences, SELECTED_STATE_KEY } from "../shared/lib/storage";
import { usePreference } from "../shared/lib/use-preference";
import { TabBar, TopBar } from "../features/shell/AppNav";
import navStyles from "../features/shell/nav.module.css";
import { cx } from "../shared/lib/cx";
import type { Notify, Shell, ToastAction } from "../shared/ui/shell";
import { replyMessage, useJournalFetcher } from "../features/journal/use-journal-fetcher";

const MOBILE_BREAKPOINT = 760;
const TOAST_MS = 1900;
/** Long enough to read the message and reach the button. */
const FOLLOW_UP_TOAST_MS = 7000;
const NO_TOAST = { message: "", followUp: null };

/**
 * Pending friend requests to the member, for the Friends badge. A failure
 * only hides the badge, so it is logged rather than failing every page.
 */
async function incomingRequests(): Promise<number> {
  try {
    return unwrap(await api.GET("/v1/me/friend-requests")).incoming.length;
  } catch (error) {
    console.warn("Could not load friend requests for the badge", error);
    return 0;
  }
}

/**
 * The signed-in member from the API and their pending request count. An
 * account the app cannot use (its Clerk username breaks the product rule, or
 * it was deleted) shows as signed out with the reason, instead of failing
 * every page.
 */
export async function clientLoader() {
  if (!(await getToken())) return { user: null, problem: null, requests: 0 };
  try {
    const [user, requests] = await Promise.all([api.GET("/v1/me").then(unwrap), incomingRequests()]);
    return { user, problem: null, requests };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403))
      return { user: null, problem: error.message, requests: 0 };
    throw error;
  }
}

/** Journal changes never change who is signed in. */
export function shouldRevalidate({ formAction, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  return formAction === "/journal" ? false : defaultShouldRevalidate;
}


/**
 * Application shell: header, account bar, tab navigation, the routed page,
 * toast, footer and the account dialog. Browser-only concerns (viewport
 * height, stored preferences, geolocation) run in effects so the server and
 * client render the same markup.
 */
export default function Layout({ loaderData }: Route.ComponentProps) {
  const { user, problem, requests } = loaderData;
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
  // The sign-in dialog belongs to the page it was opened on. When Clerk
  // navigates elsewhere (home, once signed in), the dialog closes instead of
  // covering the new page; state is adjusted during render, not in an effect.
  // Google returns to the page the dialog was opened on with Clerk's step in
  // the hash; a new account comes back to `#/create/sso-callback` and still
  // has to choose a username, so the page opens with the dialog to finish.
  const { pathname, hash } = useLocation();
  const [authOpenOn, setAuthOpenOn] = useState<string | null>(() => (isClerkFlowHash(hash) ? pathname : null));
  if (authOpenOn !== null && authOpenOn !== pathname) setAuthOpenOn(null);
  const authOpen = authOpenOn === pathname;
  const openAuthDialog = () => {
    setAuthOpenOn(pathname);
  };
  const closeAuthDialog = () => {
    setAuthOpenOn(null);
    // A Clerk step left in the URL would reopen the dialog on reload.
    if (isClerkFlowHash(window.location.hash))
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  };
  const [storedState, setStoredState] = usePreference(SELECTED_STATE_KEY);
  const selectedState = storedState.toUpperCase();
  const [toast, setToast] = useState<{ message: string; followUp: ToastAction | null }>(NO_TOAST);
  const [refreshing, setRefreshing] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const notify = useCallback<Notify>((message, followUp) => {
    clearTimeout(toastTimer.current);
    setToast({ message, followUp: followUp ?? null });
    toastTimer.current = setTimeout(
      () => {
        setToast(NO_TOAST);
      },
      followUp ? FOLLOW_UP_TOAST_MS : TOAST_MS,
    );
  }, []);
  // The layout outlives the dialogs and pages that offer a follow-up, so it posts it.
  const followUp = useJournalFetcher((reply) => {
    notify(replyMessage(reply));
  });

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
    openAuth: openAuthDialog,
  };

  const signOut = () => {
    clerk.signOut({ redirectUrl: "/" }).catch((error: unknown) => {
      notify(errorMessage(error, "Unable to sign out."));
    });
  };

  const navigate = () => {
    searchFocus(false);
  };

  return (
    <div className={cx("app", navStyles.shell)}>
      <TopBar member={user} incomingRequests={requests} onSignIn={openAuthDialog} onSignOut={signOut} onNavigate={navigate} />
      {problem && (
        <p className="error-text" id="authProblem" role="alert">
          {problem}
        </p>
      )}

      <main className={navStyles.main}>
        <Outlet context={shell} />
      </main>

      <TabBar member={user} incomingRequests={requests} onSignIn={openAuthDialog} onNavigate={navigate} />

      {authOpen && !user && <AuthDialog onClose={closeAuthDialog} />}

      <div className={"toast" + (toast.message ? " show" : "") + (toast.followUp ? " has-action" : "")} id="toast" role="status">
        {toast.message}
        {toast.followUp && (
          <button
            type="button"
            className="toast-action"
            onClick={() => {
              if (!toast.followUp) return;
              followUp.submit(toast.followUp.fields);
              clearTimeout(toastTimer.current);
              setToast(NO_TOAST);
            }}
          >
            {toast.followUp.label}
          </button>
        )}
      </div>

      {waking && !toast.message && (
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
