import { getToken } from "@clerk/react-router";
import type { Route } from "./+types/my-list";
import { JournalPage } from "../features/journal/JournalPage";
import { api, unwrap } from "../lib/api";
import { fromMyCourse } from "../lib/api/mappers";
import { RouteError } from "../shared/ui/RouteError";
import { useShell } from "../shared/ui/shell";

export const meta: Route.MetaFunction = () => [{ title: "My List · coursebook.golf" }];

/** The member's list from the API; signed-out visitors see an empty list without a call. */
export async function clientLoader() {
  if (!(await getToken())) return { rows: [], signedIn: false };
  const { courses } = unwrap(await api.GET("/v1/me/courses"));
  return { rows: courses.map(fromMyCourse), signedIn: true };
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

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteError error={error} />;
}
