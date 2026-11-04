import type { ListEntry } from "@coursebook/domain/journal/types";
import { useShell } from "../../shared/ui/shell";
import { MyRanking } from "./MyRanking";

/** The member's editable ranking on their profile, with the shell's services. */
export function OwnRanking({ rows, username, name }: { rows: readonly ListEntry[]; username: string; name: string }) {
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
    />
  );
}
