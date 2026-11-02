import { ITEM_SPECS, type CustomMapItem } from "@repo/shared";

export type MicroSpot = {
  kind: "shelf" | "vending" | "rack" | "printer" | "server" | "coffee";
  x: number;
  y: number;
  w: number;
  h: number;
};
export function microSpotsFor(items: readonly CustomMapItem[]): MicroSpot[] {
  let rack = items.find(
    (item) => item.kind === "bike-rack" && item.variant === 1,
  );
  rack ??= items.find((item) => item.kind === "bike-rack");
  const vending = items.find((item) => item.kind === "vending-machine");
  return items.flatMap((item): MicroSpot[] => {
    const kind =
      item.kind === "office-printer"
        ? "printer"
        : item.kind === "server-rack"
          ? "server"
          : item === rack
            ? "rack"
            : item === vending
              ? "vending"
              : item.kind === "bookshelf" || item.kind === "cube-shelf"
                ? "shelf"
                : item.kind === "counter-coffee" || item.kind === "coffee-bar"
                  ? "coffee"
                  : null;
    return kind
      ? [
          {
            kind,
            x: item.x,
            y: item.y,
            w: ITEM_SPECS[item.kind].w,
            h: ITEM_SPECS[item.kind].h,
          },
        ]
      : [];
  });
}

export function microInReach(spot: MicroSpot, x: number, y: number) {
  const dx = Math.max(spot.x - x, 0, x - (spot.x + spot.w - 1));
  const dy = Math.max(spot.y - y, 0, y - (spot.y + spot.h - 1));
  return (
    Math.max(dx, dy) === 1 &&
    // Machines are used face on, from the row in front.
    ((spot.kind !== "vending" && spot.kind !== "coffee") || (y === spot.y + spot.h && dx === 0))
  );
}

export function nearestMicroSpot(
  spots: readonly MicroSpot[],
  x: number,
  y: number,
) {
  return (
    spots
      .filter((spot) => microInReach(spot, x, y))
      // Centre to centre, so the rack straight ahead beats the one at a diagonal.
      .sort(
        (a, b) =>
          Math.abs(a.x + a.w / 2 - x - 0.5) +
          Math.abs(a.y + a.h / 2 - y - 0.5) -
          Math.abs(b.x + b.w / 2 - x - 0.5) -
          Math.abs(b.y + b.h / 2 - y - 0.5),
      )[0] ?? null
  );
}

// Prefer the front, then a free side. The scene's path finder still decides how to get there.
export function microApproach(
  spot: MicroSpot,
  from: { x: number; y: number },
  blocked: Set<string>,
  cols: number,
  rows: number,
) {
  const candidates = [];
  for (let y = spot.y - 1; y <= spot.y + spot.h; y++)
    for (let x = spot.x - 1; x <= spot.x + spot.w; x++) {
      if (
        x < 0 ||
        y < 0 ||
        x >= cols ||
        y >= rows ||
        blocked.has(`${x},${y}`) ||
        !microInReach(spot, x, y)
      )
        continue;
      candidates.push({ x, y });
    }
  return (
    candidates.sort(
      (a, b) =>
        Math.abs(a.x - from.x) +
        Math.abs(a.y - from.y) +
        (a.y === spot.y + spot.h ? 0 : 0.25) -
        Math.abs(b.x - from.x) -
        Math.abs(b.y - from.y) -
        (b.y === spot.y + spot.h ? 0 : 0.25),
    )[0] ?? null
  );
}
