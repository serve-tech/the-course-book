import { SignIn } from "@clerk/react-router";
import type { Route } from "./+types/sign-in.$";

export const meta: Route.MetaFunction = () => [{ title: "Sign in · coursebook.golf" }];

/** Full-page sign-in used by OAuth callbacks and direct links; the dialog is the usual entry. */
export default function SignInPage() {
  return (
    <section className="page active" id="signin">
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
    </section>
  );
}
