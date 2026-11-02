"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type RefObject } from "react";
import { Eraser, PenLine, Trash2, Type, Undo2 } from "lucide-react";
import {
  BOARD_H, BOARD_W, ERASER, MARKERS, NOTE_LINE_HEIGHT, NOTE_SIZES, NOTE_TEXT_MAX, STROKE_POINTS_MAX, addPoint, isNote, lastStrokeBy,
  noteLinesMax, placeNote, wrapNote, type Line, type Note, type SavedStroke, type Stroke,
} from "@repo/shared";
import type { SceneBridge } from "../phaser/scene-bridge";
import { WorkplaceDialog, focus, muted, secondary } from "./panel-kit";
import type { Workplace } from "./use-workplace";

// A whiteboard everyone in the space draws and writes on together. Your stroke shows as you draw
// and goes to everyone when you lift the pen; a note you type goes when you press Enter or click
// away. Theirs appear the same way. The board keeps it all.

const BOARD_FILL = "#fbfbf9";
const MARKER_NAMES = ["Black", "Red", "Blue", "Green", "Orange"] as const;
const WIDTHS = [
  { width: 3, name: "Fine" },
  { width: 6, name: "Medium" },
  { width: 12, name: "Bold" },
] as const;
const NOTE_SIZE_NAMES: Record<Note["size"], string> = { 24: "Small", 36: "Medium", 56: "Large" };
const ERASER_WIDTH = 28;
// Board units between two points beyond which a corner is kept sharp.
const SMOOTH_GAP = 24;
// Where a note starts when Text is picked from the keyboard (with a pointer, it starts where you click).
const KEYBOARD_NOTE_AT: [number, number] = [60, 60];
const NOTE_PLACEHOLDER = "Type here";

type Mode = "pen" | "text" | "eraser";
type Marker = Note["color"];
// A note being typed: where it was started (it moves in from the edges as it grows) and its text.
type Draft = { origin: [number, number]; text: string };

// Notes are lettered in the page's own font (read from the canvas, which the typing box shares), semibold.
const noteFont = (size: number, family: string) => `600 ${size}px ${family}`;

let measurer: CanvasRenderingContext2D | null = null;
function measureFor(size: number, family: string): (text: string) => number {
  measurer ??= document.createElement("canvas").getContext("2d");
  const ctx = measurer;
  if (!ctx) return (text) => text.length * size * 0.55;
  return (text) => {
    ctx.font = noteFont(size, family);
    return ctx.measureText(text).width;
  };
}

function write(ctx: CanvasRenderingContext2D, note: Pick<Note, "color" | "size" | "at" | "text">, family: string) {
  ctx.font = noteFont(note.size, family);
  ctx.fillStyle = note.color;
  ctx.textBaseline = "alphabetic";
  // The baseline sits where CSS puts it in a line box this tall, so the note lands exactly where it
  // was typed.
  const lineHeight = note.size * NOTE_LINE_HEIGHT;
  const metrics = ctx.measureText("Hg");
  const ascent = metrics.fontBoundingBoxAscent ?? note.size * 0.8;
  const descent = metrics.fontBoundingBoxDescent ?? note.size * 0.2;
  const baseline = (lineHeight - ascent - descent) / 2 + ascent;
  note.text.split("\n").forEach((line, index) => ctx.fillText(line, note.at[0], note.at[1] + index * lineHeight + baseline));
}

function paint(ctx: CanvasRenderingContext2D, stroke: Pick<Line, "color" | "width" | "points">) {
  const points = stroke.points;
  if (!points.length) return;
  ctx.strokeStyle = stroke.color === ERASER ? BOARD_FILL : stroke.color;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0]![0], points[0]![1], stroke.width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(points[0]![0], points[0]![1]);
  // Smooth the line through the midpoints, so it reads as a marker, not a polyline. Where the points
  // are far apart (a quick flick of the pen) the corner is drawn as it was, not rounded off.
  for (let index = 1; index < points.length - 1; index++) {
    const [px, py] = points[index - 1]!;
    const [x, y] = points[index]!;
    const [nx, ny] = points[index + 1]!;
    if (Math.hypot(x - px, y - py) > SMOOTH_GAP || Math.hypot(nx - x, ny - y) > SMOOTH_GAP) ctx.lineTo(x, y);
    else ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
  }
  const last = points.at(-1)!;
  ctx.lineTo(last[0], last[1]);
  ctx.stroke();
}

export function WhiteboardPanel({
  bridgeRef,
  board,
  workplace,
  onClose,
}: {
  bridgeRef: RefObject<SceneBridge>;
  board: { id: string; label: string };
  workplace: Workplace;
  onClose: () => void;
}) {
  const { boards, send, selfId } = workplace;
  const strokes = boards[board.id];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef<{ points: [number, number][]; pointerId: number } | null>(null);
  const noteBoxRef = useRef<HTMLTextAreaElement>(null);
  const textToolRef = useRef<HTMLButtonElement>(null);
  const [mode, setMode] = useState<Mode>("pen");
  const [color, setColor] = useState<Marker>(MARKERS[0]);
  const [lineWidth, setLineWidth] = useState<Line["width"]>(6);
  const [noteSize, setNoteSize] = useState<Note["size"]>(36);
  const [draft, setDraft] = useState<Draft | null>(null);
  // The same draft, for the handlers that finish it (a blur can come before the next render).
  const draftRef = useRef<Draft | null>(null);
  draftRef.current = draft;
  const tool = useMemo<Pick<Line, "color" | "width">>(
    () => (mode === "eraser" ? { color: ERASER, width: ERASER_WIDTH } : { color, width: lineWidth }),
    [mode, color, lineWidth],
  );
  const [confirmWipe, setConfirmWipe] = useState(false);
  // Strokes you sent that the server hasn't echoed back yet, so they don't blink out meanwhile.
  const [pending, setPending] = useState<SavedStroke[]>([]);
  // What's on the board: the server's strokes, then yours still on the way (each once, even in the
  // moment between the server's echo and `pending` letting go of it).
  const onBoard = useMemo(() => {
    if (!strokes) return pending;
    const saved = new Set(strokes.map((stroke) => stroke.id));
    return [...strokes, ...pending.filter((stroke) => !saved.has(stroke.id))];
  }, [strokes, pending]);

  useEffect(() => {
    send?.({ action: "board-open", board: board.id });
  }, [send, board.id]);

  useEffect(() => {
    if (!strokes) return;
    setPending((current) => current.filter((each) => !strokes.some((stroke) => stroke.id === each.id)));
  }, [strokes]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.setTransform(canvas.width / BOARD_W, 0, 0, canvas.height / BOARD_H, 0, 0);
    ctx.fillStyle = BOARD_FILL;
    ctx.fillRect(0, 0, BOARD_W, BOARD_H);
    const family = getComputedStyle(canvas).fontFamily;
    for (const stroke of onBoard) {
      if (isNote(stroke)) write(ctx, stroke, family);
      else paint(ctx, stroke);
    }
    const drawing = drawingRef.current;
    if (drawing) paint(ctx, { ...tool, points: drawing.points });
  }, [onBoard, tool]);

  // The canvas matches its shown size and the screen's pixel density, so lines stay sharp.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * scale));
      canvas.height = Math.max(1, Math.round(rect.height * scale));
      redraw();
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    // Notes drawn before the page's font arrived are drawn again in it.
    let live = true;
    void document.fonts.ready.then(() => live && redraw());
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [redraw]);

  useEffect(redraw, [redraw]);

  const at = (event: MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height] as const;
  };

  const finish = () => {
    const drawing = drawingRef.current;
    drawingRef.current = null;
    if (!drawing?.points.length || !send) return;
    const stroke: Stroke = { id: crypto.randomUUID().slice(0, 32), ...tool, points: drawing.points };
    if (send({ action: "draw", board: board.id, stroke })) setPending((current) => [...current, { ...stroke, by: selfId ?? "" }]);
    redraw();
  };

  const down = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!strokes || mode === "text" || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const points: [number, number][] = [];
    const [u, v] = at(event);
    addPoint(points, u, v);
    drawingRef.current = { points, pointerId: event.pointerId };
    redraw();
  };

  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    const drawing = drawingRef.current;
    if (!drawing || drawing.pointerId !== event.pointerId) return;
    for (const sample of event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent]) {
      const rect = event.currentTarget.getBoundingClientRect();
      addPoint(drawing.points, (sample.clientX - rect.left) / rect.width, (sample.clientY - rect.top) / rect.height);
      // A long line is sent in pieces, each starting where the last one ended.
      if (drawing.points.length >= STROKE_POINTS_MAX) {
        const last = drawing.points.at(-1)!;
        finish();
        drawingRef.current = { points: [last], pointerId: event.pointerId };
      }
    }
    redraw();
  };

  // ----- Typed notes

  // A note laid out as the board will draw it: where it goes, its lines and how wide they are.
  const layOut = (origin: [number, number], text: string, size: Note["size"]) => {
    const measure = measureFor(size, canvasRef.current ? getComputedStyle(canvasRef.current).fontFamily : "sans-serif");
    const { maxWidth } = placeNote(origin, size);
    const lines = wrapNote(text, maxWidth, measure);
    const width = Math.max(measure(NOTE_PLACEHOLDER), ...lines.map(measure));
    return { at: placeNote(origin, size, lines.length).at, lines, maxWidth, width };
  };
  const fits = (text: string, size: Note["size"]) => !draft || layOut(draft.origin, text, size).lines.length <= noteLinesMax(size);

  // Puts the note being typed on the board, in its lines as shown. An empty one is just dropped.
  const finishNote = () => {
    const current = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    const text = current?.text.trim();
    if (!current || !text || !send) return;
    const { at, lines } = layOut(current.origin, text, noteSize);
    const note: Note = { id: crypto.randomUUID().slice(0, 32), kind: "text", color, size: noteSize, at, text: lines.join("\n") };
    if (send({ action: "draw", board: board.id, stroke: note })) setPending((list) => [...list, { ...note, by: selfId ?? "" }]);
  };

  const startNote = (origin: [number, number]) => {
    finishNote();
    const next = { origin, text: "" };
    draftRef.current = next;
    setDraft(next);
  };

  // Text mode: a click (or tap) on the board starts a note there. It's a click, not a press, so
  // phones open their keyboard for it.
  const place = (event: MouseEvent<HTMLCanvasElement>) => {
    if (mode !== "text" || !strokes) return;
    const [u, v] = at(event);
    startNote([u * BOARD_W, v * BOARD_H]);
  };

  const draftOrigin = draft?.origin;
  useLayoutEffect(() => {
    if (draftOrigin) noteBoxRef.current?.focus({ preventScroll: true });
  }, [draftOrigin]);

  const noteKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      // Drops the note you're typing (and keeps the board open; the next Escape closes it).
      event.preventDefault();
      draftRef.current = null;
      setDraft(null);
      textToolRef.current?.focus();
    } else if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      finishNote();
      textToolRef.current?.focus();
    }
  };

  const chooseMode = (next: Mode) => {
    if (next !== "text") finishNote();
    setMode(next);
  };

  const mineToUndo = !!(strokes && selfId && lastStrokeBy([...strokes, ...pending], selfId));
  const undo = useCallback(() => send?.({ action: "undo", board: board.id }), [send, board.id]);

  useEffect(() => {
    if (!confirmWipe) return;
    const timer = window.setTimeout(() => setConfirmWipe(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirmWipe]);

  const erasing = mode === "eraser";
  const option = `grid h-8 cursor-pointer place-items-center rounded-lg text-[#3b4150] transition aria-pressed:bg-white aria-pressed:text-[#12151c] aria-pressed:shadow-[0_1px_2px_rgba(18,21,28,0.14)] disabled:cursor-default disabled:opacity-40 motion-reduce:transition-none ${focus}`;
  const view = draft ? layOut(draft.origin, draft.text, noteSize) : null;
  const notes = onBoard.filter(isNote);
  return (
    <WorkplaceDialog
      bridgeRef={bridgeRef}
      name="whiteboard"
      title="Whiteboard"
      subtitle={`${board.label}. Everyone here can draw and write; the board keeps it.`}
      icon={PenLine}
      width="w-[min(64rem,calc(100vw-1rem))]"
      onClose={onClose}
    >
      <div
        className="flex flex-col gap-3 p-4"
        onKeyDown={(event) => {
          // While typing a note, Ctrl+Z undoes the typing instead.
          if (event.target instanceof HTMLTextAreaElement) return;
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
            event.preventDefault();
            undo();
          }
        }}
      >
        {/* While a note is open the tools don't take focus from it, so you can recolour it mid-sentence. */}
        <div
          className="flex flex-wrap items-center gap-2"
          onMouseDown={(event) => {
            if (draftRef.current) event.preventDefault();
          }}
        >
          <div role="group" aria-label="Tool" className="flex items-center gap-1 rounded-xl bg-[#f1f2f4] p-1.5">
            <button type="button" aria-label="Pen" title="Pen" aria-pressed={mode === "pen"} onClick={() => chooseMode("pen")} className={`${option} w-8`}>
              <PenLine size={17} aria-hidden="true" />
            </button>
            <button
              ref={textToolRef}
              type="button"
              aria-label="Text"
              title="Text: click the board, type, then press Enter"
              aria-pressed={mode === "text"}
              onClick={(event) => {
                chooseMode("text");
                // From the keyboard there's no spot to click, so a note opens near the top left.
                if (event.detail === 0 && !draftRef.current) startNote(KEYBOARD_NOTE_AT);
              }}
              className={`${option} w-8`}
            >
              <Type size={17} aria-hidden="true" />
            </button>
            <button type="button" aria-label="Eraser" title="Eraser" aria-pressed={erasing} onClick={() => chooseMode("eraser")} className={`${option} w-8`}>
              <Eraser size={17} aria-hidden="true" />
            </button>
          </div>
          <div role="group" aria-label="Marker colour" className="flex items-center gap-1.5 rounded-xl bg-[#f1f2f4] p-1.5">
            {MARKERS.map((marker, index) => (
              <button
                key={marker}
                type="button"
                aria-label={`${MARKER_NAMES[index]} marker`}
                aria-pressed={!erasing && color === marker}
                onClick={() => {
                  setColor(marker);
                  if (erasing) chooseMode("pen");
                }}
                className={`${option} w-8`}
              >
                <span className="h-5 w-5 rounded-full ring-2 ring-white" style={{ background: marker }} aria-hidden="true" />
              </button>
            ))}
          </div>
          {mode === "text" ? (
            <div role="group" aria-label="Text size" className="flex items-center gap-1 rounded-xl bg-[#f1f2f4] p-1.5">
              {NOTE_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  aria-label={`${NOTE_SIZE_NAMES[size]} text`}
                  aria-pressed={noteSize === size}
                  disabled={!fits(draft?.text ?? "", size)}
                  onClick={() => setNoteSize(size)}
                  className={`${option} w-9 font-semibold leading-none`}
                >
                  <span style={{ fontSize: 9 + size / 7 }} aria-hidden="true">
                    A
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div role="group" aria-label="Line width" className="flex items-center gap-1 rounded-xl bg-[#f1f2f4] p-1.5">
              {WIDTHS.map(({ width, name }) => (
                <button
                  key={width}
                  type="button"
                  aria-label={`${name} line`}
                  aria-pressed={!erasing && lineWidth === width}
                  disabled={erasing}
                  onClick={() => setLineWidth(width)}
                  className={`${option} w-9`}
                >
                  <span className="block w-5 rounded-full bg-[#12151c]" style={{ height: Math.max(2, width / 2) }} aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={undo} disabled={!mineToUndo} className={secondary} title="Undo your last stroke (Ctrl+Z)">
              <Undo2 size={15} aria-hidden="true" /> Undo
            </button>
            <button
              type="button"
              onClick={() => {
                if (!confirmWipe) return setConfirmWipe(true);
                setConfirmWipe(false);
                send?.({ action: "wipe", board: board.id });
              }}
              disabled={!strokes?.length}
              className={`${secondary} ${confirmWipe ? "border-[#e2b4b0] bg-[#fbe9e7] text-[#8f2f2b] hover:bg-[#f8dcd8]" : ""}`}
            >
              <Trash2 size={15} aria-hidden="true" /> {confirmWipe ? "Tap again to wipe" : "Wipe board"}
            </button>
          </div>
        </div>

        {/* The board: white enamel in an aluminium frame, with the marker tray underneath. */}
        <div className="rounded-[14px] bg-gradient-to-b from-[#d9dde3] to-[#b9bfc8] p-2 shadow-[0_10px_24px_-14px_rgba(18,21,28,0.45)]">
          {/* A size container: board units become cqw (1000 units = 100cqw), so the typing box lines up with the canvas. */}
          <div className="@container relative overflow-hidden rounded-md ring-1 ring-black/10">
            <canvas
              ref={canvasRef}
              aria-label={`Whiteboard drawing in ${board.label}. Draw with the mouse, a finger or a pen, or pick Text to type on it.`}
              role="img"
              className={`block aspect-[5/3] w-full touch-none select-none ${strokes ? (mode === "text" ? "cursor-text" : erasing ? "cursor-cell" : "cursor-crosshair") : ""}`}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={finish}
              onPointerCancel={finish}
              onLostPointerCapture={finish}
              // In text mode a press keeps focus in the note being typed; the click then places the next one.
              onMouseDown={(event) => {
                if (mode === "text") event.preventDefault();
              }}
              onClick={place}
            />
            {draft && view && (
              <textarea
                ref={noteBoxRef}
                aria-label="Note for the board. Enter puts it up, Shift+Enter starts a new line, Escape drops it."
                value={draft.text}
                placeholder={NOTE_PLACEHOLDER}
                maxLength={NOTE_TEXT_MAX}
                autoComplete="off"
                enterKeyHint="done"
                onChange={(event) => {
                  const text = event.target.value;
                  // A note stops growing once it would run off the bottom of the board.
                  if (fits(text, noteSize)) setDraft({ ...draft, text });
                }}
                onKeyDown={noteKeyDown}
                // Clicking elsewhere puts the note up; switching to another window doesn't.
                onBlur={() => {
                  if (document.hasFocus()) finishNote();
                }}
                className="absolute m-0 resize-none overflow-hidden whitespace-pre-wrap break-words border-0 bg-transparent p-0 font-semibold tracking-normal outline-dashed outline-[1.5px] outline-offset-4 outline-[#3a6ee8]/70 placeholder:text-[#a3a8b2]"
                style={{
                  left: `${view.at[0] / 10}cqw`,
                  top: `${view.at[1] / 10}cqw`,
                  width: `${Math.min(view.maxWidth, view.width + noteSize * 0.6) / 10}cqw`,
                  height: `${(view.lines.length * noteSize * NOTE_LINE_HEIGHT) / 10}cqw`,
                  fontSize: `${noteSize / 10}cqw`,
                  lineHeight: NOTE_LINE_HEIGHT,
                  color,
                }}
              />
            )}
            {!strokes && (
              <div className="absolute inset-0 grid place-items-center bg-[#fbfbf9]" role="status">
                <span className={`text-sm ${muted}`}>Loading the board…</span>
              </div>
            )}
            {strokes && strokes.length === 0 && pending.length === 0 && !draft && (
              <p className={`pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm ${muted}`}>
                A clean board. Draw with a marker, or pick Text and click to type.
              </p>
            )}
            {strokes && mode === "text" && !draft && (strokes.length > 0 || pending.length > 0) && (
              <p className="pointer-events-none absolute bottom-2 left-2 rounded-lg bg-white/90 px-2 py-1 text-xs font-medium text-[#3b4150] shadow-[0_1px_2px_rgba(18,21,28,0.14)]">
                Click anywhere on the board to type
              </p>
            )}
          </div>
          {notes.length > 0 && (
            <ul className="sr-only" aria-label="Writing on the board">
              {notes.map((note) => (
                <li key={note.id}>{note.text}</li>
              ))}
            </ul>
          )}
          <div className="mx-auto mt-1.5 h-1.5 w-2/3 rounded-full bg-[#a9b0ba]" aria-hidden="true" />
        </div>
      </div>
    </WorkplaceDialog>
  );
}
