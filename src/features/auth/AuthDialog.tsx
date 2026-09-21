import { useState } from "react";
import { useServices } from "../../app/context";
import { Modal } from "../../shared/ui/Modal";
import { errorMessage } from "../../shared/lib/errors";
import { AuthMode } from "./auth-form";

export function AuthDialog({ onClose }: { onClose: () => void }) {
  const { auth, storage } = useServices();

  const [mode, setMode] = useState(AuthMode.SignIn),
    [identity, setIdentity] = useState(
      storage.read("theCourseBookPendingAuthEmail") ?? "",
    );

  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);

  const signup = mode === AuthMode.SignUp;

  const toggle = () => {
    if (signup) {
      setIdentity(email.trim());
      setMode(AuthMode.SignIn);
    } else {
      if (identity.includes("@")) setEmail(identity.trim());
      setIdentity("");
      setMode(AuthMode.SignUp);
    }

    setError("");
  };

  const continueWithGoogle = async () => {
    if (busy) return;

    setBusy(true);
    setError("");

    try {
      await auth.signInWithGoogle();
    } catch (failure) {
      setError(errorMessage(failure, "Unable to continue with Google."));
      setBusy(false);
    }
  };

  const submit = async () => {
    if (busy) return;

    setBusy(true);
    setError("");

    try {
      const result = await auth.submit({
        mode,
        identity,
        email,
        password,
      });

      storage.write(
        "theCourseBookPendingAuthEmail",
        (signup ? email : identity).trim(),
      );

      if (result.confirmationRequired) {
        setError(
          "Account created. Check your email to confirm your account, then sign in.",
        );
      } else {
        onClose();
      }
    } catch (failure) {
      setError(errorMessage(failure, "Unable to create account."));
    } finally {
      setBusy(false);
    }
  };

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

      <button
        type="button"
        className="secondary"
        id="googleAuthButton"
        onClick={() => {
          void continueWithGoogle();
        }}
        disabled={busy}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
          marginTop: "18px",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            fontSize: "18px",
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          G
        </span>
        {busy ? "Connecting…" : "Continue with Google"}
      </button>

      <div
        aria-hidden="true"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          margin: "18px 0",
          color: "var(--muted, #777)",
          fontSize: "12px",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        <span
          style={{
            flex: 1,
            height: "1px",
            background: "currentColor",
            opacity: 0.25,
          }}
        />
        <span>or</span>
        <span
          style={{
            flex: 1,
            height: "1px",
            background: "currentColor",
            opacity: 0.25,
          }}
        />
      </div>

      <div className="group">
        <label id="authIdentityLabel" htmlFor="authIdentity">
          {signup ? "Username" : "Email"}
        </label>

        <input
          id="authIdentity"
          autoFocus
          type={signup ? "text" : "email"}
          autoComplete={signup ? "username" : "email"}
          autoCapitalize="none"
          spellCheck={false}
          placeholder={signup ? "Choose a username" : "you@example.com"}
          value={identity}
          onChange={(event) => {
            setIdentity(event.target.value);
          }}
        />
      </div>

      <div
        className="group"
        id="authEmailGroup"
        style={{ display: signup ? "block" : "none" }}
      >
        <label htmlFor="authEmail">Email</label>

        <input
          id="authEmail"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@example.com"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
          required={signup}
        />
      </div>

      <div className="group">
        <label htmlFor="authPassword">Password</label>

        <input
          id="authPassword"
          type="password"
          autoComplete={signup ? "new-password" : "current-password"}
          placeholder="••••••••"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
        />
      </div>

      <div className="autherror" id="authError" role="status">
        {error}
      </div>

      <div className="actions">
        <button
          className="secondary"
          id="authToggle"
          onClick={toggle}
          disabled={busy}
        >
          {signup ? "Back to sign in" : "Create account"}
        </button>

        <button
          className="primary"
          id="authSubmit"
          onClick={() => {
            void submit();
          }}
          disabled={busy}
        >
          {busy ? "Saving…" : signup ? "Save" : "Sign in"}
        </button>
      </div>
    </Modal>
  );
}