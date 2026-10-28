"use client";

import { useEffect, useRef, useState } from "react";

type Line = { text: string; color: string };

type DitherWaveTextProps = {
  lines: Line[];
  // "inline" puts every line on one row, "stack" puts each on its own row,
  // "auto" uses one row when it fits at a readable size and stacks otherwise.
  layout?: "inline" | "stack" | "auto";
  // Logical pixel size the text is rasterised at; larger = more detail, smaller = chunkier.
  fontSize?: number;
  // Largest on-screen size of one logical pixel, in CSS pixels.
  maxScale?: number;
  className?: string;
};

const HALO = 4;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => BAYER[(y % 4) * 4 + (x % 4)]! / 16;

type Grid = {
  w: number;
  h: number;
  solid: Uint8Array; // 0 = empty, otherwise line index + 1
  dist: Uint8Array; // distance to the nearest solid pixel (255 = far)
  owner: Uint8Array; // which line the nearest solid pixel belongs to
};

function rasterise(lines: Line[], font: string, fontSize: number, inline: boolean): Grid {
  const pad = HALO + 1;
  const lineHeight = Math.round(fontSize * 1.35);
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = font;
  const space = measure.measureText(" ").width;
  const widths = lines.map((line) => measure.measureText(line.text).width);
  const positions = lines.map((_, index) =>
    inline
      ? { x: pad + widths.slice(0, index).reduce((sum, width) => sum + width + space, 0), y: pad }
      : { x: pad, y: pad + index * lineHeight },
  );
  const w = Math.ceil(inline ? widths.reduce((sum, width) => sum + width, 0) + space * (lines.length - 1) : Math.max(...widths)) + pad * 2;
  const h = (inline ? lineHeight : lineHeight * lines.length) + pad * 2;

  const offscreen = document.createElement("canvas");
  offscreen.width = w;
  offscreen.height = h;
  const ctx = offscreen.getContext("2d", { willReadFrequently: true })!;
  ctx.font = font;
  ctx.textBaseline = "top";
  ctx.fillStyle = "#000";

  const solid = new Uint8Array(w * h);
  lines.forEach((line, index) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillText(line.text, positions[index]!.x, positions[index]!.y);
    const alpha = ctx.getImageData(0, 0, w, h).data;
    for (let p = 0; p < w * h; p++) {
      if (alpha[p * 4 + 3]! > 110 && !solid[p]) solid[p] = index + 1;
    }
  });

  const dist = new Uint8Array(w * h).fill(255);
  const owner = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const line = solid[y * w + x];
      if (!line) continue;
      for (let dy = -HALO; dy <= HALO; dy++) {
        for (let dx = -HALO; dx <= HALO; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          if (d < dist[q]!) {
            dist[q] = d;
            owner[q] = line;
          }
        }
      }
    }
  }

  return { w, h, solid, dist, owner };
}

export function DitherWaveText({ lines, layout = "stack", fontSize = 24, maxScale = 2, className = "" }: DitherWaveTextProps) {
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const linesKey = JSON.stringify(lines);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!wrap || !canvas || !ctx) return;

    const parsedLines = JSON.parse(linesKey) as Line[];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const font = `500 ${fontSize}px ${getComputedStyle(wrap).fontFamily}`;
    let grid: Grid | null = null;
    let grids: { inline: Grid; stack: Grid } | null = null;
    let scale = 1;
    let requestId = 0;
    let visible = true;
    let disposed = false;
    const startedAt = performance.now();

    const render = (time: number) => {
      if (!grid) return;
      const { w, h, solid, dist, owner } = grid;
      const t = time / 1000;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, w, h);

      parsedLines.forEach((line, index) => {
        ctx.globalAlpha = 1;
        ctx.fillStyle = line.color;
        for (let p = 0; p < w * h; p++) {
          if (solid[p] === index + 1) ctx.fillRect(p % w, Math.floor(p / w), 1, 1);
        }

        // Dithered halo: density falls off with distance and ripples with a travelling wave.
        ctx.globalAlpha = 0.42;
        for (let p = 0; p < w * h; p++) {
          const d = dist[p]!;
          if (solid[p] || d > HALO || owner[p] !== index + 1) continue;
          const x = p % w;
          const y = Math.floor(p / w);
          const wave = 0.5 + 0.5 * Math.sin(x * 0.11 + y * 0.06 - t * 2.4);
          const density = (1 - (d - 1) / HALO) * wave * wave * 0.7;
          if (density > bayer(x, y)) ctx.fillRect(x, y, 1, 1);
        }
      });
      ctx.globalAlpha = 1;
    };

    const resize = () => {
      if (!grids) return;
      const dpr = window.devicePixelRatio || 1;
      // One row only if it can be drawn at 1.5 CSS px per pixel or more; otherwise stack.
      const useInline = layout === "inline" || (layout === "auto" && wrap.clientWidth >= grids.inline.w * 1.5);
      grid = useInline ? grids.inline : grids.stack;
      scale = Math.max(1, Math.min(Math.floor(maxScale * dpr), Math.floor((wrap.clientWidth * dpr) / grid.w)));
      canvas.width = grid.w * scale;
      canvas.height = grid.h * scale;
      canvas.style.width = `${(grid.w * scale) / dpr}px`;
      canvas.style.height = `${(grid.h * scale) / dpr}px`;
      render(reducedMotion ? 0 : performance.now() - startedAt);
    };

    const loop = () => {
      render(performance.now() - startedAt);
      requestId = requestAnimationFrame(loop);
    };
    const start = () => {
      if (reducedMotion || requestId || !visible || document.hidden || !grid) return;
      requestId = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(requestId);
      requestId = 0;
    };

    const resizeObserver = new ResizeObserver(resize);
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      if (visible) start();
      else stop();
    });
    const onVisibilityChange = () => (document.hidden ? stop() : start());

    document.fonts.load(font).then(() => {
      if (disposed) return;
      grids = {
        inline: rasterise(parsedLines, font, fontSize, true),
        stack: rasterise(parsedLines, font, fontSize, false),
      };
      resize();
      setReady(true);
      resizeObserver.observe(wrap);
      visibilityObserver.observe(wrap);
      document.addEventListener("visibilitychange", onVisibilityChange);
      start();
    });

    return () => {
      disposed = true;
      stop();
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [linesKey, layout, fontSize, maxScale]);

  return (
    <span ref={wrapRef} className={`block font-[family-name:var(--font-pixel)] ${className}`} aria-hidden="true">
      <canvas ref={canvasRef} className={`block max-w-full [image-rendering:pixelated] ${ready ? "" : "hidden"}`} />
      {!ready && (
        <span className="block text-[2.3rem] font-medium leading-[1.1] sm:text-[3.2rem]">
          {lines.map((line) => (
            <span key={line.text} className={layout === "stack" ? "block" : "inline"} style={{ color: line.color }}>{line.text} </span>
          ))}
        </span>
      )}
    </span>
  );
}
