import prisma from "@repo/db";
import { WORK_LEVEL_INFO, canAssignTask, type WorkLevel } from "@repo/shared";
import { requireAuth } from "../middleware/auth";
import { jsonMessage } from "../utils/http";
import { fromDbWorkLevel } from "../user/work-level";
import { isUserOnline } from "../ws/presence";
import { sendToUser } from "../ws/room-manager";

// Tasks inside a space. Anyone can assign one to someone in the space right now whose work level
// is below theirs (a Senior to a Junior, never the other way); the person a task is for moves it
// through its statuses.

export const MAX_SUBJECT_LENGTH = 150;
export const MAX_DESCRIPTION_LENGTH = 2000;
const LIST_LIMIT = 100;

export const TASK_STATUSES = ["todo", "in-progress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

type DbStatus = "Todo" | "InProgress" | "Done";
const TO_DB: Record<TaskStatus, DbStatus> = { todo: "Todo", "in-progress": "InProgress", done: "Done" };
const FROM_DB: Record<DbStatus, TaskStatus> = { Todo: "todo", InProgress: "in-progress", Done: "done" };

export type TaskInput = {
  assigneeId: string;
  subject: string;
  description: string;
};

export type TaskView = {
  id: string;
  subject: string;
  description: string;
  status: TaskStatus;
  assignerId: string;
  assignerName: string;
  assigneeId: string;
  assigneeName: string;
  createdAt: number;
  updatedAt: number;
};

export function parseTaskInput(value: unknown): TaskInput | string {
  const raw = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
  if (!raw || typeof raw.assigneeId !== "string" || typeof raw.subject !== "string") {
    return "assigneeId and subject are required";
  }
  if (raw.description !== undefined && typeof raw.description !== "string") {
    return "description must be text";
  }

  const assigneeId = raw.assigneeId.trim();
  // The subject is a one-line title, so line breaks collapse to spaces.
  const subject = raw.subject.replace(/\s+/g, " ").trim();
  const description = (raw.description ?? "").replace(/\r\n/g, "\n").trim();

  if (!assigneeId) return "Choose who the task is for";
  if (!subject) return "Subject can't be empty";
  if (subject.length > MAX_SUBJECT_LENGTH) {
    return `Subject must be ${MAX_SUBJECT_LENGTH} characters or fewer`;
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer`;
  }

  return { assigneeId, subject, description };
}

export function parseTaskStatus(value: unknown): TaskStatus | null {
  const status = typeof value === "object" && value !== null ? (value as { status?: unknown }).status : undefined;
  return TASK_STATUSES.includes(status as TaskStatus) ? (status as TaskStatus) : null;
}

/** Why this assigner may not give this assignee a task, or null when they may. */
export function levelRefusal(assigner: WorkLevel | null, assignee: WorkLevel | null): string | null {
  if (canAssignTask(assigner, assignee)) return null;
  if (!assigner) return "Pick your work level before assigning tasks.";
  if (!assignee) return "That person hasn't picked a work level yet.";
  return `You're ${WORK_LEVEL_INFO[assigner].label}, so you can only assign tasks to people below that level.`;
}

async function levelOf(userId: string): Promise<WorkLevel | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { level: true } });
  return fromDbWorkLevel(user?.level ?? null);
}

// /api/v1/space/:spaceId/tasks[/:taskId[/status]]
function idsFrom(req: Request) {
  const parts = new URL(req.url).pathname.split("/");
  return { spaceId: parts[4] ?? "", taskId: parts[6] ?? "" };
}

const withNames = {
  assigner: { select: { username: true } },
  assignee: { select: { username: true } },
} as const;

type TaskRow = {
  id: string;
  subject: string;
  description: string;
  status: DbStatus;
  assignerId: string;
  assigneeId: string;
  createdAt: Date;
  updatedAt: Date;
  assigner: { username: string };
  assignee: { username: string };
};

function toView(task: TaskRow): TaskView {
  return {
    id: task.id,
    subject: task.subject,
    description: task.description,
    status: FROM_DB[task.status],
    assignerId: task.assignerId,
    assignerName: task.assigner.username,
    assigneeId: task.assigneeId,
    assigneeName: task.assignee.username,
    createdAt: task.createdAt.getTime(),
    updatedAt: task.updatedAt.getTime(),
  };
}

// Tells one person's open page to reload its tasks. It carries no task details, and like private
// chat it only reaches sockets on this server instance; anyone else sees the change on next load.
function notifyTasksChanged(spaceId: string, userId: string) {
  sendToUser(spaceId, userId, { type: "tasks-changed", payload: { at: Date.now() } });
}

export async function handleListTasks(req: Request): Promise<Response> {
  const auth = requireAuth(req);
  if (auth instanceof Response) return auth;

  const { spaceId } = idsFrom(req);
  const space = await prisma.space.findUnique({ where: { id: spaceId }, select: { id: true } });
  if (!space) return jsonMessage("Space not found", 404);

  // A Mid-level both gets tasks from above and gives them below, so everyone gets both lists.
  const [level, received, given] = await Promise.all([
    levelOf(auth.userId),
    prisma.task.findMany({
      where: { spaceId, assigneeId: auth.userId },
      include: withNames,
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
    }),
    prisma.task.findMany({
      where: { spaceId, assignerId: auth.userId },
      include: withNames,
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
    }),
  ]);

  // Anyone above Fresher has someone they could assign to.
  const canAssign = canAssignTask(level, "fresher");
  return Response.json({ level, canAssign, received: received.map(toView), given: given.map(toView) });
}

export async function handleCreateTask(req: Request): Promise<Response> {
  const auth = requireAuth(req);
  if (auth instanceof Response) return auth;

  const { spaceId } = idsFrom(req);
  const input = parseTaskInput(await req.json().catch(() => null));
  if (typeof input === "string") return jsonMessage(input);

  const space = await prisma.space.findUnique({ where: { id: spaceId }, select: { id: true } });
  if (!space) return jsonMessage("Space not found", 404);
  if (input.assigneeId === auth.userId) return jsonMessage("Choose someone else to give the task to.");
  if (!(await isUserOnline(spaceId, input.assigneeId))) {
    return jsonMessage("That person has left the space.", 404);
  }
  // Levels are read from the database here, never from the request, so the page can't skip the rule.
  const [assignerLevel, assigneeLevel] = await Promise.all([levelOf(auth.userId), levelOf(input.assigneeId)]);
  const refusal = levelRefusal(assignerLevel, assigneeLevel);
  if (refusal) return jsonMessage(refusal, 403);

  const task = await prisma.task.create({
    data: {
      spaceId,
      assignerId: auth.userId,
      assigneeId: input.assigneeId,
      subject: input.subject,
      description: input.description,
    },
    include: withNames,
  });

  notifyTasksChanged(spaceId, input.assigneeId);
  return Response.json({ task: toView(task) }, { status: 201 });
}

export async function handleUpdateTaskStatus(req: Request): Promise<Response> {
  const auth = requireAuth(req);
  if (auth instanceof Response) return auth;

  const { spaceId, taskId } = idsFrom(req);
  const status = parseTaskStatus(await req.json().catch(() => null));
  if (!status) return jsonMessage(`status must be one of: ${TASK_STATUSES.join(", ")}`);

  const task = await prisma.task.findFirst({ where: { id: taskId, spaceId }, select: { assigneeId: true, assignerId: true } });
  if (!task) return jsonMessage("Task not found", 404);
  if (task.assigneeId !== auth.userId) {
    return jsonMessage("Only the person the task is for can change its status.", 403);
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: { status: TO_DB[status] },
    include: withNames,
  });

  notifyTasksChanged(spaceId, task.assignerId);
  return Response.json({ task: toView(updated) });
}

export async function handleDeleteTask(req: Request): Promise<Response> {
  const auth = requireAuth(req);
  if (auth instanceof Response) return auth;

  const { spaceId, taskId } = idsFrom(req);
  const task = await prisma.task.findFirst({ where: { id: taskId, spaceId }, select: { assigneeId: true, assignerId: true } });
  if (!task) return jsonMessage("Task not found", 404);
  if (task.assignerId !== auth.userId) {
    return jsonMessage("Only the person who assigned this task can remove it.", 403);
  }

  await prisma.task.delete({ where: { id: taskId } });
  notifyTasksChanged(spaceId, task.assigneeId);
  return Response.json({ message: "Task removed" });
}
