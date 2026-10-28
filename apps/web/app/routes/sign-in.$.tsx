import { SignIn } from "@clerk/react-router";
import styles from "../features/auth/auth.module.css";
import type { Route } from "./+types/sign-in.$";

export const meta: Route.MetaFunction = () => [{ title: "Sign in · The Course Book" }];

/** Full-page sign-in used by OAuth callbacks and direct links; the dialog is the usual entry. */
export default function SignInPage() {
  return (
    <section className="page active" id="signin">
      <div className={styles.page}>
        <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" withSignUp />
      </div>
    </section>
  );
}
