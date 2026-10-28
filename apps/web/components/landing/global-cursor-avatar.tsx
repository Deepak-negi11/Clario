"use client";

import { useEffect, useRef, useState } from "react";
import styles from "../../app/landing.module.css";

type Point = { x: number; y: number };
type Direction = "down" | "up" | "left" | "right";

const FRAME_START: Record<Direction, number> = { right: 0, up: 6, left: 12, down: 18 };

export function GlobalCursorAvatar() {
  const target = useRef<Point>({ x: 0, y: 0 });
  const current = useRef<Point>({ x: 0, y: 0 });
  const previous = useRef<Point>({ x: 0, y: 0 });
  const frame = useRef(0);
  const [ready, setReady] = useState(false);
  const [state, setState] = useState({ x: 0, y: 0, frame: 18, moving: false, hero: true });

  useEffect(() => {
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!finePointer || reducedMotion) return;

    const initial = { x: window.innerWidth * 0.73, y: window.innerHeight * 0.63 };
    target.current = initial;
    current.current = initial;
    previous.current = initial;
    setReady(true);

    const onPointerMove = (event: PointerEvent) => {
      target.current = {
        x: Math.max(42, Math.min(window.innerWidth - 42, event.clientX)),
        y: Math.max(82, Math.min(window.innerHeight - 50, event.clientY)),
      };
    };

    let requestId = 0;
    let lastFrameAt = performance.now();
    let lastPointerAt = performance.now();

    const notePointer = (event: PointerEvent) => {
      lastPointerAt = performance.now();
      onPointerMove(event);
    };

    const animate = (now: number) => {
      const point = current.current;
      const destination = target.current;
      const dx = destination.x - point.x;
      const dy = destination.y - point.y;
      const moving = Math.abs(dx) + Math.abs(dy) > 1.2 && now - lastPointerAt < 1800;



      point.x += dx * 0.012;
      point.y += dy * 0.012;

      const velocityX = point.x - previous.current.x;
      const velocityY = point.y - previous.current.y;
      let direction: Direction = "down";
      if (Math.abs(velocityX) > Math.abs(velocityY)) direction = velocityX < 0 ? "left" : "right";
      else if (Math.abs(velocityY) > 0.02) direction = velocityY < 0 ? "up" : "down";

      if (moving && now - lastFrameAt > 90) {
        frame.current = (frame.current + 1) % 6;
        lastFrameAt = now;
      }

      setState({
        x: point.x,
        y: point.y,
        frame: FRAME_START[direction] + (moving ? frame.current : 0),
        moving,
        hero: window.scrollY < window.innerHeight * 0.72,
      });
      previous.current = { ...point };
      requestId = requestAnimationFrame(animate);
    };

    window.addEventListener("pointermove", notePointer, { passive: true });
    requestId = requestAnimationFrame(animate);
    return () => {
      window.removeEventListener("pointermove", notePointer);
      cancelAnimationFrame(requestId);
    };
  }, []);

  if (!ready) return null;

  return (
    <div
      className={`${styles.globalAvatar} ${state.hero ? styles.avatarOnHero : styles.avatarOnPage}`}
      style={{ transform: `translate3d(${state.x}px, ${state.y}px, 0)` }}
      aria-hidden="true"
    >
      <span className={styles.globalAvatarName}><i /> You</span>
      <span
        className={`${styles.globalAvatarSprite} ${state.moving ? styles.globalAvatarMoving : ""}`}
        style={{ backgroundPosition: `${-state.frame * 16}px 0` }}
      />
      <span className={styles.globalAvatarShadow} />
    </div>
  );
}
