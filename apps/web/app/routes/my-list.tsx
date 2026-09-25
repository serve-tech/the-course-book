import type { Route } from "./+types/my-list";
import { JournalPage } from "../features/journal/JournalPage";
import { getAppUser } from "../server/auth.server";
import { db } from "../server/db.server";
import { personalList } from "../server/backend.server";
import { useShell } from "../shared/ui/shell";

export const meta: Route.MetaFunction = () => [{ title: "My List · coursebook.golf" }];

export function headers(): HeadersInit {
  return { "Cache-Control": "private, no-store" };
}

export async function loader({ context }: Route.LoaderArgs) {
  const user = getAppUser(context);
  return {
    rows: user ? await personalList(db, user.id) : [],
    signedIn: user !== null,
  };
}

export default function MyList({ loaderData }: Route.ComponentProps) {
  const shell = useShell();
  return (
    <JournalPage
      rows={loaderData.rows}
      signedIn={loaderData.signedIn}
      selectedState={shell.selectedState}
      onState={shell.onState}
      notify={shell.notify}
      onSearchFocus={shell.searchFocus}
      openAuth={shell.openAuth}
    />
  );
}
