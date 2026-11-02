import { ITEM_SPECS, type CustomMapItem } from "@repo/shared";

// The front-door badge readers and the team notice board among a map's items (any map can have
// them; see badge-reader-spot.ts and notice-board-spot.ts for maps that don't).

export type OfficeObject = { kind: "badge" | "notice"; x: number; y: number; w: number; h: number };

export function officeObjectsFor(items: readonly CustomMapItem[]): OfficeObject[] {
  return items.flatMap((item): OfficeObject[] => {
    const kind = item.kind === "badge-reader" ? "badge" : item.kind === "notice-board" ? "notice" : null;
    return kind ? [{ kind, x: item.x, y: item.y, w: ITEM_SPECS[item.kind].w, h: ITEM_SPECS[item.kind].h }] : [];
  });
}

// Next to a rectangle of tiles (diagonals count): where you can use it.
export function besideObject(object: OfficeObject, x: number, y: number) {
  const dx = Math.max(object.x - x, 0, x - (object.x + object.w - 1));
  const dy = Math.max(object.y - y, 0, y - (object.y + object.h - 1));
  return Math.max(dx, dy) === 1;
}
