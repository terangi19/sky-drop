"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";

const DragGuardContext = createContext<React.MutableRefObject<boolean> | null>(null);

/** Wrap card onClick handlers so navigation does not fire after a drag. */
export function useDragGuardClick(handler: () => void) {
  const guard = useContext(DragGuardContext);
  return useCallback(() => {
    if (guard?.current) {
      guard.current = false;
      return;
    }
    handler();
  }, [guard, handler]);
}

type DragScrollCarouselProps = {
  children: ReactNode;
  className?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "className">;

const DRAG_THRESHOLD_PX = 5;
const MOMENTUM_DECAY = 0.92;
const MOMENTUM_MIN_VELOCITY = 0.35;

export default function DragScrollCarousel({
  children,
  className = "",
  ...rest
}: DragScrollCarouselProps) {
  const ref = useRef<HTMLDivElement>(null);
  const dragGuard = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragState = useRef({
    active: false,
    startX: 0,
    scrollLeft: 0,
    lastX: 0,
    lastTime: 0,
    velocity: 0,
  });
  const momentumFrame = useRef<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const stopMomentum = () => {
      if (momentumFrame.current != null) {
        cancelAnimationFrame(momentumFrame.current);
        momentumFrame.current = null;
      }
    };

    const startMomentum = () => {
      stopMomentum();
      let velocity = dragState.current.velocity * 16;

      const step = () => {
        if (!el || Math.abs(velocity) < MOMENTUM_MIN_VELOCITY) {
          momentumFrame.current = null;
          el.style.scrollSnapType = "";
          return;
        }
        el.scrollLeft -= velocity;
        velocity *= MOMENTUM_DECAY;
        momentumFrame.current = requestAnimationFrame(step);
      };

      if (Math.abs(velocity) >= MOMENTUM_MIN_VELOCITY) {
        el.style.scrollSnapType = "none";
        momentumFrame.current = requestAnimationFrame(step);
      } else {
        el.style.scrollSnapType = "";
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      stopMomentum();
      dragGuard.current = false;
      dragState.current = {
        active: true,
        startX: e.pageX,
        scrollLeft: el.scrollLeft,
        lastX: e.pageX,
        lastTime: performance.now(),
        velocity: 0,
      };
      setIsDragging(true);
      el.style.scrollSnapType = "none";
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!dragState.current.active) return;
      e.preventDefault();

      const dx = e.pageX - dragState.current.startX;
      if (Math.abs(dx) > DRAG_THRESHOLD_PX) {
        dragGuard.current = true;
      }

      const now = performance.now();
      const dt = now - dragState.current.lastTime;
      if (dt > 0) {
        dragState.current.velocity = (e.pageX - dragState.current.lastX) / dt;
      }
      dragState.current.lastX = e.pageX;
      dragState.current.lastTime = now;

      el.scrollLeft = dragState.current.scrollLeft - dx;
    };

    const endDrag = () => {
      if (!dragState.current.active) return;
      dragState.current.active = false;
      setIsDragging(false);
      startMomentum();
    };

    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", endDrag);

    return () => {
      stopMomentum();
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", endDrag);
    };
  }, []);

  const blockClickAfterDrag = useCallback((e: React.MouseEvent) => {
    if (!dragGuard.current) return;
    e.preventDefault();
    e.stopPropagation();
    dragGuard.current = false;
  }, []);

  return (
    <DragGuardContext.Provider value={dragGuard}>
      <div
        ref={ref}
        onClickCapture={blockClickAfterDrag}
        className={[
          "flex overflow-x-auto pb-1 scrollbar-none snap-x snap-mandatory",
          "[&>*]:snap-start",
          "[-webkit-overflow-scrolling:touch]",
          isDragging ? "cursor-grabbing select-none" : "cursor-grab",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      >
        {children}
      </div>
    </DragGuardContext.Provider>
  );
}
