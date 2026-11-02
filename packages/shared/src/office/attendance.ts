import { ATTENDANCE_LIST_MAX, ATTENDANCE_LOOKBACK_MS, type AttendanceEntry } from "../ws/badge.schema";

// The visits shown in the People list and its "Today" view (badge.schema.ts).

// Midnight at the start of the day `now` falls in, in this device's time zone.
export function startOfDay(now: number) {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

// The server never lists visits from further back than a day and a time zone.
export function clampSince(since: number, now: number) {
  return Math.min(now, Math.max(since, now - ATTENDANCE_LOOKBACK_MS));
}

// Adds a visit, or replaces it when it changed (they left), keeping the list in arrival order.
export function mergeAttendance(entries: AttendanceEntry[], entry: AttendanceEntry) {
  const next = entries.filter((existing) => existing.id !== entry.id);
  next.push(entry);
  next.sort((a, b) => a.inAt - b.inAt || a.id.localeCompare(b.id));
  return next.length > ATTENDANCE_LIST_MAX ? next.slice(-ATTENDANCE_LIST_MAX) : next;
}

// Each person's latest visit; it is open (outAt null) while they are in.
export function latestVisits(entries: AttendanceEntry[]) {
  const latest: Record<string, AttendanceEntry> = {};
  for (const entry of entries) {
    const seen = latest[entry.userId];
    if (!seen || entry.inAt >= seen.inAt) latest[entry.userId] = entry;
  }
  return latest;
}

// One row per person for the "Today" view: when they first came in, and when they left
// (null while they are still in). Earliest arrival first.
export type DaySummary = { userId: string; name: string; firstIn: number; lastOut: number | null; visits: number };

export function summarizeDay(entries: AttendanceEntry[]): DaySummary[] {
  const byUser = new Map<string, DaySummary>();
  for (const entry of entries) {
    const row = byUser.get(entry.userId);
    if (!row) {
      byUser.set(entry.userId, { userId: entry.userId, name: entry.name, firstIn: entry.inAt, lastOut: entry.outAt, visits: 1 });
      continue;
    }
    row.visits += 1;
    row.name = entry.name;
    row.firstIn = Math.min(row.firstIn, entry.inAt);
    // Still in if any visit is open; otherwise the latest time they left.
    row.lastOut = row.lastOut === null || entry.outAt === null ? null : Math.max(row.lastOut, entry.outAt);
  }
  return [...byUser.values()].sort((a, b) => a.firstIn - b.firstIn);
}

// "9:42", "14:05": the hour and minute in this device's time zone.
export function clockTime(ms: number) {
  const time = new Date(ms);
  return `${time.getHours()}:${String(time.getMinutes()).padStart(2, "0")}`;
}
