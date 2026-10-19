import { getToken } from "@clerk/react-router";
import { useRouteLoaderData } from "react-router";
import type { Route } from "./+types/home";
import type { clientLoader as layoutLoader } from "./layout";
import { RankingHome } from "../features/home/RankingHome";
import { Welcome } from "../features/home/Welcome";
import { api, unwrap } from "../lib/api";
import { fromMyCourse } from "../lib/api/mappers";
import { RouteError } from "../shared/ui/RouteError";
import { useShell } from "../shared/ui/shell";

export const meta: Route.MetaFunction = () => [
  { title: "My ranking · The Course Book" },
];

/** Load only the member's list. Friends activity cannot delay or fail Home. */
export async function clientLoader() {
  if (!(await getToken())) return { signedIn: false as const };
  const mine = unwrap(await api.GET("/v1/me/courses"));
  return { signedIn: true as const, rows: mine.courses.map(fromMyCourse) };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const shell = useShell();
  const layout = useRouteLoaderData<typeof layoutLoader>("routes/layout");
  const me = layout?.user?.username;
  if (!loaderData.signedIn || !me) return <Welcome onSignIn={shell.openAuth} />;
  return <RankingHome rows={loaderData.rows} username={me} />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteError error={error} />;
}
