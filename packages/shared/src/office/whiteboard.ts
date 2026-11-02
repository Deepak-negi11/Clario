import * as z from "zod";

// A whiteboard anyone in the space can draw on together. Each board in the map keeps its strokes
// (saved by the server), so the drawing is still there next time. Points are whole numbers on a
// 1000 x 600 board, whatever size the screen shows it at, so everyone's strokes line up.

export const BOARD_W = 1000;
export const BOARD_H = 600;
// Marker colours: black, red, blue, green, orange. The eraser draws in the board's white.
export const MARKERS = ["#1f2430", "#c8372d", "#2563c9", "#2e8550", "#d97a0b"] as const;
export const ERASER = "eraser";
export const STROKE_POINTS_MAX = 400;
export const BOARD_STROKES_MAX = 600;
export const STROKE_WIDTHS = [3, 6, 12, 28] as const;

// A board's id: where it stands on the map ("12,7"), so each whiteboard has its own drawing.
export const BoardIdSchema = z.string().regex(/^\d{1,3},\d{1,3}$/);

const Point = z.tuple([z.number().int().min(0).max(BOARD_W), z.number().int().min(0).max(BOARD_H)]);
const ItemId = z.string().min(1).max(32);

// Typed notes: their sizes (the letters' height in board units), how long one can be, and the line
// spacing (a share of the size), the same on the board's canvas and in the box you type in.
export const NOTE_SIZES = [24, 36, 56] as const;
export const NOTE_TEXT_MAX = 300;
export const NOTE_LINES_MAX = 16;
export const NOTE_LINE_HEIGHT = 1.25;
// Board units kept clear between a note and the board's edges.
export const NOTE_MARGIN = 12;

// A line drawn with a marker (or the eraser).
export const LineSchema = z.object({
  id: ItemId,
  color: z.union([z.enum(MARKERS), z.literal(ERASER)]),
  width: z.union([z.literal(3), z.literal(6), z.literal(12), z.literal(28)]),
  points: z.array(Point).min(1).max(STROKE_POINTS_MAX),
});

// Words typed on the board. `at` is the top-left corner of the first line; the text is already
// broken into lines ("\n"), so everyone sees the same lines whatever their screen.
export const NoteSchema = z.object({
  id: ItemId,
  kind: z.literal("text"),
  color: z.enum(MARKERS),
  size: z.union([z.literal(24), z.literal(36), z.literal(56)]),
  at: Point,
  text: z
    .string()
    .max(NOTE_TEXT_MAX)
    .refine((text) => text.trim().length > 0 && text.split("\n").length <= NOTE_LINES_MAX, "Write something, in at most 16 lines"),
});

// Everything on a board, kept in the order it was added: marker lines and typed notes. Older
// boards hold only lines, which have no `kind`.
export const StrokeSchema = z.union([NoteSchema, LineSchema]);
export type Line = z.infer<typeof LineSchema>;
export type Note = z.infer<typeof NoteSchema>;
export type Stroke = Line | Note;

// What the server keeps: the stroke and who drew it (so "undo" only takes back your own).
export type SavedStroke = Stroke & { by: string };

export const isNote = <T extends Stroke>(stroke: T): stroke is Extract<T, Note> => "kind" in stroke && stroke.kind === "text";

// How many lines of a note of this size fit on the board.
export const noteLinesMax = (size: Note["size"]) =>
  Math.min(NOTE_LINES_MAX, Math.floor((BOARD_H - NOTE_MARGIN * 2) / (size * NOTE_LINE_HEIGHT)));

// Breaks typed text into lines no wider than `maxWidth` (board units, measured by `measure`): at
// the line breaks typed, then between words; a word too long for a line is split letter by letter.
export function wrapNote(text: string, maxWidth: number, measure: (text: string) => number): string[] {
  const lines: string[] = [];
  for (const typed of text.replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    for (const word of typed.split(/(?<=\s)/)) {
      if (measure(line + word.trimEnd()) <= maxWidth || !line.trim()) {
        line += word;
      } else {
        lines.push(line.trimEnd());
        line = word;
      }
      // A single word wider than the line.
      while (measure(line.trimEnd()) > maxWidth && line.trimEnd().length > 1) {
        let fit = line.length - 1;
        while (fit > 1 && measure(line.slice(0, fit)) > maxWidth) fit--;
        lines.push(line.slice(0, fit));
        line = line.slice(fit);
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

// Where a note of this size goes when it is started at `at`: moved in from the right and bottom
// edges so it stays on the board, and how wide its lines may be from there.
export function placeNote(at: readonly [number, number], size: Note["size"], lineCount = 1, minWidth = size * 8) {
  const height = Math.ceil(lineCount * size * NOTE_LINE_HEIGHT);
  const x = Math.max(NOTE_MARGIN, Math.min(Math.round(at[0]), BOARD_W - NOTE_MARGIN - minWidth));
  const y = Math.max(NOTE_MARGIN, Math.min(Math.round(at[1]), BOARD_H - NOTE_MARGIN - height));
  return { at: [x, y] as [number, number], maxWidth: BOARD_W - NOTE_MARGIN - x };
}

export const boardIdOf = (item: { x: number; y: number }) => `${item.x},${item.y}`;

// Turns a pointer position on the board as drawn (0..1 each way) into board points, dropping a
// point when it's too close to the last one to matter.
export function addPoint(points: [number, number][], u: number, v: number, minGap = 3): boolean {
  const x = Math.round(Math.min(1, Math.max(0, u)) * BOARD_W);
  const y = Math.round(Math.min(1, Math.max(0, v)) * BOARD_H);
  const last = points.at(-1);
  if (last && Math.hypot(last[0] - x, last[1] - y) < minGap) return false;
  if (points.length >= STROKE_POINTS_MAX) return false;
  points.push([x, y]);
  return true;
}

// A board's strokes once a new one is added: the oldest go once there are too many.
export function withStroke(strokes: readonly SavedStroke[], stroke: SavedStroke) {
  const next = [...strokes.filter((each) => each.id !== stroke.id), stroke];
  return next.length > BOARD_STROKES_MAX ? next.slice(next.length - BOARD_STROKES_MAX) : next;
}

// The id of `userId`'s most recent stroke, for undo.
export function lastStrokeBy(strokes: readonly SavedStroke[], userId: string) {
  for (let index = strokes.length - 1; index >= 0; index--) if (strokes[index]!.by === userId) return strokes[index]!.id;
  return null;
}
