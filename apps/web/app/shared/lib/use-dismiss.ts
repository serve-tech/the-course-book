import { useEffect, type RefObject } from "react";

/**
 * Close a popup menu when the user presses Escape or presses anywhere
 * outside it.
 *
 * Listens on the document only while `open` is true. Presses inside
 * `container`, which wraps both the trigger and the popup, leave it open, so
 * the trigger's own click can toggle it.
 *
 * @param open - Whether the popup is showing.
 * @param container - The element wrapping the trigger and the popup.
 * @param onDismiss - Called on Escape or a press outside `container`.
 */
export function useDismiss(open: boolean, container: RefObject<HTMLElement | null>, onDismiss: () => void): void {
  useEffect(() => {
    if (!open) return;
    const pointer = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !container.current?.contains(event.target)) onDismiss();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", pointer);
      document.removeEventListener("keydown", key);
    };
  }, [open, container, onDismiss]);
}
