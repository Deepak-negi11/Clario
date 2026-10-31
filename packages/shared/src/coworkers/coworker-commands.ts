import { hasKeyword } from "../missions/rubric";

// What a coworker can do when asked, besides talking. "follow", "play" and "stop" are the 3D
// view's companions (apps/web/lib/companions: walk with the player, play a game with them, go back
// to their spot), so they only make sense while the player can walk with them; "go-to" a room only
// where the scene can do it; "leave" ends the chat (and stops them). "open-mission" opens their
// mission in the panel. Every action is one of these typed values, checked on the server against
// what the browser says is possible right now; nothing in the AI's text is ever run.
// The browser itself catches the common "walk with me / let's play / stop" phrases before asking
// the AI (lib/companions/intent.ts); the AI's actions cover everything else it understands.

export type CoworkerMoveAction =
  | { type: "follow" }
  | { type: "play" }
  | { type: "stop" }
  | { type: "go-to"; room: string }
  | { type: "leave" };
export type CoworkerAction = CoworkerMoveAction | { type: "open-mission"; missionId: string };

// What the AI may put in its "action" field.
export const AI_COWORKER_ACTIONS = ["none", "offer-mission", "follow", "play", "stop", "go-to", "leave"] as const;

// What the player's view lets coworkers do right now (sent by the browser with each chat).
export type CoworkerAbilities = { canWalk: boolean; canGoTo: boolean; rooms: string[] };

/** The room from this map's list that `name` means (any case, "the" optional), or null. */
export function matchRoom(name: string, rooms: string[]): string | null {
  const wanted = name.trim().toLowerCase().replace(/^the\s+/, "");
  if (!wanted) return null;
  return rooms.find((room) => room.toLowerCase() === wanted) ?? null;
}

/** The action if the player's view can do it right now, else null. */
export function allowedMove(action: CoworkerMoveAction, { canWalk, canGoTo, rooms }: CoworkerAbilities): CoworkerMoveAction | null {
  switch (action.type) {
    case "leave":
      return action;
    case "go-to": {
      const room = canGoTo ? matchRoom(action.room, rooms) : null;
      return room ? { type: "go-to", room } : null;
    }
    default:
      return canWalk ? action : null;
  }
}

// The room named in a sentence; the longest name wins, so "Meeting Room 2" beats "Meeting Room".
function roomIn(text: string, rooms: string[]): string | null {
  return [...rooms].sort((a, b) => b.length - a.length).find((room) => hasKeyword(text, room)) ?? null;
}

const GO_TO = /\b(go|walk|head|run|move)\s+(over\s+)?(to|into)\b/i;
const LEAVE = /^\s*leave\b|\byou can (go|leave)\b|\bplease leave\b|\bgo away\b|\b(good)?bye\b|\bsee you (later|soon|around)\b|\bthat'?s all( for now)?\b/i;

/** "Go to the kitchen" or a goodbye in plain words, for when the AI is off. */
export function coworkerCommand(message: string, abilities: CoworkerAbilities): CoworkerMoveAction | null {
  if (abilities.canGoTo && GO_TO.test(message)) {
    const room = roomIn(message, abilities.rooms);
    if (room) return { type: "go-to", room };
  }
  if (LEAVE.test(message)) return { type: "leave" };
  return null;
}
