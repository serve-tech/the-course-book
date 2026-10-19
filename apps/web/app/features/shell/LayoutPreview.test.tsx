import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  createMemoryRouter,
  RouterProvider,
  useLoaderData,
} from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayoutPreview } from "./LayoutPreview";
import { readLayoutPreference } from "./layout-preference";
import {
  isLayoutPreviewEnabled,
  LAYOUT_PREFERENCE_KEY,
  LayoutMode,
} from "./layout-preview";

const routers: ReturnType<typeof createMemoryRouter>[] = [];
const loader = () => ({ layout: readLayoutPreference() });
function Page() {
  const { layout } = useLoaderData<typeof loader>();
  return (
    <>
      <output aria-label="Current layout">{layout}</output>
      <LayoutPreview layout={layout} />
    </>
  );
}
function openPreview() {
  const router = createMemoryRouter([
    { path: "/", loader, element: <Page />, HydrateFallback: () => null },
  ]);
  routers.push(router);
  render(<RouterProvider router={router} />);
}
beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  for (const router of routers.splice(0)) router.dispose();
  vi.restoreAllMocks();
});

describe.skipIf(!isLayoutPreviewEnabled())("layout preview control", () => {
  it("saves opt-in and switch-back choices and applies them through loader revalidation", async () => {
    openPreview();
    fireEvent.click(
      await screen.findByRole("button", { name: "Try the new layout" }),
    );
    const back = await screen.findByRole("button", {
      name: "Use classic layout",
    });
    expect(localStorage.getItem(LAYOUT_PREFERENCE_KEY)).toBe(
      LayoutMode.CourseFirst,
    );
    fireEvent.click(back);
    expect(
      await screen.findByRole("button", { name: "Try the new layout" }),
    ).toBeEnabled();
    expect(localStorage.getItem(LAYOUT_PREFERENCE_KEY)).toBe(
      LayoutMode.Classic,
    );
  });

  it("keeps the current layout and gives a useful error when the choice cannot be saved", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    openPreview();
    fireEvent.click(
      await screen.findByRole("button", { name: "Try the new layout" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Allow browser storage",
    );
    expect(
      screen.getByRole("button", { name: "Try the new layout" }),
    ).toBeEnabled();
    expect(localStorage.getItem(LAYOUT_PREFERENCE_KEY)).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});

it.skipIf(isLayoutPreviewEnabled())(
  "hides the control and ignores a saved opt-in when disabled",
  async () => {
    localStorage.setItem(LAYOUT_PREFERENCE_KEY, LayoutMode.CourseFirst);
    openPreview();
    expect(await screen.findByLabelText("Current layout")).toHaveTextContent(
      LayoutMode.Classic,
    );
    expect(
      screen.queryByRole("region", { name: "Layout preview" }),
    ).not.toBeInTheDocument();
  },
);
