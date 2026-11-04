import { Link } from "react-router";
import type { Route } from "./+types/privacy";
import { PageHeader } from "../shared/ui/PageHeader";

export const meta: Route.MetaFunction = () => [{ title: "Privacy · The Course Book" }];

/**
 * What the app stores and who sees it, as implemented. The maintainer owns
 * the wording and adds the legal and contact details the app stores require;
 * keep the facts here in step with the API.
 */
export default function Privacy() {
  return (
    <section id="privacy" className="page active">
      <PageHeader eyebrow="Your data" title="Privacy" />
      <div className="prose">
        <h2>What The Course Book stores</h2>
        <p>
          Your username, display name, email address and profile image from your sign-in; the courses on your list
          and their order; the rounds you log, with their dates; and your friends and friend requests. Courses you add
          by hand join the shared course catalog.
        </p>
        <h2>Who sees it</h2>
        <p>
          Your ranking is public: anyone with its link can see your display name, username, the courses on your list
          and their order, without signing in. We ask search engines not to list it. Signed-in members can also find
          you by username. Only your friends (members whose friend request you accepted, or who accepted yours) see the
          rounds you log, their dates and your Want to play list. No one else sees your email address. Nothing is sold
          or used for advertising.
        </p>
        <h2>Service providers</h2>
        <p>Sign-in is provided by Clerk. The app and its database run on Render in the United States.</p>
        <h2>Deleting your data</h2>
        <p>
          Delete your account on the <Link to="/account">Account</Link> page. That removes your list, rounds, friends,
          friend requests, name and email address and your sign-in. Courses you added by hand stay in the catalog without your name.
        </p>
      </div>
    </section>
  );
}
