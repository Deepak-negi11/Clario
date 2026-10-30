// What the Tetris cabinet's monitor shows, painted on a 4:3 canvas: the well in the middle, hold,
// score, level, lines and time on the left, the next three pieces and your best on the right, and
// the title, pause and game-over cards over the well. The 3D cabinet (tetris-3d.ts) uses this canvas
// as its screen; without WebGL the canvas is shown as it is. Scanlines and a dark edge make it read
// as a tube, not a flat panel. With reduced motion cleared rows only flash (no wipe) and nothing blinks.
// It's laid out on 768 x 576 but painted at twice that, so the small print stays sharp on the tube.
// When the cabinet draws the blocks in 3D (`blocks3d`), the well is left empty for them. In versus,
// a red bar beside the well shows garbage on its way, and the player's name sits above it.

import { CLEAR_TIME, COLS, HIDDEN, NEXT_SHOWN, ROWS, pieceCells, shapeCells, type BlockKind, type PieceKind, type Tetris } from "./tetris-rules";

export const SCREEN_PX = { width: 768, height: 576 } as const;

const CELL = 24;
const WELL_W = COLS * CELL;
const WELL_H = (ROWS - HIDDEN) * CELL;
const WELL_X = (SCREEN_PX.width - WELL_W) / 2;
const WELL_Y = 48;
const PANEL_W = 176;
const LEFT_X = WELL_X - 40 - PANEL_W;
const RIGHT_X = WELL_X + WELL_W + 40;
const SCALE = 2;
// Where the well is on the screen, for the 3D blocks.
export const WELL_LAYOUT = { x: WELL_X, y: WELL_Y, cell: CELL, width: WELL_W, height: WELL_H } as const;

// The Guideline colours, a touch warmer, as they'd glow on a tube.
export const PIECE_COLORS: Record<BlockKind, { face: string; light: string; dark: string }> = {
  G: { face: "#7d8396", light: "#b4b9c8", dark: "#4a4f5e" },
  I: { face: "#21c8e8", light: "#9cf0ff", dark: "#0b7f99" },
  O: { face: "#f5d020", light: "#fff3a0", dark: "#a68a06" },
  T: { face: "#a845e0", light: "#dba6ff", dark: "#6a1f99" },
  S: { face: "#3ccf4e", light: "#a6f5ae", dark: "#1d8a2b" },
  Z: { face: "#ec3b3b", light: "#ffa3a3", dark: "#9e1a1a" },
  J: { face: "#3866f0", light: "#a3b9ff", dark: "#1a3aa6" },
  L: { face: "#f08a24", light: "#ffcb94", dark: "#a65508" },
};

export type ScreenInfo = {
  best: number;
  touch: boolean;
  reducedMotion: boolean;
  // The cabinet draws the blocks in 3D: leave the well empty.
  blocks3d?: boolean;
  // Versus: whose screen this is ("YOU", "COMPUTER"), and what starts a game here.
  name?: string;
  versus?: boolean;
  startLine?: string;
};

function pixelFont() {
  const family = typeof document !== "undefined" ? getComputedStyle(document.body).getPropertyValue("--font-pixel").trim() : "";
  return family ? `${family}, ui-monospace, monospace` : "ui-monospace, monospace";
}

function block(ctx: CanvasRenderingContext2D, kind: BlockKind, x: number, y: number, size: number, alpha = 1) {
  const color = PIECE_COLORS[kind];
  const edge = Math.max(2, Math.round(size / 7));
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color.dark;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = color.light;
  ctx.fillRect(x, y, size - edge, edge);
  ctx.fillRect(x, y, edge, size - edge);
  ctx.fillStyle = color.face;
  ctx.fillRect(x + edge, y + edge, size - edge * 2, size - edge * 2);
  // A soft shine in the top corner.
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillRect(x + edge, y + edge, Math.round(size / 3), Math.round(size / 5));
  ctx.globalAlpha = 1;
}

// A piece centred in a box, for hold and next.
function preview(ctx: CanvasRenderingContext2D, kind: PieceKind, cx: number, cy: number, size: number, alpha = 1) {
  const cells = shapeCells(kind, 0);
  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  const width = (Math.max(...xs) - Math.min(...xs) + 1) * size;
  const height = (Math.max(...ys) - Math.min(...ys) + 1) * size;
  for (const [x, y] of cells) {
    block(ctx, kind, cx - width / 2 + (x - Math.min(...xs)) * size, cy - height / 2 + (y - Math.min(...ys)) * size, size, alpha);
  }
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "rgba(4, 8, 24, 0.82)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#3b5cff";
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  ctx.strokeStyle = "rgba(140, 170, 255, 0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 5.5, y + 5.5, w - 11, h - 11);
}

function label(ctx: CanvasRenderingContext2D, font: string, text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "left") {
  ctx.font = `600 ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillText(text, x + 2, y + 2);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function createScreenPainter(canvas: HTMLCanvasElement) {
  canvas.width = SCREEN_PX.width * SCALE;
  canvas.height = SCREEN_PX.height * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  const font = pixelFont();

  // The parts that never change, painted once.
  const backdrop = document.createElement("canvas");
  backdrop.width = SCREEN_PX.width * SCALE;
  backdrop.height = SCREEN_PX.height * SCALE;
  {
    const b = backdrop.getContext("2d")!;
    b.scale(SCALE, SCALE);
    const sky = b.createLinearGradient(0, 0, 0, SCREEN_PX.height);
    sky.addColorStop(0, "#0a1240");
    sky.addColorStop(1, "#140a2e");
    b.fillStyle = sky;
    b.fillRect(0, 0, SCREEN_PX.width, SCREEN_PX.height);
    // A faint field of blocks behind everything, like the title screens of old.
    b.globalAlpha = 0.07;
    b.fillStyle = "#6f8cff";
    for (let y = 0; y < SCREEN_PX.height; y += 32) for (let x = (y / 32) % 2 ? 16 : 0; x < SCREEN_PX.width; x += 32) b.fillRect(x + 4, y + 4, 24, 24);
    b.globalAlpha = 1;
    // The well: a dark pit with a bevelled steel frame.
    b.fillStyle = "#4a5578";
    b.fillRect(WELL_X - 10, WELL_Y - 10, WELL_W + 20, WELL_H + 20);
    b.fillStyle = "#8f9cc4";
    b.fillRect(WELL_X - 10, WELL_Y - 10, WELL_W + 20, 4);
    b.fillRect(WELL_X - 10, WELL_Y - 10, 4, WELL_H + 20);
    b.fillStyle = "#262d47";
    b.fillRect(WELL_X - 10, WELL_Y + WELL_H + 6, WELL_W + 20, 4);
    b.fillRect(WELL_X + WELL_W + 6, WELL_Y - 10, 4, WELL_H + 20);
    b.fillStyle = "#03050f";
    b.fillRect(WELL_X - 2, WELL_Y - 2, WELL_W + 4, WELL_H + 4);
    b.strokeStyle = "rgba(90, 110, 190, 0.16)";
    b.lineWidth = 1;
    for (let x = 1; x < COLS; x++) {
      b.beginPath();
      b.moveTo(WELL_X + x * CELL + 0.5, WELL_Y);
      b.lineTo(WELL_X + x * CELL + 0.5, WELL_Y + WELL_H);
      b.stroke();
    }
    for (let y = 1; y < ROWS - HIDDEN; y++) {
      b.beginPath();
      b.moveTo(WELL_X, WELL_Y + y * CELL + 0.5);
      b.lineTo(WELL_X + WELL_W, WELL_Y + y * CELL + 0.5);
      b.stroke();
    }
    panel(b, LEFT_X, WELL_Y, PANEL_W, 132);
    panel(b, LEFT_X, WELL_Y + 152, PANEL_W, WELL_H - 152);
    panel(b, RIGHT_X, WELL_Y, PANEL_W, 300);
    panel(b, RIGHT_X, WELL_Y + 320, PANEL_W, WELL_H - 320);
  }

  // Scanlines and the tube's dark rim, laid over everything.
  const glass = document.createElement("canvas");
  glass.width = SCREEN_PX.width * SCALE;
  glass.height = SCREEN_PX.height * SCALE;
  {
    const g = glass.getContext("2d")!;
    g.scale(SCALE, SCALE);
    g.fillStyle = "rgba(0,0,0,0.22)";
    for (let y = 0; y < SCREEN_PX.height; y += 3) g.fillRect(0, y, SCREEN_PX.width, 1);
    const rim = g.createRadialGradient(SCREEN_PX.width / 2, SCREEN_PX.height / 2, SCREEN_PX.height * 0.42, SCREEN_PX.width / 2, SCREEN_PX.height / 2, SCREEN_PX.width * 0.62);
    rim.addColorStop(0, "rgba(0,0,0,0)");
    rim.addColorStop(1, "rgba(0,0,0,0.6)");
    g.fillStyle = rim;
    g.fillRect(0, 0, SCREEN_PX.width, SCREEN_PX.height);
  }

  return function paint(game: Tetris, info: ScreenInfo, time: number) {
    const { state } = game;
    ctx.drawImage(backdrop, 0, 0, SCREEN_PX.width, SCREEN_PX.height);
    const flat = !info.blocks3d;

    // Locked blocks; rows being cleared flash white and wipe out from the middle.
    const clearing = state.clearing;
    const progress = clearing ? Math.min(1, clearing.time / CLEAR_TIME) : 0;
    for (let y = HIDDEN; y < ROWS; y++) {
      const row = state.board[y]!;
      const isClearing = clearing?.rows.includes(y);
      for (let x = 0; x < COLS; x++) {
        const kind = row[x];
        if (!kind || !flat) continue;
        const px = WELL_X + x * CELL;
        const py = WELL_Y + (y - HIDDEN) * CELL;
        if (isClearing) {
          const gone = !info.reducedMotion && Math.abs(x - (COLS - 1) / 2) < progress * (COLS / 2 + 1) - 1;
          if (gone) continue;
          block(ctx, kind, px, py, CELL);
          ctx.fillStyle = `rgba(255,255,255,${info.reducedMotion ? 0.7 : 0.85 - progress * 0.4})`;
          ctx.fillRect(px, py, CELL, CELL);
        } else block(ctx, kind, px, py, CELL);
      }
    }

    // The ghost, then the falling piece.
    const ghost = game.ghost();
    if (flat && state.piece && ghost) {
      const color = PIECE_COLORS[state.piece.kind];
      for (const [x, y] of pieceCells(ghost)) {
        if (y < HIDDEN) continue;
        ctx.strokeStyle = color.face;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 2;
        ctx.strokeRect(WELL_X + x * CELL + 2, WELL_Y + (y - HIDDEN) * CELL + 2, CELL - 4, CELL - 4);
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = color.face;
        ctx.fillRect(WELL_X + x * CELL + 2, WELL_Y + (y - HIDDEN) * CELL + 2, CELL - 4, CELL - 4);
        ctx.globalAlpha = 1;
      }
      for (const [x, y] of pieceCells(state.piece)) if (y >= HIDDEN) block(ctx, state.piece.kind, WELL_X + x * CELL, WELL_Y + (y - HIDDEN) * CELL, CELL);
    }

    // Hold.
    label(ctx, font, "HOLD", LEFT_X + 18, WELL_Y + 14, 20, "#9fb4ff");
    if (state.hold) preview(ctx, state.hold, LEFT_X + PANEL_W / 2, WELL_Y + 82, 22, state.canHold ? 1 : 0.35);

    // Score, level, lines and time.
    const statsY = WELL_Y + 170;
    const stat = (name: string, value: string, y: number, color = "#ffffff") => {
      label(ctx, font, name, LEFT_X + 18, y, 16, "#9fb4ff");
      label(ctx, font, value, LEFT_X + 18, y + 22, 26, color);
    };
    stat("SCORE", String(state.score).padStart(6, "0"), statsY, "#ffe066");
    stat("LEVEL", String(state.level), statsY + 72);
    stat("LINES", String(state.lines), statsY + 144);
    stat("TIME", clock(state.time), statsY + 216);

    // Next.
    label(ctx, font, "NEXT", RIGHT_X + 18, WELL_Y + 14, 20, "#9fb4ff");
    state.queue.slice(0, NEXT_SHOWN).forEach((kind, index) => {
      preview(ctx, kind, RIGHT_X + PANEL_W / 2, WELL_Y + 86 + index * 76, index === 0 ? 24 : 18, index === 0 ? 1 : 0.8);
    });

    // Best, or in versus the lines sent.
    label(ctx, font, info.versus ? "SENT" : "BEST", RIGHT_X + 18, WELL_Y + 338, 16, "#9fb4ff");
    label(ctx, font, info.versus ? String(state.sent) : String(Math.max(info.best, state.score)).padStart(6, "0"), RIGHT_X + 18, WELL_Y + 360, 26, "#ffffff");

    // Versus: the name over the well, and garbage on its way up the side.
    if (info.name) label(ctx, font, info.name, SCREEN_PX.width / 2, 14, 20, "#ffffff", "center");
    if (info.versus) {
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(WELL_X - 22, WELL_Y, 8, WELL_H);
      const incoming = Math.min(state.incoming, ROWS - HIDDEN) * CELL;
      ctx.fillStyle = state.incoming >= 4 ? "#ff3b3b" : "#ff9a3b";
      ctx.fillRect(WELL_X - 22, WELL_Y + WELL_H - incoming, 8, incoming);
    }

    // "Tetris!", "T-Spin Double" and friends, over the well for a moment.
    if (state.callout && state.phase === "playing") {
      const fade = Math.max(0, 1 - state.callout.age / 2);
      const rise = info.reducedMotion ? 0 : state.callout.age * 18;
      ctx.globalAlpha = fade;
      const big = /Tetris|T-Spin/.test(state.callout.text);
      label(ctx, font, state.callout.text.toUpperCase(), SCREEN_PX.width / 2, WELL_Y + WELL_H * 0.36 - rise, big ? 26 : 20, big ? "#ffe066" : "#ffffff", "center");
      ctx.globalAlpha = 1;
    }

    // Cards over the well.
    const blink = info.reducedMotion || Math.floor(time * 1.6) % 2 === 0;
    const card = (title: string, lines: string[], titleColor: string) => {
      ctx.fillStyle = "rgba(3, 5, 16, 0.78)";
      ctx.fillRect(WELL_X, WELL_Y + WELL_H * 0.3, WELL_W, WELL_H * 0.4);
      label(ctx, font, title, SCREEN_PX.width / 2, WELL_Y + WELL_H * 0.36, 32, titleColor, "center");
      lines.forEach((line, index) => {
        if (index === lines.length - 1 && !blink) return;
        label(ctx, font, line, SCREEN_PX.width / 2, WELL_Y + WELL_H * 0.36 + 56 + index * 28, 17, "#ffffff", "center");
      });
    };
    const startLine = info.startLine ?? (info.touch ? "TAP START" : "PRESS ENTER");
    if (state.phase === "ready") {
      // The title, built from blocks.
      card("TETRIS", ["CLEAR LINES TO", "LEVEL UP", startLine], "#ffe066");
      const demo: PieceKind[] = ["T", "I", "S", "Z", "L", "J", "O"];
      demo.forEach((kind, index) => preview(ctx, kind, WELL_X + 18 + index * 34, WELL_Y + WELL_H * 0.25, 9));
    } else if (state.phase === "paused") {
      card("PAUSED", [info.touch ? "TAP PLAY" : "PRESS P"], "#9fb4ff");
    } else if (state.phase === "over") {
      if (info.versus) card("KNOCKED OUT", [`LINES ${state.lines}`, `SENT ${state.sent}`, startLine], "#ff6b6b");
      else card("GAME OVER", [`SCORE ${state.score}`, state.score > 0 && state.score >= info.best ? "NEW BEST!" : `LINES ${state.lines}`, startLine], "#ff6b6b");
    } else if (state.phase === "won") {
      card("WINNER!", [`LINES ${state.lines}`, `SENT ${state.sent}`, startLine], "#ffe066");
    }

    ctx.drawImage(glass, 0, 0, SCREEN_PX.width, SCREEN_PX.height);
  };
}
