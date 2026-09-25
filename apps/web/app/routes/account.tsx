import { useAuth, useClerk } from "@clerk/react-router";
import { useState } from "react";
import type { Route } from "./+types/account";
import { api, expectOk } from "../lib/api";
import { errorMessage } from "../shared/lib/errors";
import { Modal } from "../shared/ui/Modal";
import { useShell } from "../shared/ui/shell";

export const meta: Route.MetaFunction = () => [{ title: "Account · coursebook.golf" }];

/**
 * Account page with self-service deletion (App Store 5.1.1(v), and the web
 * link Google Play requires). Deletion runs through the API, which removes
 * the data first and then the sign-in account, then the member is signed out.
 */
export default function Account() {
  const shell = useShell();
  const { isSignedIn } = useAuth();
  const clerk = useClerk();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      expectOk(await api.DELETE("/v1/me"));
    } catch (failure) {
      setError(errorMessage(failure, "The account could not be deleted. Please try again."));
      setBusy(false);
      return;
    }
    setConfirming(false);
    shell.notify("Your account was deleted.");
    // The Clerk user no longer exists; clear the local session either way.
    await clerk.signOut({ redirectUrl: "/" }).catch((signOutError: unknown) => {
      console.warn("Sign-out after account deletion failed", signOutError);
      window.location.assign("/");
    });
  };

  return (
    <section id="account" className="page active">
      <div className="listhead">
        <div>
          <div className="eyebrow">Your account</div>
          <h2>Account</h2>
          <p>Sign-in details are managed by the sign-in dialog. Here you can delete your account.</p>
        </div>
      </div>
      {isSignedIn ? (
        <div className="prose">
          <h3>Delete your account</h3>
          <p>
            Deleting your account removes your list, your rounds, your name and your email address, and deletes your
            sign-in. Courses you added by hand stay in the shared catalog without your name. This cannot be undone.
          </p>
          <div className="account-actions">
            <button
              className="secondary danger-course"
              id="deleteAccount"
              onClick={() => {
                setError("");
                setConfirming(true);
              }}
            >
              Delete my account
            </button>
          </div>
        </div>
      ) : (
        <div className="empty">
          <h3>Sign in to manage your account</h3>
          <button className="primary" onClick={shell.openAuth}>
            Sign in
          </button>
        </div>
      )}

      {confirming && (
        <Modal
          id="deleteAccountModal"
          eyebrow="Delete account"
          title="Delete your account?"
          onClose={() => {
            if (!busy) setConfirming(false);
          }}
        >
          <p>Your list and rounds will be deleted and you will be signed out. This cannot be undone.</p>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <div className="account-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
              }}
            >
              Keep my account
            </button>
            <button
              className="primary"
              id="confirmDeleteAccount"
              disabled={busy}
              onClick={() => {
                void remove();
              }}
            >
              {busy ? "Deleting…" : "Delete my account"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
