import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDismiss } from "./use-dismiss";

function Harness({ open, onDismiss }: { open: boolean; onDismiss: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  useDismiss(open, wrap, onDismiss);
  return (
    <>
      <div ref={wrap}>
        <button type="button">inside</button>
      </div>
      <button type="button">outside</button>
    </>
  );
}

describe("useDismiss", () => {
  afterEach(cleanup);

  it("dismisses on a press outside the container", () => {
    const onDismiss = vi.fn();
    render(<Harness open onDismiss={onDismiss} />);
    fireEvent.pointerDown(screen.getByText("outside"));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("ignores presses inside the container, so the trigger can toggle", () => {
    const onDismiss = vi.fn();
    render(<Harness open onDismiss={onDismiss} />);
    fireEvent.pointerDown(screen.getByText("inside"));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it.each([
    ["Escape", 1],
    ["Enter", 0],
    ["ArrowDown", 0],
  ])("key %s dismisses %i time(s)", (key, times) => {
    const onDismiss = vi.fn();
    render(<Harness open onDismiss={onDismiss} />);
    fireEvent.keyDown(document, { key });
    expect(onDismiss).toHaveBeenCalledTimes(times);
  });

  it("does not listen while closed", () => {
    const onDismiss = vi.fn();
    render(<Harness open={false} onDismiss={onDismiss} />);
    fireEvent.pointerDown(screen.getByText("outside"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
