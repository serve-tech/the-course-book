import { SignIn } from "@clerk/react-router";
import { Modal } from "../../shared/ui/Modal";

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
 * Sign-in dialog. Keeps the legacy modal chrome and element ids while Clerk's
 * component handles credentials, social sign-in and verification. Hash
 * routing runs the multi-step flow inside the dialog without changing the
 * page path.
 *
 * `withSignUp` makes it Clerk's sign-in-or-up flow: an email or Google
 * account with no member behind it creates one, and Clerk asks for the
 * missing username in the same dialog. Google returns to this page with the
 * step in the hash, and the layout reopens the dialog to finish it
 * (`isClerkFlowHash`).
 */
export function AuthDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal id="authmodal" className="authmodal" title="Sign in" eyebrow="Your account" onClose={onClose}>
      <div className="sub" id="authSub">
        Sign in or create an account to keep your courses, rankings and rounds
        synced.
      </div>

      <div id="authClerk" style={{ marginTop: "18px" }}>
        <SignIn routing="hash" signUpUrl="/sign-up" withSignUp appearance={FILL_DIALOG} />
      </div>
    </Modal>
  );
}
