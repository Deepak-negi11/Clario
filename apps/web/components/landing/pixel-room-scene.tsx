"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import styles from "../../app/landing.module.css";

// Logical canvas size in pixels; drawn at an integer scale so every pixel stays square.
const W = 120;
const H = 76;
const SPRITE_W = 16;
const SPRITE_H = 32;
const FEET_Y = 62;
const FRAME = { right: 0, up: 6, left: 12, down: 18 } as const;

const ACCENT = "#3a6ee8";
const INK = "#1b2130";

const LEFT_HOME = 8;
const RIGHT_HOME = 96;
const LEFT_MEET = 33;
const RIGHT_MEET = 71;
const WALK_MS = 1600;
const TALK_MS = 3800;
const IDLE_MS = 900;
const CYCLE_MS = WALK_MS * 2 + TALK_MS + IDLE_MS;
const RING_RADIUS = 27;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => BAYER[(y % 4) * 4 + (x % 4)]! / 16;

export type ScenePhase = "walk" | "talk" | "leave";

const PHASES: { id: ScenePhase; label: string }[] = [
  { id: "walk", label: "Walk over" },
  { id: "talk", label: "Voice connects" },
  { id: "leave", label: "Step away" },
];

type Frame = {
  phase: ScenePhase;
  leftX: number;
  rightX: number;
  leftFrame: number;
  rightFrame: number;
  ring: number;
  talkMs: number;
};

function frameAt(time: number): Frame {
  const t = time % CYCLE_MS;
  const step = Math.floor(time / 110) % 6;

  if (t < WALK_MS) {
    const p = t / WALK_MS;
    return {
      phase: "walk",
      leftX: LEFT_HOME + (LEFT_MEET - LEFT_HOME) * p,
      rightX: RIGHT_HOME - (RIGHT_HOME - RIGHT_MEET) * p,
      leftFrame: FRAME.right + step,
      rightFrame: FRAME.left + step,
      ring: 0,
      talkMs: 0,
    };
  }

  if (t < WALK_MS + TALK_MS) {
    const talkMs = t - WALK_MS;
    const grow = Math.min(1, talkMs / 520);
    return {
      phase: "talk",
      leftX: LEFT_MEET,
      rightX: RIGHT_MEET,
      leftFrame: FRAME.right,
      rightFrame: FRAME.left,
      ring: RING_RADIUS * (1 - (1 - grow) ** 3),
      talkMs,
    };
  }

  if (t < WALK_MS * 2 + TALK_MS) {
    const p = (t - WALK_MS - TALK_MS) / WALK_MS;
    return {
      phase: "leave",
      leftX: LEFT_MEET - (LEFT_MEET - LEFT_HOME) * p,
      rightX: RIGHT_MEET + (RIGHT_HOME - RIGHT_MEET) * p,
      leftFrame: FRAME.left + step,
      rightFrame: FRAME.right + step,
      ring: RING_RADIUS * Math.max(0, 1 - p * 1.6),
      talkMs: 0,
    };
  }

  return {
    phase: "leave",
    leftX: LEFT_HOME,
    rightX: RIGHT_HOME,
    leftFrame: FRAME.down,
    rightFrame: FRAME.down,
    ring: 0,
    talkMs: 0,
  };
}

function drawRoom(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#f6f7fa";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#eceff5";
  for (let x = 0; x < W; x += 8) ctx.fillRect(x, 0, 1, H);
  for (let y = 0; y < H; y += 8) ctx.fillRect(0, y, W, 1);

  ctx.fillStyle = "#e1e5ee";
  ctx.fillRect(0, 0, W, 3);

  // Desk with a monitor (top left)
  ctx.fillStyle = "#d8dde8";
  ctx.fillRect(6, 14, 28, 7);
  ctx.fillStyle = "#c3cad8";
  ctx.fillRect(6, 21, 28, 3);
  ctx.fillStyle = "#2d3445";
  ctx.fillRect(14, 6, 12, 8);
  ctx.fillStyle = "#6f97f3";
  ctx.fillRect(15, 7, 10, 5);
  ctx.fillStyle = "#2d3445";
  ctx.fillRect(19, 14, 2, 1);

  // Plant (top right)
  ctx.fillStyle = "#4f9d73";
  for (const [x, y, w] of [[101, 6, 4], [99, 7, 8], [98, 8, 10], [99, 9, 8], [100, 10, 6]] as const) {
    ctx.fillRect(x, y, w, 1);
  }
  ctx.fillStyle = "#3d7f5c";
  ctx.fillRect(102, 9, 2, 3);
  ctx.fillStyle = "#c98b5b";
  ctx.fillRect(99, 12, 8, 6);
  ctx.fillStyle = "#b07547";
  ctx.fillRect(99, 17, 8, 1);
}

function drawRing(ctx: CanvasRenderingContext2D, radius: number, alpha: number) {
  if (radius < 1) return;
  const cx = W / 2;
  const cy = FEET_Y - 8;
  const r = Math.ceil(radius);

  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const d = Math.hypot(x - cx, (y - cy) * 1.35);
      if (d > radius) continue;
      const edge = Math.abs(d - radius) < 0.75;
      const density = (1 - d / radius) * 0.5 + 0.06;
      if (edge) {
        ctx.globalAlpha = 0.85 * alpha;
      } else if (density * alpha > bayer(x, y)) {
        ctx.globalAlpha = 0.32 * alpha;
      } else {
        continue;
      }
      ctx.fillStyle = ACCENT;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.globalAlpha = 1;
}

function drawSprite(ctx: CanvasRenderingContext2D, image: HTMLImageElement | null, frame: number, x: number) {
  const left = Math.round(x);
  ctx.fillStyle = "rgba(27,33,48,0.16)";
  ctx.fillRect(left + 3, FEET_Y - 1, 10, 2);
  if (!image || !image.complete || image.naturalWidth === 0) return;
  ctx.drawImage(image, frame * SPRITE_W, 0, SPRITE_W, SPRITE_H, left, FEET_Y - SPRITE_H, SPRITE_W, SPRITE_H);
}

function drawBubble(ctx: CanvasRenderingContext2D, x: number, y: number, pointRight: boolean) {
  ctx.fillStyle = INK;
  ctx.fillRect(x, y, 13, 8);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x + 1, y + 1, 11, 6);
  ctx.fillStyle = INK;
  ctx.fillRect(x + 3, y + 4, 1, 1);
  ctx.fillRect(x + 6, y + 4, 1, 1);
  ctx.fillRect(x + 9, y + 4, 1, 1);
  const tail = pointRight ? x + 9 : x + 3;
  ctx.fillRect(tail, y + 8, 1, 1);
  ctx.fillRect(pointRight ? tail + 1 : tail - 1, y + 9, 1, 1);
}

function drawVoiceBars(ctx: CanvasRenderingContext2D, talkMs: number) {
  ctx.fillStyle = ACCENT;
  for (let i = 0; i < 5; i++) {
    const height = 2 + Math.round((Math.sin(talkMs / 140 + i * 1.3) + 1) * 2.5);
    ctx.fillRect(W / 2 - 5 + i * 2, FEET_Y - 22 - height, 1, height);
  }
}

function drawFrame(ctx: CanvasRenderingContext2D, frame: Frame, sprites: (HTMLImageElement | null)[]) {
  drawRoom(ctx);
  drawRing(ctx, frame.ring, frame.ring / RING_RADIUS);
  drawSprite(ctx, sprites[0] ?? null, frame.leftFrame, frame.leftX);
  drawSprite(ctx, sprites[1] ?? null, frame.rightFrame, frame.rightX);

  if (frame.phase === "talk" && frame.talkMs > 520) {
    drawVoiceBars(ctx, frame.talkMs);
    const leftTurn = Math.floor((frame.talkMs - 520) / 1100) % 2 === 0;
    if (leftTurn) drawBubble(ctx, LEFT_MEET + 4, FEET_Y - SPRITE_H - 9, false);
    else drawBubble(ctx, RIGHT_MEET - 1, FEET_Y - SPRITE_H - 9, true);
  }
}

export function PixelRoomScene({ embedded = false }: { embedded?: boolean }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<ScenePhase>("walk");
  const [canAnimate, setCanAnimate] = useState(false);
  const [paused, setPaused] = useState(false);
  const controlsRef = useRef<{ pause: () => void; resume: () => void } | null>(null);

  const togglePaused = () => {
    if (paused) controlsRef.current?.resume();
    else controlsRef.current?.pause();
    setPaused(!paused);
  };

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!wrap || !canvas || !ctx) return;

    const sprites = ["/assets/adam-run.png", "/assets/amelia-run.png"].map((src) => {
      const image = new Image();
      image.src = src;
      return image;
    });

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let scale = 1;
    let visible = true;
    let requestId = 0;
    let lastPhase: ScenePhase = "walk";
    let isPaused = false;
    let elapsedBeforePause = 0;
    let resumedAt = performance.now();
    const elapsed = () => (isPaused ? elapsedBeforePause : elapsedBeforePause + performance.now() - resumedAt);

    const render = (time: number) => {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.imageSmoothingEnabled = false;
      const frame = frameAt(time);
      drawFrame(ctx, frame, sprites);
      if (frame.phase !== lastPhase) {
        lastPhase = frame.phase;
        setPhase(frame.phase);
      }
    };

    const staticTime = WALK_MS + 1500;

    // Render at the largest whole-number scale, then let CSS stretch the last
    // few percent so the scene fills its frame without dropping pixel rows.
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      scale = Math.max(1, Math.floor((wrap.clientWidth * dpr) / W));
      canvas.width = W * scale;
      canvas.height = H * scale;
      render(reducedMotion ? staticTime : elapsed());
    };

    const loop = () => {
      render(elapsed());
      requestId = requestAnimationFrame(loop);
    };

    const start = () => {
      if (reducedMotion || isPaused || requestId || !visible || document.hidden) return;
      requestId = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(requestId);
      requestId = 0;
    };

    controlsRef.current = {
      pause: () => {
        elapsedBeforePause = elapsed();
        isPaused = true;
        stop();
      },
      resume: () => {
        resumedAt = performance.now();
        isPaused = false;
        start();
      },
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(wrap);

    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      if (visible) start();
      else stop();
    });
    visibilityObserver.observe(wrap);

    const onVisibilityChange = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibilityChange);
    sprites.forEach((image) => image.addEventListener("load", () => render(reducedMotion ? staticTime : elapsed())));

    if (reducedMotion) setPhase("talk");
    else setCanAnimate(true);
    start();

    return () => {
      stop();
      controlsRef.current = null;
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return (
    <div className={`${styles.sceneCard} ${embedded ? styles.sceneEmbedded : ""}`}>
      <div className={styles.sceneTop}>
        <span>Live room preview</span>
        <div className={styles.sceneTopEnd}>
          <b translate="no">team-hq · 2 online</b>
          {canAnimate && (
            <button
              type="button"
              className={styles.scenePause}
              onClick={togglePaused}
              aria-pressed={paused}
              aria-label={paused ? "Play room animation" : "Pause room animation"}
            >
              {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
            </button>
          )}
        </div>
      </div>
      <div ref={wrapRef} className={styles.sceneCanvasWrap}>
        <canvas
          ref={canvasRef}
          className={styles.sceneCanvas}
          role="img"
          aria-label="Two pixel avatars walk toward each other. When they are close, a proximity ring appears and voice connects; when they step apart, it disconnects."
        />
      </div>
      <ol className={styles.scenePhases} aria-hidden="true">
        {PHASES.map((item, index) => (
          <li key={item.id} className={phase === item.id ? styles.scenePhaseActive : ""}>
            <span>0{index + 1}</span>
            {item.label}
          </li>
        ))}
      </ol>
    </div>
  );
}
