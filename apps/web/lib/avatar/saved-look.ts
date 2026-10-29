import { parseAvatarLook, type AvatarLook } from "@repo/shared";

// The last look chosen on this browser, so the pre-join screen opens with it.
// The server keeps the real copy (it is what other players see).
const SAVED_LOOK_KEY = "clario:avatar-look";

export function readSavedLook(): AvatarLook | null {
  try {
    return parseAvatarLook(localStorage.getItem(SAVED_LOOK_KEY));
  } catch {
    return null;
  }
}

export function saveLook(look: AvatarLook) {
  try {
    localStorage.setItem(SAVED_LOOK_KEY, JSON.stringify(look));
  } catch {
    // Storage can be unavailable (private mode); the server still has the look.
  }
}
