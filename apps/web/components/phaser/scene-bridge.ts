// A small shared object between the Phaser scene and the React UI around it.
// The scene fills it in; the minimap and zoom buttons read and call it.

import type { BookId, Coffee, CoworkerId, Dir, Drink, Fabric, ItemKind, MentorState, PlayerProp } from "@repo/shared";
import type { SpotGame } from "../../lib/maps/play-spots";
import type { TvStore } from "../tv/tv-store";

export type MinimapFloor = { x: number; y: number; w: number; h: number; color: number };

export type SceneMapInfo = {
  cols: number;
  rows: number;
  walls: string[];
  blocked: string[];
  floors: MinimapFloor[];
};

export type PropInteraction = {
  kind: "shelf" | "vending" | "rack" | "book" | "can" | "bike" | "printer" | "server" | "coffee" | "cup";
  title: string;
  detail: string;
  action: string;
  ready: boolean;
  book?: BookId;
  page?: number;
  // At a coffee machine: the order menu is open, and how far the brew is (0 to 1) while brewing.
  menu?: boolean;
  brew?: number;
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
  previewItem?: (item: { kind: ItemKind; dir?: Dir; fabric?: Fabric; variant?: number }) => string | null;
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
  // Optional, filled by the scene. coworkerPlace: where the player is (map name, the room they're
  // in, the map's room names, people in the space), so coworkers can say what's going on.
  // coworkerGoTo: walks a coworker to a room by name; false when this view can't.
  coworkerPlace?: () => { map: string; room: string | null; rooms: string[]; peopleOnline?: number };
  coworkerGoTo?: (id: CoworkerId, room: string) => boolean;
  // Game Room and Lounge (components/games/arcade-on-map.tsx): the scene calls openGame when the
  // player uses an arcade machine or the ping-pong table, openTv at the Lounge TV. The overlay
  // turns the game keyboard off while it is open.
  openGame?: (kind?: SpotGame) => void;
  openTv?: () => void;
  // The Lounge TV's channel (components/tv/tv-store.ts), set by ArcadeOnMap, so the 3D view can
  // play it on its TV (components/tv/tv-screen-3d.ts). While it does, openTv opens the TV's remote.
  tv?: TvStore;
  // Books, bikes and drinks (phaser/scenes/props-on-map.ts): everyone's current prop, yours included,
  // kept up to date by the page, and how to change yours.
  props?: Record<string, PlayerProp>;
  // False if it couldn't be sent (the connection is down).
  setProp?: (prop: PlayerProp | null) => boolean;
  // The can you bought, waiting in the vending machine's tray (dropped at `at`, in ms), for the 3D view.
  vendingTray?: { drink: Drink; at: number } | null;
  // Your coffee at a kitchen machine (props-on-map.ts), for the 3D view: brewing from `at`
  // (performance.now() ms) for BREW_MS, then waiting to be taken. `spot` is the machine's tiles.
  coffeeBrew?: { coffee: Coffee; spot: { x: number; y: number; w: number; h: number }; at: number } | null;
  // Orders a coffee at the machine you stand at; false if you can't now (see props-on-map.ts).
  orderCoffee?: (coffee: Coffee) => boolean;
  // Context actions are published by the live map, so the same buttons work in 2D and WebGL.
  propInteraction?: PropInteraction | null;
  useProp?: () => boolean;
  openPrinter?: () => void;
  // A server rack: its units and the jobs it runs (components/game-ui/server-rack.tsx).
  openServerRack?: () => void;
  mapOverlays?: Set<string>;
  returnProp?: () => boolean;
  readBook?: (book: BookId) => boolean;
  turnBook?: (page: number) => boolean;
  usePropAt?: (x: number, y: number) => boolean;
  // Front-door badge reader (components/badge-reader/badge-on-map.tsx). The scene calls badgeIn when
  // the player walks past the reader ("walk": nothing happens if they are already in) or presses E
  // at it ("key"). badgeLight is for the reader's LED: `in` while you are badged in, and `flashAt`
  // (Date.now() ms) when it last beeped: show it bright green for about 1.2 s after that.
  badgeIn?: (how: "walk" | "key") => void;
  // Badges you out (E at the reader while you are in, or walking out of the building).
  badgeOut?: () => void;
  badgeLight?: { in: boolean; flashAt: number };
  // Notice board (components/notice-board/notice-board-on-map.tsx): the scene calls openNoticeBoard
  // when the player presses E at the board. noticeUnread: posts by others they haven't seen (a red pin).
  openNoticeBoard?: () => void;
  noticeUnread?: number;
  // A badge reader the 2D map stood by the spawn because the map has none (office-objects.ts), so
  // the 3D view shows it there too; null when the map has its own.
  badgeReaderTile?: { x: number; y: number } | null;
  // The tile the board stands on (phaser/scenes/notice-board-object.ts), for the 3D view to use too.
  noticeBoardSpot?: { x: number; y: number } | null;
};

// The tiles an edit would cover, whether it fits, and the piece being placed (if any).
export type BuilderGhost = { x: number; y: number; w: number; h: number; ok: boolean; item?: { kind: ItemKind; dir?: Dir; fabric?: Fabric; variant?: number } };

export function createSceneBridge(): SceneBridge {
  return { map: null, view: null };
}
