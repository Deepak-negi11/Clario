import * as THREE from "three";
import { chooseFollowTile, nearestGame } from "../../lib/companions/follow";
import { companions, type CompanionMode, type TalkerId } from "../../lib/companions/store";
import { findPath, type PathGrid, type Tile } from "../../lib/maps/path-finder";
import { spotFront, spotInReach, type PlayAction, type PlaySpot } from "../../lib/maps/play-spots";
import type { Person } from "./people";

// Maya and the AI coworkers in the 3D view. They stand where the 2D map has them and turn to you
// when you come up. Asked from their talk panel (lib/companions/store.ts) they walk with you, or
// go with you to the nearest game and play beside you, and walk back to their spot when you say
// stop. They walk the 2D map's tiles a tile at a time, never through a wall, a desk or a chair.

const WALK_SPEED = 5.5; // tiles a second, a little quicker than you so they keep up
// Standing still this long anywhere but the game you were walking to means you went elsewhere.
const GAVE_UP = 1.5;

export type Talker = {
  id: TalkerId;
  home: Tile;
  // The tile they are on, or stepping off.
  x: number;
  y: number;
  person: Person;
  group: THREE.Group;
  label: THREE.Sprite;
  // Tiles still to walk, in order.
  path: Tile[];
  mode: CompanionMode | null;
  // What they last worked out where to go for: you on a tile ("x,y"), or "home".
  plannedFor: string | null;
  heading: number;
  // How far into the walk and play poses they are (0 to 1).
  walk: number;
  play: number;
  lastMoved: number;
};

export function makeTalker(id: TalkerId, home: Tile, person: Person, group: THREE.Group, label: THREE.Sprite): Talker {
  group.position.set(home.x + 0.5, 0, home.y + 0.5);
  return { id, home, x: home.x, y: home.y, person, group, label, path: [], mode: null, plannedFor: null, heading: 0, walk: 0, play: 0, lastMoved: -1 };
}

export type TalkerFrame = {
  dt: number;
  time: number;
  self: Tile | null;
  // Other players, so nobody is asked to stand on them.
  others: Tile[];
  // The 2D map's walls and blocked tiles ("x,y") and its size; null before the map is known.
  blocked: ReadonlySet<string> | null;
  cols: number;
  rows: number;
  seats: ReadonlyMap<string, unknown>;
};

const key = (tile: Tile) => `${tile.x},${tile.y}`;
const blend = (value: number, goal: number, rate: number, dt: number) => value + (goal - value) * (1 - Math.exp(-dt * rate));

// Moves everyone each frame. `walkTo` walks you along the 2D map's path; `play` opens a game the
// way using it yourself does.
export function createTalkerMover({ spots, walkTo, play }: { spots: PlaySpot[]; walkTo: (x: number, y: number) => void; play: (action: PlayAction) => void }) {
  // The game you are walking to (or at) with someone, and whether it has been opened.
  let outing: { spot: PlaySpot; opened: boolean } | null = null;
  let lastSelf = "";
  let stillSince = 0;
  const toward = new THREE.Vector3();

  return (talkers: Talker[], { dt, time, self, others, blocked, cols, rows, seats }: TalkerFrame) => {
    const selfKey = self ? key(self) : "";
    if (selfKey !== lastSelf) {
      lastSelf = selfKey;
      stillSince = time;
    }

    // Where you can walk, and where they can: they keep off chairs too, and a talker's own spot
    // (blocked on the 2D map while they stand on it) is free while they are away from it.
    const yourGrid: PathGrid | null = blocked && { cols, rows, isBlocked: (x, y) => blocked.has(`${x},${y}`) };
    const gridFor = (talker: Talker): PathGrid | null => blocked && {
      cols,
      rows,
      isBlocked: (x, y) => {
        const tile = `${x},${y}`;
        if (seats.has(tile)) return true;
        if (!blocked.has(tile)) return false;
        return !talkers.some((other) => other.home.x === x && other.home.y === y && (other === talker || other.x !== x || other.y !== y));
      },
    };
    const goWith = (talker: Talker, mode: CompanionMode) => {
      companions.set(talker.id, mode);
      talker.mode = mode;
    };

    // New requests from the talk panels.
    const { modes } = companions.get();
    for (const talker of talkers) {
      const mode = modes[talker.id] ?? null;
      if (mode === talker.mode) continue;
      talker.mode = mode;
      talker.plannedFor = null;
      if (mode !== "play") continue;
      const spot = outing?.spot ?? (self && yourGrid ? nearestGame(self, spots, yourGrid) : null);
      // Nothing to play that you can get to: they walk with you instead.
      if (!spot) goWith(talker, "follow");
      else if (!outing) {
        outing = { spot, opened: false };
        stillSince = time;
        const front = spotFront(spot);
        walkTo(front.x, front.y);
      }
    }

    // The game opens once you are at it and they have got next to you. Walking away after it,
    // or stopping somewhere else on the way, turns the game into a walk.
    const playing = talkers.filter((talker) => talker.mode === "play");
    if (outing && !playing.length) outing = null;
    if (outing && self) {
      const front = spotFront(outing.spot);
      const there = self.x === front.x && self.y === front.y;
      if (there && !outing.opened && playing.every((talker) => talker.plannedFor === selfKey && !talker.path.length)) {
        outing.opened = true;
        play(outing.spot.action);
      }
      if (outing.opened ? !there : !there && time - stillSince > GAVE_UP) {
        for (const talker of playing) goWith(talker, "follow");
        outing = null;
      }
    }

    for (const talker of talkers) {
      const grid = gridFor(talker);
      const want = talker.mode && self ? selfKey : "home";
      const onTile = Math.abs(talker.group.position.x - talker.x - 0.5) < 1e-3 && Math.abs(talker.group.position.z - talker.y - 0.5) < 1e-3;
      // Work out where to go when you have moved or they were asked something, but only from the
      // middle of a tile, so a step already started is finished first.
      if (grid && onTile && talker.plannedFor !== want) {
        talker.plannedFor = want;
        let goal: Tile | null = talker.home;
        if (talker.mode && self) {
          // Playing, they would rather stand beside you in front of a game of their own (the next
          // arcade machine along), then in the row in front of yours, then anywhere they can reach it.
          const spot = talker.mode === "play" ? outing?.spot : undefined;
          const front = spot && spotFront(spot);
          const atAGame = (tile: Tile) => spots.some((s) => s.action.kind === "game" && tile.y === s.y + s.h && tile.x >= s.x && tile.x < s.x + s.w);
          const rank = spot && ((tile: Tile) => (spotInReach([spot], tile.x, tile.y) !== spot ? 3 : atAGame(tile) ? 0 : tile.y === front!.y ? 1 : 2));
          const taken = new Set([selfKey, ...others.map(key), ...talkers.filter((other) => other !== talker).map((other) => key(other.path.at(-1) ?? other))]);
          goal = chooseFollowTile({ leader: self, from: talker, grid, taken, rank });
        }
        // Nowhere next to you they can get to (you are in a closed room, say): they wait.
        talker.path = goal && (goal.x !== talker.x || goal.y !== talker.y) ? findPath(talker, goal, grid) : [];
      }

      const next = talker.path[0];
      if (next) {
        toward.set(next.x + 0.5, 0, next.y + 0.5).sub(talker.group.position);
        const distance = toward.length();
        const step = Math.min(distance, WALK_SPEED * dt);
        if (distance > 1e-6) {
          talker.group.position.addScaledVector(toward, step / distance);
          talker.heading = Math.atan2(toward.x, toward.z);
        }
        talker.lastMoved = time;
        if (distance - step < 1e-4) {
          talker.group.position.set(next.x + 0.5, 0, next.y + 0.5);
          talker.x = next.x;
          talker.y = next.y;
          talker.path.shift();
        }
      }

      // Facing: where they walk, the game they play (straight ahead from the row in front of it,
      // as you do), you when you are beside them, and the room when they are back at their spot.
      const walking = time - talker.lastMoved < 0.12;
      const game = talker.mode === "play" && outing?.opened && !walking && spotInReach([outing.spot], talker.x, talker.y) === outing.spot ? outing.spot : null;
      const dx = self ? self.x - talker.x : 0;
      const dy = self ? self.y - talker.y : 0;
      let facing: number | null = null;
      if (walking) facing = talker.heading;
      else if (game && talker.y === spotFront(game).y) facing = Math.PI;
      else if (game) facing = Math.atan2(game.x + game.w / 2 - talker.x - 0.5, game.y + game.h / 2 - talker.y - 0.5);
      else if (self && Math.max(Math.abs(dx), Math.abs(dy)) <= 1) facing = Math.atan2(dx, dy);
      else if (talker.x === talker.home.x && talker.y === talker.home.y) facing = 0;
      if (facing !== null) {
        const turn = Math.atan2(Math.sin(facing - talker.group.rotation.y), Math.cos(facing - talker.group.rotation.y));
        talker.group.rotation.y += turn * (1 - Math.exp(-dt * (walking ? 12 : 8)));
      }

      talker.walk = blend(talker.walk, walking ? 1 : 0, 10, dt);
      talker.play = blend(talker.play, game ? 1 : 0, 6, dt);
      talker.person.update(dt, talker.walk, 0, talker.play);
    }
  };
}
