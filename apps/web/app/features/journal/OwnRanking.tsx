import type { ListEntry } from "@coursebook/domain/journal/types";
import { useShell } from "../../shared/ui/shell";
import { MyRanking } from "./MyRanking";

/**
 * The member's editable ranking with the shell's services, on Home and their profile.
 *
 * @param rows - The member's ranking in rank order.
 * @param username - The member, for the link to their public ranking.
 * @param name - The member's name, which the saved image shows.
 * @param initialTop - The Top N the page opens on; null opens on every course.
 * @param searchFrom - Views with this many courses or fewer offer no search.
 */
export function OwnRanking({
  rows,
  username,
  name,
  initialTop = null,
  searchFrom = 0,
}: {
  rows: readonly ListEntry[];
  username: string;
  name: string;
  initialTop?: number | null;
  searchFrom?: number;
}) {
  const shell = useShell();
  return (
    <MyRanking
      rows={rows}
      username={username}
      name={name}
      onLog={shell.openLog}
      selectedState={shell.selectedState}
      onState={shell.onState}
      notify={shell.notify}
      onSearchFocus={shell.searchFocus}
      initialTop={initialTop}
      searchFrom={searchFrom}
    />
  );
}
