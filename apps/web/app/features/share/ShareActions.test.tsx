import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RankingImageContent } from "./ranking-image";
import { ShareActions } from "./ShareActions";

const image = (name: string) => ({ memberName: "Josh", title: "Ranking", rows: [{ rank: 1, name, place: "Somewhere" }] });

afterEach(() => {
  cleanup();
});

describe("ShareActions", () => {
  it("does not offer the old image after a reorder keeps the same link", async () => {
    const renderImage = vi.fn<(content: RankingImageContent) => Promise<Blob>>();
    renderImage.mockResolvedValueOnce(new Blob(["first"], { type: "image/png" }));
    renderImage.mockReturnValueOnce(new Promise<Blob>(() => undefined));
    const actions = (content: ReturnType<typeof image>) => (
      <ShareActions path="/r/josh" image={content} fileName="josh-ranking.png" notify={() => undefined} render={renderImage} />
    );

    const { rerender } = render(actions(image("Pine Valley")));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save image" })).toBeEnabled();
    });

    rerender(actions(image("Crystal Downs")));
    expect(screen.getByRole("button", { name: "Save image" })).toBeDisabled();
  });
});
