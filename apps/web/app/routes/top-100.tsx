import { getToken } from "@clerk/react-router";
import type { TopListCourse, TopListStanding } from "@coursebook/domain/social/types";
import { useNavigate } from "react-router";
import type { Route } from "./+types/top-100";
import {
  availableLists,
  busiestState,
  chooseList,
  listEntries,
  STATE_WITHOUT_SCOPE,
  tabList,
  topListSlug,
  type ListTab,
} from "../features/top-lists/lists";
import { TopListsPage } from "../features/top-lists/TopListsPage";
import { api, unwrap } from "../lib/api";
import { fromRankingEntry, fromTopListDetail, fromTopListProgress } from "../lib/api/mappers";
import { preferences, SELECTED_STATE_KEY, TOP_LIST_TAB_KEY } from "../shared/lib/storage";
import { usePreference } from "../shared/lib/use-preference";
import { RouteError } from "../shared/ui/RouteError";
import { useShell } from "../shared/ui/shell";

export const meta: Route.MetaFunction = () => [{ title: "Top lists · coursebook.golf" }];

/**
 * The Top list the page shows (`?list=`, else the tab remembered on this
 * device, else the World Top 100). Members get it from `getTopList`, with
 * their rounds, Want to play and the friends who played each course, and
 * their friends' progress; visitors get the public rankings. Best in State
 * uses the chosen state, else the state a member has played most of.
 */
export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const requested = new URL(request.url).searchParams.get("list");
  const stored = preferences();
  const remembered = stored.read(TOP_LIST_TAB_KEY) ?? "";
  const chosenState = (stored.read(SELECTED_STATE_KEY) ?? "").toUpperCase();

  if ((await getToken()) === null) {
    const rows = unwrap(await api.GET("/v1/rankings")).entries.map(fromRankingEntry);
    const choice = chooseList({ requested, remembered, state: chosenState, lists: availableLists(rows) });
    const entries: TopListCourse[] = choice.list
      ? listEntries(rows, choice.list).entries.map((row) => ({ course: row.course, rank: row.rank, played: 0, wantToPlay: false, friendsPlayed: [] }))
      : [];
    return { ...choice, state: choice.list?.type === "state" ? choice.list.scope : chosenState, entries, standing: null, signedIn: false };
  }

  const standings = unwrap(await api.GET("/v1/top-lists")).lists.map(fromTopListProgress);
  const state = chosenState || busiestState(standings);
  const choice = chooseList({ requested, remembered, state, lists: standings.map((standing) => standing.list) });
  const detail = choice.list
    ? fromTopListDetail(unwrap(await api.GET("/v1/top-lists/{type}/{scope}", { params: { path: { type: choice.list.type, scope: choice.list.scope } } })))
    : null;
  const standing: TopListStanding | null = detail?.standing ?? null;
  return { ...choice, state: choice.list?.type === "state" ? choice.list.scope : state, entries: detail?.entries ?? [], standing, signedIn: true };
}

export default function Courses({ loaderData }: Route.ComponentProps) {
  const shell = useShell();
  const navigate = useNavigate();
  const [, rememberTab] = usePreference(TOP_LIST_TAB_KEY);
  const choose = (tab: ListTab, state: string) => {
    rememberTab(tab);
    const list = tabList(tab, state);
    void navigate("?list=" + (list ? topListSlug(list) : STATE_WITHOUT_SCOPE), { preventScrollReset: true });
  };
  return (
    <TopListsPage
      tab={loaderData.tab}
      list={loaderData.list}
      state={loaderData.state}
      entries={loaderData.entries}
      standing={loaderData.standing}
      signedIn={loaderData.signedIn}
      onChoose={choose}
      onState={(code) => {
        shell.onState(code);
        choose(loaderData.tab, code);
      }}
      notify={shell.notify}
      onSearchFocus={shell.searchFocus}
      openAuth={shell.openAuth}
    />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteError error={error} />;
}
