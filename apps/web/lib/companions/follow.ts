import type { PathGrid, Tile } from "../maps/path-finder";
import { spotFront, type PlaySpot } from "../maps/play-spots";

// Where Maya or an AI coworker goes when they walk or play with you in the 3D view. They walk the
// same tiles you do (the 2D map's blocked tiles), so never through a wall or a desk.

const SIDES = [[0, 1], [-1, 0], [1, 0], [0, -1]] as const;
const CORNERS = [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const;

// Steps from `from` to every tile, walking the 4-way grid like findPath; -1 where it can't get to.
export function stepsFrom(from: Tile, { cols, rows, isBlocked }: PathGrid) {
  const steps = new Int32Array(cols * rows).fill(-1);
  if (from.x < 0 || from.y < 0 || from.x >= cols || from.y >= rows) return steps;
  steps[from.y * cols + from.x] = 0;
  const queue = [from.y * cols + from.x];
  for (let i = 0; i < queue.length; i++) {
    const tile = queue[i]!;
    const x = tile % cols;
    const y = Math.floor(tile / cols);
    for (const [dx, dy] of SIDES) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || isBlocked(nx, ny)) continue;
      const next = ny * cols + nx;
      if (steps[next] !== -1) continue;
      steps[next] = steps[tile]! + 1;
      queue.push(next);
    }
  }
  return steps;
}

// Scores compare item by item, the first difference deciding.
const compare = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return 0;
};

// The tile to stand on next to `leader`: free (not blocked and not in `taken`), and one `from` can
// walk to. The lowest `rank` comes first (beside you at a game, say), then the one fewest steps
// away, so someone already beside you stays put and someone behind you doesn't walk round you; a
// side beats a corner on a tie. Null when no tile next to the leader can be reached.
export function chooseFollowTile({
  leader,
  from,
  grid,
  taken = new Set(),
  rank,
}: {
  leader: Tile;
  from: Tile;
  grid: PathGrid;
  taken?: ReadonlySet<string>;
  rank?: (tile: Tile) => number;
}): Tile | null {
  const steps = stepsFrom(from, grid);
  let best: { tile: Tile; score: number[] } | null = null;
  for (const [index, [dx, dy]] of [...SIDES, ...CORNERS].entries()) {
    const tile = { x: leader.x + dx, y: leader.y + dy };
    if (tile.x < 0 || tile.y < 0 || tile.x >= grid.cols || tile.y >= grid.rows) continue;
    if (grid.isBlocked(tile.x, tile.y) || taken.has(`${tile.x},${tile.y}`)) continue;
    const walk = steps[tile.y * grid.cols + tile.x]!;
    if (walk < 0) continue;
    const score = [rank?.(tile) ?? 0, walk, index < SIDES.length ? 0 : 1];
    if (!best || compare(score, best.score) < 0) best = { tile, score };
  }
  return best?.tile ?? null;
}

// The game nearest to you by walking (not as the crow flies, through walls): the one whose front
// tile (where you stand to use it) takes fewest steps. TVs aren't games. Null when none can be reached.
export function nearestGame(from: Tile, spots: PlaySpot[], grid: PathGrid): PlaySpot | null {
  const steps = stepsFrom(from, grid);
  let best: { spot: PlaySpot; walk: number } | null = null;
  for (const spot of spots) {
    if (spot.action.kind !== "game") continue;
    const front = spotFront(spot);
    if (front.x < 0 || front.y < 0 || front.x >= grid.cols || front.y >= grid.rows) continue;
    const walk = steps[front.y * grid.cols + front.x]!;
    if (walk >= 0 && (!best || walk < best.walk)) best = { spot, walk };
  }
  return best?.spot ?? null;
}
