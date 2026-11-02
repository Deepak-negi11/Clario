export type Point = { x: number; y: number };
export const PROXIMITY_RADIUS = 6;

export function tileApart(a: Point, b: Point): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function isNearby(a: Point, b: Point, radius = PROXIMITY_RADIUS) {
  return tileApart(a, b) <= radius;
}

// Meeting seats can span more than the normal six-tile radius. Keep the whole meeting
// connected, while room boundaries keep a conversation out of the neighbouring office.
export function callPeers(
  self: Point,
  others: Record<string, Point>,
  roomAt: (point: Point) => { id: string; name: string } | null,
) {
  const room = roomAt(self);
  const meeting =
    !!room &&
    /meeting|conference|boardroom|stand.?up/i.test(`${room.id} ${room.name}`);
  return new Set(
    Object.entries(others)
      .filter(([, point]) => {
        const other = roomAt(point);
        if ((room?.id ?? null) !== (other?.id ?? null)) return false;
        return meeting || isNearby(self, point);
      })
      .map(([id]) => id),
  );
}
