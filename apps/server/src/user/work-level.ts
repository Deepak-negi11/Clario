import type { WorkLevel } from "@repo/shared";

// The database stores levels as a Prisma enum; the API uses the lowercase ids from @repo/shared.
type DbWorkLevel = "Fresher" | "Junior" | "Mid" | "Senior" | "Lead";

const TO_DB: Record<WorkLevel, DbWorkLevel> = { fresher: "Fresher", junior: "Junior", mid: "Mid", senior: "Senior", lead: "Lead" };
const FROM_DB: Record<DbWorkLevel, WorkLevel> = { Fresher: "fresher", Junior: "junior", Mid: "mid", Senior: "senior", Lead: "lead" };

export function toDbWorkLevel(level: WorkLevel): DbWorkLevel {
  return TO_DB[level];
}

export function fromDbWorkLevel(level: DbWorkLevel | null): WorkLevel | null {
  return level ? FROM_DB[level] : null;
}
