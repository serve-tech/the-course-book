import { Link } from "react-router";
import type { Route } from "./+types/privacy";

export const meta: Route.MetaFunction = () => [{ title: "Privacy · coursebook.golf" }];

/**
 * What the app stores and who sees it, as implemented. The maintainer owns
 * the wording and adds the legal and contact details the app stores require;
 * keep the facts here in step with the API.
 */
export default function Privacy() {
  return (
    <section id="privacy" className="page active">
      <div className="listhead">
        <div>
          <div className="eyebrow">Your data</div>
          <h2>Privacy</h2>
        </div>
      </div>
      <div className="prose">
        <h3>What coursebook.golf stores</h3>
        <p>
          Your username, display name, email address and profile image from your sign-in; the courses on your list
          and their order; and the rounds you log, with their dates. Courses you add by hand join the shared course
          catalog.
        </p>
        <h3>Who sees it</h3>
        <p>
          Other members can see your username, display name and your list with its order. No one else sees your email
          address. Nothing is sold or used for advertising.
        </p>
        <h3>Service providers</h3>
        <p>Sign-in is provided by Clerk. The app and its database run on Render in the United States.</p>
        <h3>Deleting your data</h3>
        <p>
          Delete your account on the <Link to="/account">Account</Link> page. That removes your list, rounds, name and
          email address and your sign-in. Courses you added by hand stay in the catalog without your name.
        </p>
      </div>
    </section>
  );
}
