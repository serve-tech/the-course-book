import type { ListEntry } from "@coursebook/domain/journal/types";
import { useShell } from "../../shared/ui/shell";
import { MyRanking } from "./MyRanking";

/** The member's editable ranking on their profile, with the shell's services. */
export function OwnRanking({ rows, username }: { rows: readonly ListEntry[]; username: string }) {
  const shell = useShell();
  return (
    <MyRanking
      rows={rows}
      username={username}
      onLog={shell.openLog}
      selectedState={shell.selectedState}
      onState={shell.onState}
      notify={shell.notify}
      onSearchFocus={shell.searchFocus}
    />
  );
}
