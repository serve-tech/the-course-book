import { getToken } from "@clerk/react-router";
import { useRouteLoaderData } from "react-router";
import type { Route } from "./+types/home";
import type { clientLoader as layoutLoader } from "./layout";
import { HomeRanking } from "../features/home/HomeRanking";
import { Welcome } from "../features/home/Welcome";
import { api, unwrap } from "../lib/api";
import { fromMyCourse } from "../lib/api/mappers";
import { RouteError } from "../shared/ui/RouteError";
import { useShell } from "../shared/ui/shell";

export const meta: Route.MetaFunction = () => [{ title: "The Course Book" }];

/** Home is the member's ranking (decision 2026-11-03, ranking-first product). */
export async function clientLoader() {
  if (!(await getToken())) return { signedIn: false as const };
  const mine = unwrap(await api.GET("/v1/me/courses"));
  return { signedIn: true as const, rows: mine.courses.map(fromMyCourse) };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const shell = useShell();
  const layout = useRouteLoaderData<typeof layoutLoader>("routes/layout");
  const me = layout?.user;
  if (!loaderData.signedIn || !me) return <Welcome onSignIn={shell.openAuth} />;
  return <HomeRanking rows={loaderData.rows} member={me} onLog={shell.openLog} />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteError error={error} />;
}
