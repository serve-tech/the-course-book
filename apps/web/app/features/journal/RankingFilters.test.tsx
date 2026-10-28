import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { RegionFilter } from "@coursebook/domain/catalog/course";
import { RankingFilters } from "./RankingFilters";

/** The filters with real state, as a Ranking page holds it. */
function Harness({ initialState }: { initialState: string }) {
  const [region, setRegion] = useState(RegionFilter.All);
  const [state, setState] = useState(initialState);
  const [query, setQuery] = useState("");
  return (
    <RankingFilters
      region={region}
      state={state}
      query={query}
      onRegion={setRegion}
      onState={setState}
      onQuery={setQuery}
      onSearchFocus={() => undefined}
    />
  );
}

const statePicker = () => screen.queryByRole("combobox", { name: "State for Best in State" });

describe("RankingFilters", () => {
  afterEach(cleanup);

  it("shows the region tabs like the Courses page, with All selected", () => {
    render(<Harness initialState="MI" />);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["All", "USA", "International", "Best in Michigan"]);
    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "true");
  });

  it("shows the state picker only on the state tab", () => {
    render(<Harness initialState="MI" />);
    expect(statePicker()).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "USA" }));
    expect(statePicker()).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Best in Michigan" }));
    expect(statePicker()).toHaveValue("MI");
    fireEvent.click(screen.getByRole("tab", { name: "All" }));
    expect(statePicker()).toBeNull();
  });

  it("renames the state tab when another state is picked", () => {
    render(<Harness initialState="" />);
    fireEvent.click(screen.getByRole("tab", { name: "Best in State" }));
    const picker = statePicker();
    if (!picker) throw new Error("The state tab shows a state picker");
    fireEvent.change(picker, { target: { value: "TX" } });
    expect(screen.getByRole("tab", { name: "Best in Texas" })).toHaveAttribute("aria-selected", "true");
  });

  it("keeps the search on every tab", () => {
    render(<Harness initialState="MI" />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search this ranking" }), { target: { value: "Pine" } });
    fireEvent.click(screen.getByRole("tab", { name: "International" }));
    expect(screen.getByRole("searchbox", { name: "Search this ranking" })).toHaveValue("Pine");
  });
});
