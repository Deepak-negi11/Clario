import type { MissionFeedback } from "@repo/shared";

// Mission progress for this browser: each mission's chat, tries, completion and XP, so a
// refresh keeps everything. Nothing here is sent anywhere.

export type ThreadItem =
  | { kind: "coworker"; text: string; source?: "ai" | "seeded" }
  | { kind: "user"; text: string }
  | { kind: "feedback"; feedback: MissionFeedback; source: "ai" | "rules" };

export type MissionRun = {
  thread: ThreadItem[];
  sends: number;
  completed: boolean;
  xp: number;
};

const RUNS_KEY = "clario:missions:v1";
const SHOW_XP_KEY = "clario:missions:show-xp";

export const emptyRun = (): MissionRun => ({ thread: [], sends: 0, completed: false, xp: 0 });

export function readRuns(): Record<string, MissionRun> {
  try {
    const raw = localStorage.getItem(RUNS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, MissionRun>) : {};
  } catch {
    return {};
  }
}

export function saveRun(missionId: string, run: MissionRun) {
  try {
    localStorage.setItem(RUNS_KEY, JSON.stringify({ ...readRuns(), [missionId]: run }));
  } catch {
    // Private mode or full storage: the mission still works, it just isn't remembered.
  }
}

export const totalXp = (runs: Record<string, MissionRun>) =>
  Object.values(runs).reduce((sum, run) => sum + (run.completed ? run.xp : 0), 0);

/** Classic mode (brief R4): points can be hidden; missions and feedback stay the same. */
export function readShowXp(): boolean {
  try {
    return localStorage.getItem(SHOW_XP_KEY) !== "false";
  } catch {
    return true;
  }
}

export function saveShowXp(show: boolean) {
  try {
    localStorage.setItem(SHOW_XP_KEY, String(show));
  } catch {
    // Not remembered in private mode.
  }
}
