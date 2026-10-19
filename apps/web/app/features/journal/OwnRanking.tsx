import { useEffect } from "react";
import { useSearchParams } from "react-router";
import type { ListEntry } from "@coursebook/domain/journal/types";
import { useShell } from "../../shared/ui/shell";
import { MyRanking } from "./MyRanking";

/** The same editable ranking on Home and the member's profile, including Log deep links. */
export function OwnRanking({ rows }: { rows: readonly ListEntry[] }) {
  const shell = useShell();
  const [params, setParams] = useSearchParams();
  const openLog = params.get("log") === "1";

  // Consume the request so a reload or Back does not reopen the dialog.
  useEffect(() => {
    if (openLog)
      setParams(
        (current) => {
          current.delete("log");
          return current;
        },
        { replace: true },
      );
  }, [openLog, setParams]);

  return (
    <MyRanking
      rows={rows}
      openLog={openLog}
      selectedState={shell.selectedState}
      onState={shell.onState}
      notify={shell.notify}
      onSearchFocus={shell.searchFocus}
      openAuth={shell.openAuth}
    />
  );
}
