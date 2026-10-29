import * as z from "zod";

// How senior someone is at work. Each person picks their own level when they join a space.
// The order matters: a later level outranks an earlier one.
export const WORK_LEVELS = ["fresher", "junior", "mid", "senior", "lead"] as const;
export type WorkLevel = (typeof WORK_LEVELS)[number];

export const WorkLevelSchema = z.enum(WORK_LEVELS);

export const WORK_LEVEL_INFO: Record<WorkLevel, { label: string; hint: string }> = {
  fresher: { label: "Fresher", hint: "New to work, or in your first few months" },
  junior: { label: "Junior", hint: "Up to about two years in" },
  mid: { label: "Mid-level", hint: "Owns features without much help" },
  senior: { label: "Senior", hint: "Guides others and reviews their work" },
  lead: { label: "Lead / Manager", hint: "Runs a team or a project" },
};

/** 1 for Fresher up to 5 for Lead / Manager. */
export function workLevelRank(level: WorkLevel): number {
  return WORK_LEVELS.indexOf(level) + 1;
}

export function parseWorkLevel(value: unknown): WorkLevel | null {
  const level = WorkLevelSchema.safeParse(value);
  return level.success ? level.data : null;
}

/**
 * Tasks only go down: the assigner must be strictly above the assignee. Someone who has not
 * picked a level can neither give nor get a task, because their place is unknown.
 */
export function canAssignTask(assigner: WorkLevel | null, assignee: WorkLevel | null): boolean {
  if (!assigner || !assignee) return false;
  return workLevelRank(assigner) > workLevelRank(assignee);
}
