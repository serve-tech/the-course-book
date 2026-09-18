import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
interface Drag {
  id: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  target: string | null;
  after: boolean;
  width: number;
}
export function useCourseDrag(
  enabled: boolean,
  onMove: (id: string, target: string, after: boolean) => void,
) {
  const [drag, setDrag] = useState<Drag | null>(null),
    current = useRef<Drag | null>(null),
    suppressClick = useRef(false);
  const moveCallback = useRef(onMove);
  useEffect(() => {
    moveCallback.current = onMove;
  }, [onMove]);
  useEffect(() => {
    let animation: number | undefined;
    const scroll = () => {
      const state = current.current;
      if (!state?.active) return;
      const height = window.visualViewport?.height ?? window.innerHeight;
      if (state.y < 80) window.scrollBy(0, -14);
      else if (state.y > height - 80) window.scrollBy(0, 14);
      animation = requestAnimationFrame(scroll);
    };
    const move = (event: PointerEvent) => {
      const state = current.current;
      if (!state) return;
      const active =
        state.active ||
        Math.hypot(event.clientX - state.startX, event.clientY - state.startY) >
          8;
      if (!active) return;
      event.preventDefault();
      suppressClick.current = true;
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>(".rankrow[data-id]");
      const bounds = target?.getBoundingClientRect();
      const next = {
        ...state,
        active,
        x: event.clientX,
        y: event.clientY,
        target: target?.dataset["id"] ?? state.target,
        after: bounds
          ? event.clientY > bounds.top + bounds.height / 2
          : state.after,
      };
      current.current = next;
      setDrag(next);
      if (animation === undefined) animation = requestAnimationFrame(scroll);
    };
    const finish = (event: PointerEvent) => {
      const state = current.current;
      current.current = null;
      if (animation !== undefined) cancelAnimationFrame(animation);
      animation = undefined;
      setDrag(null);
      if (
        event.type !== "pointercancel" &&
        state?.active &&
        state.target &&
        state.target !== state.id
      )
        moveCallback.current(state.id, state.target, state.after);
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      if (animation !== undefined) cancelAnimationFrame(animation);
      current.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, []);
  const start = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    if (!enabled || event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest("button,input,a"))
      return;
    if (event.pointerType === "touch" && !target.closest(".handle")) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    current.current = {
      id,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      active: false,
      target: null,
      after: false,
      width: bounds.width,
    };
  };
  return { drag, start, suppressClick };
}
