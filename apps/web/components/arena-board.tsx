"use client";

import { cn } from "@repo/ui/cn";
import type { Others, Position } from "../hooks/use-space-socket";

const TILE = 40;

function initial(id: string) {
  return id.charAt(0).toUpperCase();
}

function Avatar({
  x,
  y,
  label,
  isSelf,
}: {
  x: number;
  y: number;
  label: string;
  isSelf: boolean;
}) {
  return (
    <div
      className={cn(
        "absolute flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-all duration-150",
        isSelf
          ? "z-10 bg-indigo-500 text-white ring-2 ring-indigo-300"
          : "bg-neutral-700 text-neutral-100",
      )}
      style={{ left: x * TILE + 2, top: y * TILE + 2 }}
    >
      {label}
    </div>
  );
}

export function ArenaBoard({
  selfId,
  self,
  others,
}: {
  selfId: string | null;
  self: Position;
  others: Others;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900"
      style={{
        width: 20 * TILE,
        height: 15 * TILE,
        backgroundSize: `${TILE}px ${TILE}px`,
        backgroundImage:
          "linear-gradient(to right, #262626 1px, transparent 1px), linear-gradient(to bottom, #262626 1px, transparent 1px)",
      }}
    >
      {Object.entries(others).map(([id, pos]) => (
        <Avatar key={id} x={pos.x} y={pos.y} label={initial(id)} isSelf={false} />
      ))}

      {selfId && <Avatar x={self.x} y={self.y} label={initial(selfId)} isSelf />}
    </div>
  );
}
