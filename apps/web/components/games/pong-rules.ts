// The rules of a game of table tennis singles, kept apart from the drawing so they can be tested.
//
// Scoring: first to 11, win by 2. Each player serves two points in a row; from 10-all (deuce) the
// serve changes after every point.
//
// The rally: a serve must bounce once on the server's own half, then once on the receiver's. After
// that, each return must clear the net and land on the other half. A ball that lands on your half
// must be hit before it bounces again; a ball that hits the floor without landing on the right half
// is out. A serve that touches the net and is otherwise good is a let: it's served again.

export type Side = 0 | 1;
export type Points = readonly [number, number];

export const POINTS_TO_WIN = 11;

export const other = (side: Side): Side => (side === 0 ? 1 : 0);

export function isDeuce([a, b]: Points) {
  return a >= POINTS_TO_WIN - 1 && b >= POINTS_TO_WIN - 1 && a === b;
}

// The winner once someone has 11 or more and leads by 2.
export function winnerOf([a, b]: Points): Side | null {
  if (Math.max(a, b) < POINTS_TO_WIN || Math.abs(a - b) < 2) return null;
  return a > b ? 0 : 1;
}

// Who serves the next point: two serves each, then one each from 10-all.
export function serverAt(points: Points, first: Side): Side {
  const [a, b] = points;
  const played = a + b;
  const deuceOn = a >= POINTS_TO_WIN - 1 && b >= POINTS_TO_WIN - 1;
  // Ten turns of two take the score to 10-all; after that every point is a turn.
  const turns = deuceOn ? played - (POINTS_TO_WIN - 1) : Math.floor(played / 2);
  return turns % 2 === 0 ? first : other(first);
}

// The player one point away from winning, if there is one.
export function matchPointFor(points: Points): Side | null {
  if (winnerOf(points) !== null) return null;
  for (const side of [0, 1] as const) {
    const next: [number, number] = [points[0], points[1]];
    next[side]++;
    if (winnerOf(next) === side) return side;
  }
  return null;
}

// What the umpire says after a point: "Deuce", "Match point Red", or nothing.
export function scoreCall(points: Points, names: readonly [string, string]): string | null {
  if (isDeuce(points)) return "Deuce";
  const side = matchPointFor(points);
  if (side === null) return null;
  return names[side] === "You" ? "Match point to you" : `Match point ${names[side]}`;
}

// ---------------------------------------------------------------------------------------------
// The referee: follows one rally and calls it.

export type Rally = {
  hitter: Side;
  serve: boolean;
  // A serve has bounced on the server's own half.
  ownBounce: boolean;
  // Bounces on the receiver's half since the last hit.
  farBounces: number;
  // The ball touched the net since the last hit.
  net: boolean;
};

// Why a point ended, for the line the players see.
export type PointReason = "fault" | "net" | "out" | "missed";

export type Call =
  | { kind: "play"; rally: Rally }
  | { kind: "point"; winner: Side; reason: PointReason }
  | { kind: "let" };

export function serveRally(server: Side): Rally {
  return { hitter: server, serve: true, ownBounce: false, farBounces: 0, net: false };
}

const point = (rally: Rally, winner: Side, reason: PointReason): Call => ({ kind: "point", winner, reason });

// The ball bounced on the table, on `side`'s half.
export function bounce(rally: Rally, side: Side): Call {
  const { hitter } = rally;
  const receiver = other(hitter);
  if (rally.serve && !rally.ownBounce) {
    // A serve must touch the server's own half first.
    if (side === hitter) return { kind: "play", rally: { ...rally, ownBounce: true } };
    return point(rally, receiver, "fault");
  }
  if (side === hitter) {
    // Back on the hitter's own half: the serve bounced twice there, or a return fell back off the net.
    return point(rally, receiver, rally.serve ? "fault" : rally.net ? "net" : "out");
  }
  if (rally.farBounces === 0) {
    // A good serve that touched the net on the way is a let.
    if (rally.serve && rally.net) return { kind: "let" };
    return { kind: "play", rally: { ...rally, farBounces: 1 } };
  }
  // Bounced twice on the receiver's half: they didn't get to it.
  return point(rally, hitter, "missed");
}

export function touchNet(rally: Rally): Rally {
  return { ...rally, net: true };
}

// The ball reached the floor: a good ball the receiver missed, or one that never landed in.
export function reachFloor(rally: Rally): Call {
  const landed = rally.farBounces > 0 && (!rally.serve || rally.ownBounce);
  if (landed) return point(rally, rally.hitter, "missed");
  const receiver = other(rally.hitter);
  return point(rally, receiver, rally.net ? "net" : rally.serve ? "fault" : "out");
}

// Whether `seat` may hit the ball now: it's coming to them and has bounced once on their half.
export function canReturn(rally: Rally, seat: Side) {
  return seat !== rally.hitter && rally.farBounces === 1 && (!rally.serve || rally.ownBounce);
}

export function returned(seat: Side): Rally {
  return { hitter: seat, serve: false, ownBounce: false, farBounces: 0, net: false };
}

// ---------------------------------------------------------------------------------------------
// Shot shapes. A shot is the arc through three points: where the ball is hit, how high it crosses
// the net, and where it lands. Gravity fixes how fast it must travel for that arc.

export type Arc = { vx: number; vz: number; time: number };

// From (x0, z0) over (xNet, zNet) to (x1, z1), heights above the table. Returns the horizontal and
// vertical speed and the flight time, or null when no arc under gravity passes through all three
// (the net point sits below the straight line from start to landing). `maxSpeed` caps how flat a
// shot may be: a lower net point is raised until the arc is possible at that speed.
export function solveArc(x0: number, z0: number, xNet: number, zNet: number, x1: number, z1: number, gravity: number, maxSpeed = Infinity): Arc | null {
  if ((xNet - x0) * (x1 - xNet) <= 0) return null;
  // z(x) = a x² + b x + c through the three points (Lagrange form). Only `a` and the slope at x0 matter.
  const d0 = (x0 - xNet) * (x0 - x1);
  const dn = (xNet - x0) * (xNet - x1);
  const d1 = (x1 - x0) * (x1 - xNet);
  // The flattest the arc may be: a = -g / (2 v²) at the top speed.
  const flattest = -gravity / (2 * maxSpeed * maxSpeed);
  const coefficient = (zn: number) => z0 / d0 + zn / dn + z1 / d1;
  let zn = zNet;
  // dn < 0 (the net is between the ends), so raising the net point bends the arc down.
  if (coefficient(zn) > flattest) zn = (flattest - z0 / d0 - z1 / d1) * dn;
  const a = coefficient(zn);
  if (!(a < 0)) return null;
  const b = -(z0 * (xNet + x1)) / d0 - (zn * (x0 + x1)) / dn - (z1 * (x0 + xNet)) / d1;
  const speed = Math.sqrt(-gravity / (2 * a));
  const dir = Math.sign(x1 - x0);
  const slope = 2 * a * x0 + b; // dz/dx at the start
  return { vx: dir * speed, vz: slope * speed * dir, time: Math.abs(x1 - x0) / speed };
}
