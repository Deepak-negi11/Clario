// A small shared object between the Phaser scene and the React UI around it.
// The scene fills it in; the minimap and zoom buttons read and call it.

import type { CoworkerId, Dir, Drink, Fabric, ItemKind, MentorState, PlayerProp } from "@repo/shared";
import type { ArcadeGameKind } from "../games/arcade-kit";

export type MinimapFloor = { x: number; y: number; w: number; h: number; color: number };

export type SceneMapInfo = {
  cols: number;
  rows: number;
  walls: string[];
  blocked: string[];
  floors: MinimapFloor[];
};

export type SceneBridge = {
  map: SceneMapInfo | null;
  // The part of the world the camera shows, in world pixels (32 per tile).
  view: { x: number; y: number; width: number; height: number } | null;
  zoomBy?: (factor: number) => void;
  zoomToFit?: () => void;
  walkTo?: (x: number, y: number) => void;
  // Errands: marks the room to run to (in tiles), or clears the mark with null.
  setErrandTarget?: (room: { x: number; y: number; width: number; height: number } | null) => void;
  // Map builder (maps people build): while `builder.active`, clicks and drags on the map go to
  // `onPointer` instead of walking, and the scene draws the ghost the builder asks for.
  builder?: { active: boolean; onPointer: (x: number, y: number, phase: "down" | "drag" | "hover" | "up") => void };
  setBuilderGhost?: (ghost: BuilderGhost | null) => void;
  // A furniture piece's sprite as a data URL, for the builder's palette.
  previewItem?: (item: { kind: ItemKind; dir?: Dir; fabric?: Fabric }) => string | null;
  // Practice Session (Maya, the mentor NPC). The scene calls openMentor when the player talks
  // to her; the panel sets mentorState (undefined while closed) so her sprite shows what she
  // is doing, and turns the game keyboard off while the learner types.
  openMentor?: () => void;
  mentorState?: MentorState;
  setKeyboardEnabled?: (enabled: boolean) => void;
  // AI coworkers (Arjun, Priya, Rahul; COWORKERS in @repo/shared). The scene calls openCoworker
  // when the player talks to one; the talk panel sets coworkerState (undefined while closed).
  openCoworker?: (id: CoworkerId) => void;
  coworkerState?: { id: CoworkerId; state: MentorState };
  // Game Room and Lounge (components/games/arcade-on-map.tsx): the scene calls openGame when the
  // player uses an arcade machine or the ping-pong table, openTv at the Lounge TV. The overlay
  // turns the game keyboard off while it is open.
  openGame?: (kind?: ArcadeGameKind) => void;
  openTv?: () => void;
  // Bikes and drinks (phaser/scenes/props-on-map.ts): everyone's current prop, yours included,
  // kept up to date by the page, and how to change yours.
  props?: Record<string, PlayerProp>;
  setProp?: (prop: PlayerProp | null) => void;
  // The can you bought, waiting in the vending machine's tray (dropped at `at`, in ms), for the 3D view.
  vendingTray?: { drink: Drink; at: number } | null;
};

// The tiles an edit would cover, whether it fits, and the piece being placed (if any).
export type BuilderGhost = { x: number; y: number; w: number; h: number; ok: boolean; item?: { kind: ItemKind; dir?: Dir; fabric?: Fabric } };

export function createSceneBridge(): SceneBridge {
  return { map: null, view: null };
}
