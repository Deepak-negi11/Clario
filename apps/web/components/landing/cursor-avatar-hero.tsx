"use client";

import { useEffect, useRef, useState } from "react";
import styles from "../../app/landing.module.css";

type Point = { x: number; y: number };
type Direction = "down" | "up" | "left" | "right";

const FRAME_START: Record<Direction, number> = {
  right: 0,
  up: 6,
  left: 12,
  down: 18,
};

export function CursorAvatarHero() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef<Point>({ x: 50, y: 54 });
  const currentRef = useRef<Point>({ x: 50, y: 54 });
  const lastRef = useRef<Point>({ x: 50, y: 54 });
  const frameRef = useRef(0);
  const [render, setRender] = useState({ x: 50, y: 54, frame: 18, moving: false });

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    let animationFrame = 0;
    let lastFrameAt = performance.now();

    const animate = (now: number) => {
      const current = currentRef.current;
      const target = targetRef.current;
      const dx = target.x - current.x;
      const dy = target.y - current.y;
      const moving = Math.abs(dx) + Math.abs(dy) > 0.35;

      current.x += dx * 0.085;
      current.y += dy * 0.085;

      let direction: Direction = "down";
      const moveX = current.x - lastRef.current.x;
      const moveY = current.y - lastRef.current.y;
      if (Math.abs(moveX) > Math.abs(moveY)) direction = moveX < 0 ? "left" : "right";
      else if (Math.abs(moveY) > 0.01) direction = moveY < 0 ? "up" : "down";

      if (moving && now - lastFrameAt > 95) {
        frameRef.current = (frameRef.current + 1) % 6;
        lastFrameAt = now;
      }

      setRender({
        x: current.x,
        y: current.y,
        frame: FRAME_START[direction] + (moving ? frameRef.current : 0),
        moving,
      });
      lastRef.current = { ...current };
      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  const moveTarget = (clientX: number, clientY: number) => {
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const x = ((clientX - bounds.left) / bounds.width) * 100;
    const y = ((clientY - bounds.top) / bounds.height) * 100;
    targetRef.current = {
      x: Math.max(10, Math.min(90, x)),
      y: Math.max(18, Math.min(86, y)),
    };
  };

  return (
    <div
      ref={stageRef}
      className={styles.avatarStage}
      onPointerMove={(event) => moveTarget(event.clientX, event.clientY)}
      onPointerDown={(event) => moveTarget(event.clientX, event.clientY)}
      aria-label="Interactive avatar that follows your pointer"
      role="img"
    >
      <div className={styles.stageGlow} style={{ left: `${render.x}%`, top: `${render.y}%` }} aria-hidden="true" />
      <div className={styles.stageLabel} aria-hidden="true">
        <span><i /> LIVE PRESENCE</span>
        <span>X {render.x.toFixed(0)} · Y {render.y.toFixed(0)}</span>
      </div>
      <div className={styles.stageGrid} aria-hidden="true" />
      <div className={styles.axisX} aria-hidden="true" />
      <div className={styles.axisY} aria-hidden="true" />
      <div
        className={styles.avatarUnit}
        style={{ left: `${render.x}%`, top: `${render.y}%` }}
        aria-hidden="true"
      >
        <span className={styles.avatarName}><i /> You</span>
        <span
          className={`${styles.avatarSprite} ${render.moving ? styles.avatarMoving : ""}`}
          style={{ backgroundPosition: `${-render.frame * 16}px 0` }}
        />
        <span className={styles.avatarShadow} />
      </div>
      <p className={styles.stageHint}>Move your cursor. Your presence follows.</p>
    </div>
  );
}
