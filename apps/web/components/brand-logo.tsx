// Clario wordmark: a pixel "C" with one presence pixel inside, plus the name in the pixel font.
const MARK = [
  "..#####..",
  ".#######.",
  "###...###",
  "##.......",
  "##.....#.",
  "##.......",
  "###...###",
  ".#######.",
  "..#####..",
];

const MARK_PIXELS = MARK.flatMap((row, y) =>
  Array.from(row).flatMap((cell, x) => (cell === "#" ? [{ x: x + 3, y: y + 3 }] : [])),
);

export function BrandMark({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 15 15"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="15" height="15" rx="3.5" fill="#3a6ee8" />
      <g fill="#ffffff">
        {MARK_PIXELS.map(({ x, y }) => (
          <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />
        ))}
      </g>
    </svg>
  );
}

export function BrandLogo({ markSize = 24, className = "" }: { markSize?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <BrandMark size={markSize} />
      <span className="font-[family-name:var(--font-pixel)] font-semibold leading-none tracking-[-0.01em]" translate="no">
        Clario
      </span>
    </span>
  );
}
