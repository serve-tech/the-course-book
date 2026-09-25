import { SignIn, SignUp } from "@clerk/react-router";
import { useState } from "react";
import { Modal } from "../../shared/ui/Modal";
import { AuthMode } from "./auth-mode";

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
          <SignUp routing="hash" signInUrl="/sign-in" />
        ) : (
          <SignIn routing="hash" signUpUrl="/sign-up" />
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
