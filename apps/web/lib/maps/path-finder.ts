// Tile paths for click-to-walk (the 2D map, and the 3D view through the same scene): A* on the
// 4-way grid. Every step costs 1 and a turn adds a tiny cost, so of all the shortest paths it
// takes the one with the fewest turns (straight runs, not a staircase) and never a longer one.
// When the goal can't be reached it walks to a reachable tile near the click. Clicking a wall
// trades closeness against walking (a tile one step nearer is worth up to three more steps), so
// you stop on your side of it instead of being sent all the way round to the far side. Clicking
// furniture, or a spot you can't get into, takes you to the nearest tile to it however far round
// that is, since that's where you meant to go.

export type Tile = { x: number; y: number };

export type PathGrid = {
  cols: number;
  rows: number;
  isBlocked: (x: number, y: number) => boolean;
  // Walls among the blocked tiles (the rest is furniture). Without it every blocked tile is a wall.
  isWall?: (x: number, y: number) => boolean;
};

const TURN = 0.001; // under 1 for any path with fewer than 1000 turns, so length always wins
const CLOSER_IS_WORTH = 3; // steps of walking worth one tile nearer a clicked wall
const NEAREST_FIRST = 10000; // anything else: nearness always wins, walking only breaks ties
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const NO_DIR = 4; // the start, before any step

// A binary min-heap of search states, ordered by f, then by h (nearer the goal first).
class Open {
  private states: number[] = [];
  private f: number[] = [];
  private h: number[] = [];

  get size() {
    return this.states.length;
  }

  push(state: number, f: number, h: number) {
    this.states.push(state); this.f.push(f); this.h.push(h);
    let i = this.states.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.before(i, parent)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop() {
    const top = this.states[0]!;
    const last = this.states.length - 1;
    this.swap(0, last);
    this.states.pop(); this.f.pop(); this.h.pop();
    let i = 0;
    for (;;) {
      const left = i * 2 + 1;
      const right = left + 1;
      let first = i;
      if (left < this.states.length && this.before(left, first)) first = left;
      if (right < this.states.length && this.before(right, first)) first = right;
      if (first === i) break;
      this.swap(i, first);
      i = first;
    }
    return top;
  }

  private before(a: number, b: number) {
    return this.f[a]! < this.f[b]! || (this.f[a] === this.f[b] && this.h[a]! < this.h[b]!);
  }

  private swap(a: number, b: number) {
    [this.states[a], this.states[b]] = [this.states[b]!, this.states[a]!];
    [this.f[a], this.f[b]] = [this.f[b]!, this.f[a]!];
    [this.h[a], this.h[b]] = [this.h[b]!, this.h[a]!];
  }
}

// The tiles to step on, in order, not counting the start. Empty when there is nowhere better to go.
export function findPath(start: Tile, goal: Tile, { cols, rows, isBlocked, isWall = isBlocked }: PathGrid): Tile[] {
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows;
  const tiles = cols * rows;
  // A search state is a tile plus the direction you arrived from, so turns can be counted.
  const g = new Float64Array(tiles * 5).fill(Infinity);
  const parent = new Int32Array(tiles * 5).fill(-1);
  const closed = new Uint8Array(tiles * 5);
  const bestG = new Float64Array(tiles).fill(Infinity);
  const h = (x: number, y: number) => Math.abs(x - goal.x) + Math.abs(y - goal.y);

  const open = new Open();
  const first = (start.y * cols + start.x) * 5 + NO_DIR;
  g[first] = 0;
  open.push(first, h(start.x, start.y), h(start.x, start.y));

  let reached = -1;
  while (open.size) {
    const state = open.pop();
    if (closed[state]) continue;
    closed[state] = 1;
    const tile = Math.floor(state / 5);
    const dir = state % 5;
    const x = tile % cols;
    const y = Math.floor(tile / cols);
    if (g[state]! < bestG[tile]!) bestG[tile] = g[state]!;
    if (x === goal.x && y === goal.y) {
      reached = state;
      break;
    }
    DIRS.forEach(([dx, dy], next) => {
      const nx = x + dx;
      const ny = y + dy;
      if (!inside(nx, ny) || isBlocked(nx, ny)) return;
      const nextState = (ny * cols + nx) * 5 + next;
      if (closed[nextState]) return;
      const cost = g[state]! + 1 + (dir !== NO_DIR && dir !== next ? TURN : 0);
      if (cost >= g[nextState]!) return;
      g[nextState] = cost;
      parent[nextState] = state;
      open.push(nextState, cost + h(nx, ny), h(nx, ny));
    });
  }

  if (reached < 0) {
    // Unreachable: the whole reachable area has been searched. Take the tile that best trades
    // closeness to the click against the walk there.
    const weight = inside(goal.x, goal.y) && isWall(goal.x, goal.y) ? CLOSER_IS_WORTH : NEAREST_FIRST;
    const score = (tile: number) => weight * h(tile % cols, Math.floor(tile / cols)) + bestG[tile]!;
    let target = -1;
    for (let tile = 0; tile < tiles; tile++) {
      if (bestG[tile]! === Infinity) continue;
      if (target < 0 || score(tile) < score(target)) target = tile;
    }
    if (target < 0 || target === start.y * cols + start.x) return [];
    for (let dir = 0; dir < 5; dir++) {
      const state = target * 5 + dir;
      if (closed[state] && g[state] === bestG[target]) {
        reached = state;
        break;
      }
    }
  }

  const path: Tile[] = [];
  for (let state = reached; state >= 0 && state !== first; state = parent[state]!) {
    const tile = Math.floor(state / 5);
    path.push({ x: tile % cols, y: Math.floor(tile / cols) });
  }
  return path.reverse();
}
