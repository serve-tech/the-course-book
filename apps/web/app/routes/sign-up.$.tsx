import { SignUp } from "@clerk/react-router";
import type { Route } from "./+types/sign-up.$";

export const meta: Route.MetaFunction = () => [{ title: "Create account · coursebook.golf" }];

/** Full-page sign-up used by OAuth callbacks and direct links; the dialog is the usual entry. */
export default function SignUpPage() {
  return (
    <section className="page active" id="signup">
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
    </section>
  );
}
