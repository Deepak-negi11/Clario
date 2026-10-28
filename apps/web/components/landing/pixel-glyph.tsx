import type { CSSProperties } from "react";
import styles from "../../app/landing.module.css";

// "#" = solid pixel, "+" = dithered (half-tone) pixel, "." = empty.
const GLYPHS = {
  pin: [
    "....#####....",
    "..#########..",
    ".####...####.",
    ".###.....###.",
    "###...#...###",
    "###..###..###",
    "###...#...###",
    ".###.....###.",
    ".####...####.",
    "..####.####..",
    "...#######...",
    "....#####....",
    ".....###.....",
    "......#......",
    ".............",
    "..+++++++++..",
  ],
  voice: [
    "......#.........",
    ".....##....#....",
    "....###.....#...",
    "###.###..#...#..",
    "#######...#..#..",
    "#######...#...#.",
    "#######...#...#.",
    "#######...#...#.",
    "#######...#..#..",
    "###.###..#...#..",
    "....###.....#...",
    ".....##....#....",
    "......#.........",
  ],
  clock: [
    ".....#####.....",
    "...##+++++##...",
    "..#+.......+#..",
    ".#+....#....+#.",
    ".#.....#.....#.",
    "#+.....#.....+#",
    "#......#......#",
    "#......####...#",
    "#.............#",
    "#+...........+#",
    ".#...........#.",
    ".#+.........+#.",
    "..#+.......+#..",
    "...##+++++##...",
    ".....#####.....",
  ],
  chat: [
    ".#############.",
    "###############",
    "##...........##",
    "##.#########.##",
    "##...........##",
    "##.######....##",
    "##...........##",
    "###############",
    ".#############.",
    "...###.........",
    "...##..........",
    "...#...........",
  ],
  avatar: [
    "....#####....",
    "...#######...",
    "...##.#.##...",
    "...#######...",
    "...##...##...",
    "....#####....",
    ".............",
    "..#########..",
    ".###########.",
    "#############",
    "#############",
    "+++++++++++++",
  ],
  spark: [
    ".....#.....",
    ".....#.....",
    "....+#+....",
    "...+###+...",
    ".++#####++.",
    "###########",
    ".++#####++.",
    "...+###+...",
    "....+#+....",
    ".....#.....",
    ".....#.....",
  ],
} as const;

export type GlyphName = keyof typeof GLYPHS;

// 4x4 Bayer matrix: gives each pixel a stable, evenly spread shimmer offset.
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;

type PixelGlyphProps = {
  name: GlyphName;
  size?: number;
  shimmer?: boolean;
  className?: string;
};

export function PixelGlyph({ name, size = 48, shimmer = true, className = "" }: PixelGlyphProps) {
  const rows = GLYPHS[name];
  const width = rows[0]!.length;
  const height = rows.length;
  const pixelSize = size / Math.max(width, height);

  return (
    <svg
      className={`${styles.glyph} ${shimmer ? styles.glyphShimmer : ""} ${className}`}
      width={width * pixelSize}
      height={height * pixelSize}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {rows.flatMap((row, y) =>
        Array.from(row).map((cell, x) => {
          if (cell === ".") return null;
          const delay = BAYER[y % 4]![x % 4]! / 16 + (x + y) * 0.035;
          return (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width={1}
              height={1}
              className={cell === "+" ? styles.glyphDither : undefined}
              style={{ "--pixel-delay": `${delay.toFixed(3)}s` } as CSSProperties}
            />
          );
        }),
      )}
    </svg>
  );
}
