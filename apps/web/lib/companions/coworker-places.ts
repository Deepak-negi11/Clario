import type { CoworkerId } from "@repo/shared";
import type { Tile } from "../maps/path-finder";

// Where each AI coworker stands on the map in this tab: the 2D map picks their spots when it is
// drawn (Clario HQ's own, or chosen by role on any other map) and moves one when they are asked
// to walk to a room. The 3D view reads it every frame, so they stand and walk in the same places.

export type CoworkerPlaces = Partial<Record<CoworkerId, Tile>>;

let current: CoworkerPlaces = {};

export const coworkerPlaces = {
  get: () => current,
  // All of them at once, for a newly drawn map.
  reset(places: CoworkerPlaces) {
    current = { ...places };
  },
  move(id: CoworkerId, tile: Tile) {
    current = { ...current, [id]: tile };
  },
};
