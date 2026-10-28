// A small shared object between the Phaser scene and the React UI around it.
// The scene fills it in; the minimap and zoom buttons read and call it.

import type { MentorState } from "@repo/shared";

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
  // Practice Session (Maya, the mentor NPC). The scene calls openMentor when the player talks
  // to her; the panel sets mentorState (undefined while closed) so her sprite shows what she
  // is doing, and turns the game keyboard off while the learner types.
  openMentor?: () => void;
  mentorState?: MentorState;
  setKeyboardEnabled?: (enabled: boolean) => void;
};

export function createSceneBridge(): SceneBridge {
  return { map: null, view: null };
}
