import { SignIn, SignUp } from "@clerk/react-router";
import { useState } from "react";
import { Modal } from "../../shared/ui/Modal";
import { AuthMode } from "./auth-mode";

/**
 * Clerk's card is a fixed 25rem, capped at `100vw - 2.5rem`. Inside the
 * dialog it fills the content box instead: the fixed width overflows the
 * dialog's padding on wider screens (400px in 376px), and the cap leaves it
 * short of the right padding on phones.
 */
const FILL_DIALOG = {
  elements: {
    rootBox: { width: "100%" },
    cardBox: { width: "100%", maxWidth: "none" },
  },
};

/**
 * Account dialog. Keeps the legacy modal chrome and element ids while Clerk's
 * components handle credentials, Google sign-in and verification. Hash
 * routing lets the multi-step flows run inside the dialog without changing
 * the page URL path.
 */
export function AuthDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState(AuthMode.SignIn);
  const signup = mode === AuthMode.SignUp;

  return (
    <Modal
      id="authmodal"
      className="authmodal"
      title={signup ? "Create account" : "Sign in"}
      eyebrow="Your account"
      onClose={onClose}
    >
      <div className="sub" id="authSub">
        Sign in to keep your courses, rankings and rounds synced to your
        account.
      </div>

      <div id="authClerk" style={{ marginTop: "18px" }}>
        {signup ? (
          <SignUp routing="hash" signInUrl="/sign-in" appearance={FILL_DIALOG} />
        ) : (
          <SignIn routing="hash" signUpUrl="/sign-up" appearance={FILL_DIALOG} />
        )}
      </div>

      <div className="actions">
        <button
          type="button"
          className="secondary"
          id="authToggle"
          onClick={() => {
            setMode(signup ? AuthMode.SignIn : AuthMode.SignUp);
          }}
        >
          {signup ? "Back to sign in" : "Create account"}
        </button>
      </div>
    </Modal>
  );
}
