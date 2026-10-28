import type { ReactNode } from "react";
import { RegionFilter } from "@coursebook/domain/catalog/course";
import { StateSelect } from "../../shared/ui/StateSelect";
import styles from "../top-lists/top-lists.module.css";
import { RANKING_TABS, rankingTabLabel } from "./ranking";

/**
 * The Ranking tab's region tabs and toolbar, laid out like the Courses
 * page: All, USA, International and Best in {State} as tabs, then any
 * filter buttons, the state picker (only on the state tab) and a search.
 *
 * @param region - The selected tab.
 * @param state - The chosen state's code ("" when none), shared with the Courses page.
 * @param query - The search text.
 * @param onRegion - Selects a tab.
 * @param onState - Chooses the state for the state tab.
 * @param onQuery - Changes the search text.
 * @param onSearchFocus - Tells the shell when the search gains or loses focus.
 * @param children - Filter buttons shown before the state picker, e.g. a friend's "Both played".
 */
export function RankingFilters({
  region,
  state,
  query,
  onRegion,
  onState,
  onQuery,
  onSearchFocus,
  children,
}: {
  region: RegionFilter;
  state: string;
  query: string;
  onRegion: (region: RegionFilter) => void;
  onState: (code: string) => void;
  onQuery: (query: string) => void;
  onSearchFocus: (focused: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <>
      <div className={styles.tabs} role="tablist" aria-label="Ranking regions">
        {RANKING_TABS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            className={styles.tab}
            aria-selected={value === region}
            onClick={() => {
              onRegion(value);
            }}
          >
            {rankingTabLabel(value, state)}
          </button>
        ))}
      </div>
      <div className={styles.toolbar}>
        {children}
        {region === RegionFilter.State && (
          <span className={styles.stateSelect}>
            <StateSelect id="rankingStateSelect" value={state} onChange={onState} label="State for Best in State" />
          </span>
        )}
        <div className={styles.search}>
          <input
            id="rankingSearch"
            type="search"
            aria-label="Search this ranking"
            placeholder="Search this ranking…"
            value={query}
            onFocus={() => {
              onSearchFocus(true);
            }}
            onBlur={() => {
              onSearchFocus(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") event.currentTarget.blur();
            }}
            onChange={(event) => {
              onQuery(event.target.value);
            }}
          />
        </div>
      </div>
    </>
  );
}
