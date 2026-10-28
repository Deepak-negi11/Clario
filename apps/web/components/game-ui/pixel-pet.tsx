"use client";

// Pixel rendition of the Claude Code mascot as SVG, so cards can show it
// animating without Phaser. 14x12 grid, 1 unit = 1 pixel, crisp edges.
// running = scampering legs + bounce; idle = sleeping with closed eyes.
export function PixelPet({ running = false, size = 56 }: { running?: boolean; size?: number }) {
  const body = "#E8896B";
  const eye = "#141414";
  const dur = "0.24s";

  return (
    <svg
      width={size}
      height={(size / 14) * 12}
      viewBox="0 0 14 12"
      shapeRendering="crispEdges"
      aria-hidden="true"
      className="overflow-visible"
    >
      {/* body + ears, dips while running */}
      <g>
        {running && (
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 0; 0 1; 0 1; 0 0"
            dur={dur}
            repeatCount="indefinite"
          />
        )}
        <rect x={3} y={1} width={8} height={8} fill={body} />
        <rect x={0} y={3} width={3} height={3} fill={body} />
        <rect x={11} y={3} width={3} height={3} fill={body} />
        {running ? (
          <>
            <rect x={4} y={3} width={2} height={2} fill={eye} />
            <rect x={8} y={3} width={2} height={2} fill={eye} />
          </>
        ) : (
          <>
            <rect x={4} y={4.2} width={2} height={0.8} fill={eye} opacity={0.85} />
            <rect x={8} y={4.2} width={2} height={0.8} fill={eye} opacity={0.85} />
          </>
        )}
      </g>

      {/* running legs: two pre-drawn phases fading into each other */}
      {running ? (
        <>
          <g>
            <rect x={4} y={9} width={1} height={3} fill={body} />
            <rect x={8} y={9} width={1} height={3} fill={body} />
            <rect x={6} y={9} width={1} height={2} fill={body} />
            <rect x={10} y={9} width={1} height={2} fill={body} />
            <animate attributeName="opacity" values="1;0;1" dur={dur} repeatCount="indefinite" />
          </g>
          <g>
            <rect x={4} y={9} width={1} height={2} fill={body} />
            <rect x={8} y={9} width={1} height={2} fill={body} />
            <rect x={6} y={9} width={1} height={3} fill={body} />
            <rect x={10} y={9} width={1} height={3} fill={body} />
            <animate attributeName="opacity" values="0;1;0" dur={dur} repeatCount="indefinite" />
          </g>
        </>
      ) : (
        <g>
          <rect x={4} y={9} width={1} height={3} fill={body} />
          <rect x={6} y={9} width={1} height={3} fill={body} />
          <rect x={8} y={9} width={1} height={3} fill={body} />
          <rect x={10} y={9} width={1} height={3} fill={body} />
        </g>
      )}

      {!running && (
        <text x={11.6} y={2.6} fontSize={2.4} fill="#94a3b8" fontFamily="monospace">
          z
        </text>
      )}
    </svg>
  );
}
