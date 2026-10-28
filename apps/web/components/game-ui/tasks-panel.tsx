"use client";

import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { LoaderCircle, Send, Trash2, X } from "lucide-react";
import { WORK_LEVEL_INFO, canAssignTask, type WorkLevel } from "@repo/shared";
import type { PanelPerson } from "./people-panel";
import {
  createSpaceTask,
  deleteSpaceTask,
  listSpaceTasks,
  setSpaceTaskStatus,
  type SpaceTask,
  type SpaceTasks,
  type TaskStatus,
} from "../../lib/space-api";
import { getAuthToken } from "../../lib/auth-token";

// Same limits as the server (apps/server/src/task/task.ts).
const MAX_SUBJECT_LENGTH = 150;
const MAX_DESCRIPTION_LENGTH = 2000;

const STATUSES: { id: TaskStatus; label: string }[] = [
  { id: "todo", label: "To do" },
  { id: "in-progress", label: "In progress" },
  { id: "done", label: "Done" },
];
const STATUS_LABEL: Record<TaskStatus, string> = { todo: "To do", "in-progress": "In progress", done: "Done" };
const STATUS_PILL: Record<TaskStatus, string> = {
  todo: "bg-[#eef0f3] text-[#4b5260]",
  "in-progress": "bg-[#fff1d6] text-[#8a5300]",
  done: "bg-[#e3f5ea] text-[#17673a]",
};

const fieldLabel = "font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#5c6371]";
const fieldInput =
  "w-full rounded-xl border border-[#e6e7ea] bg-[#f7f8fa] px-3 py-2.5 text-[13px] text-[#12151c] outline-none transition placeholder:text-[#6b7180] focus:border-[#12151c]/50 focus:bg-white focus:ring-2 focus:ring-[#12151c]/10 disabled:opacity-60";
const primaryButton =
  "flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-[#12151c] px-3.5 text-[13px] font-semibold text-white transition hover:bg-black active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#e6e7ea] disabled:text-[#6b7180] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12151c] motion-reduce:transition-none";

const when = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// This user's tasks in the space, loaded on mount and again whenever the server says they changed.
export function useSpaceTasks(spaceId: string, changedAt: number) {
  const [tasks, setTasks] = useState<SpaceTasks | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const token = getAuthToken();
    if (!token) return;
    try {
      setTasks(await listSpaceTasks(token, spaceId));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load tasks");
    }
  }, [spaceId]);

  useEffect(() => {
    void reload();
  }, [reload, changedAt]);

  return { tasks, error, reload };
}

// Tasks not started yet, for the badge on the rail.
export function countNewTasks(tasks: SpaceTasks | null) {
  return tasks?.received.filter((task) => task.status === "todo").length ?? 0;
}

export function TasksPanel({
  spaceId,
  tasks,
  loadError,
  people,
  onChanged,
  onClose,
}: {
  spaceId: string;
  tasks: SpaceTasks | null;
  loadError: string | null;
  people: PanelPerson[];
  onChanged: () => void;
  onClose: () => void;
}) {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        // Keep typing out of the Phaser scene, which listens for arrow keys on window.
        event.stopPropagation();
        if (event.key === "Escape") onClose();
      }}
      className="pointer-events-auto absolute left-[76px] top-3 z-[65] flex max-h-[calc(100dvh-1.5rem)] w-[min(23rem,calc(100vw-6rem))] flex-col overflow-hidden rounded-2xl border border-black/5 bg-white/95 text-[#12151c] shadow-[0_18px_44px_-18px_rgba(18,21,28,0.45)] backdrop-blur-md"
    >
      <header className="flex items-center justify-between border-b border-[#eceef1] px-4 py-3">
        <h2 id={titleId} className="text-sm font-semibold">
          Tasks
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close tasks"
          className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-[#8a909b] transition hover:bg-[#f4f5f7] hover:text-[#12151c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 overflow-y-auto overscroll-contain">
        {!tasks ? (
          <p className="px-4 py-6 text-center text-[13px] text-[#5c6371]" role={loadError ? "alert" : "status"}>
            {loadError ?? "Loading tasks…"}
          </p>
        ) : (
          <>
            {!tasks.level && (
              <p className="border-b border-[#eceef1] px-4 py-3 text-[12px] leading-5 text-[#5c6371]">
                Pick your work level the next time you join this space to give or get tasks.
              </p>
            )}
            {/* Nobody is above Lead / Manager, so their own list only shows if it has something in it. */}
            {(tasks.level !== "lead" || tasks.received.length > 0) && (
              <ReceivedList spaceId={spaceId} tasks={tasks.received} onChanged={onChanged} />
            )}
            {tasks.canAssign && tasks.level && (
              <AssignForm spaceId={spaceId} level={tasks.level} people={people} onAssigned={onChanged} />
            )}
            {(tasks.canAssign || tasks.given.length > 0) && (
              <GivenList spaceId={spaceId} tasks={tasks.given} onChanged={onChanged} />
            )}
          </>
        )}
      </div>
    </section>
  );
}

function AssignForm({
  spaceId,
  level,
  people,
  onAssigned,
}: {
  spaceId: string;
  level: WorkLevel;
  people: PanelPerson[];
  onAssigned: () => void;
}) {
  const ids = useId();
  const [assigneeId, setAssigneeId] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ kind: "sent" | "error"; text: string } | null>(null);

  const everyoneElse = people.filter((person) => !person.isSelf);
  // Same rule as the server, which checks it again: only people below this user's level.
  const others = everyoneElse.filter((person) => canAssignTask(level, person.level));
  const hiddenCount = everyoneElse.length - others.length;
  // If the chosen person leaves the space, the picker falls back to "Choose a person".
  const assignee = others.find((person) => person.id === assigneeId) ?? null;
  const canSend = !!assignee && subject.trim().length > 0 && !sending;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const token = getAuthToken();
    if (!token || !assignee || !canSend) return;
    setSending(true);
    setResult(null);
    try {
      await createSpaceTask(token, spaceId, { assigneeId: assignee.id, subject, description });
      setResult({ kind: "sent", text: `Task sent to ${assignee.name}.` });
      setAssigneeId("");
      setSubject("");
      setDescription("");
      onAssigned();
    } catch (cause) {
      setResult({ kind: "error", text: cause instanceof Error ? cause.message : "Could not assign the task." });
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3 border-b border-[#eceef1] px-4 py-4">
      <p className="text-[13px] font-semibold">Assign a task</p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${ids}-to`} className={fieldLabel}>
          To
        </label>
        <select
          id={`${ids}-to`}
          value={assignee?.id ?? ""}
          onChange={(event) => setAssigneeId(event.target.value)}
          disabled={sending || others.length === 0}
          className={`${fieldInput} cursor-pointer`}
        >
          <option value="">
            {everyoneElse.length === 0 ? "No one else is here yet" : others.length === 0 ? "No one here is below your level" : "Choose a person"}
          </option>
          {others.map((person) => (
            <option key={person.id} value={person.id}>
              {`${person.name}${person.level ? ` · ${WORK_LEVEL_INFO[person.level].label}` : ""}`}
            </option>
          ))}
        </select>
        {everyoneElse.length === 0 ? (
          <p className="text-[11px] leading-4 text-[#5c6371]">Tasks go to people who are in the space right now.</p>
        ) : (
          hiddenCount > 0 && (
            <p className="text-[11px] leading-4 text-[#5c6371]">
              You&apos;re {WORK_LEVEL_INFO[level].label}, so only people below that level are listed ({hiddenCount} hidden).
            </p>
          )
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${ids}-subject`} className={fieldLabel}>
          Subject
        </label>
        <input
          id={`${ids}-subject`}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          maxLength={MAX_SUBJECT_LENGTH}
          disabled={sending}
          placeholder="e.g. Fix the login page error"
          autoComplete="off"
          className={fieldInput}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor={`${ids}-description`} className={fieldLabel}>
            Description
          </label>
          <span className="text-[11px] text-[#5c6371]">Optional</span>
        </div>
        <textarea
          id={`${ids}-description`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={MAX_DESCRIPTION_LENGTH}
          disabled={sending}
          rows={4}
          placeholder="What needs doing, links, and when it's due"
          className={`${fieldInput} resize-none leading-relaxed`}
        />
      </div>

      {result && (
        <p
          role={result.kind === "error" ? "alert" : "status"}
          className={`rounded-xl px-3 py-2 text-xs leading-5 ${
            result.kind === "error" ? "bg-[#fef3f2] text-[#b42318]" : "bg-[#e3f5ea] text-[#17673a]"
          }`}
        >
          {result.text}
        </p>
      )}

      <div className="flex justify-end">
        <button type="submit" disabled={!canSend} className={primaryButton}>
          {sending ? (
            <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <Send size={15} aria-hidden="true" />
          )}
          {sending ? "Assigning…" : "Assign task"}
        </button>
      </div>
    </form>
  );
}

function GivenList({ spaceId, tasks, onChanged }: { spaceId: string; tasks: SpaceTask[]; onChanged: () => void }) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(task: SpaceTask) {
    // First click asks, second click removes.
    if (confirmId !== task.id) {
      setConfirmId(task.id);
      return;
    }
    const token = getAuthToken();
    if (!token) return;
    setBusyId(task.id);
    setError(null);
    try {
      await deleteSpaceTask(token, spaceId, task.id);
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove the task.");
    } finally {
      setBusyId(null);
      setConfirmId(null);
    }
  }

  return (
    <div className="border-b border-[#eceef1] px-4 py-4 last:border-b-0">
      <p className="text-[13px] font-semibold">
        Assigned by you <span className="font-medium text-[#8a909b] tabular-nums">· {tasks.length}</span>
      </p>
      {error && (
        <p role="alert" className="mt-2 rounded-xl bg-[#fef3f2] px-3 py-2 text-xs leading-5 text-[#b42318]">
          {error}
        </p>
      )}
      {tasks.length === 0 ? (
        <p className="mt-2 text-[12px] leading-5 text-[#5c6371]">Tasks you give out show up here with their progress.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {tasks.map((task) => (
            <li key={task.id} className="rounded-xl border border-[#eceef1] bg-white px-3 py-2.5">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className={`break-words text-[13px] font-semibold ${task.status === "done" ? "text-[#5c6371] line-through" : ""}`}>
                    {task.subject}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#5c6371]">
                    To {task.assigneeName} · {when.format(task.createdAt)}
                  </p>
                </div>
                <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${STATUS_PILL[task.status]}`}>
                  {STATUS_LABEL[task.status]}
                </span>
              </div>
              {task.description && (
                <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap break-words text-[12px] leading-5 text-[#3d4350]">{task.description}</p>
              )}
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => void remove(task)}
                  onBlur={() => setConfirmId((current) => (current === task.id ? null : current))}
                  disabled={busyId === task.id}
                  aria-label={confirmId === task.id ? `Confirm removing "${task.subject}"` : `Remove "${task.subject}"`}
                  className={`flex h-7 cursor-pointer items-center gap-1 rounded-lg px-2 text-[11px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c] disabled:cursor-not-allowed disabled:opacity-60 ${
                    confirmId === task.id ? "bg-[#d92d20] text-white hover:bg-[#b42318]" : "text-[#5c6371] hover:bg-[#f4f5f7] hover:text-[#b42318]"
                  }`}
                >
                  <Trash2 size={13} aria-hidden="true" />
                  {confirmId === task.id ? "Remove?" : "Remove"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReceivedList({ spaceId, tasks, onChanged }: { spaceId: string; tasks: SpaceTask[]; onChanged: () => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Unfinished work first, newest first within each group.
  const ordered = [...tasks.filter((task) => task.status !== "done"), ...tasks.filter((task) => task.status === "done")];

  async function changeStatus(task: SpaceTask, status: TaskStatus) {
    const token = getAuthToken();
    if (!token || task.status === status) return;
    setBusyId(task.id);
    setError(null);
    try {
      await setSpaceTaskStatus(token, spaceId, task.id, status);
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the task.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="border-b border-[#eceef1] px-4 py-4 last:border-b-0">
      <p className="text-[13px] font-semibold">
        Your tasks <span className="font-medium text-[#8a909b] tabular-nums">· {tasks.length}</span>
      </p>
      {error && (
        <p role="alert" className="mt-2 rounded-xl bg-[#fef3f2] px-3 py-2 text-xs leading-5 text-[#b42318]">
          {error}
        </p>
      )}
      {tasks.length === 0 ? (
        <p className="mt-2 text-[12px] leading-5 text-[#5c6371]">
          No tasks yet. When someone above your level gives you one, it shows up here.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {ordered.map((task) => (
            <li key={task.id} className="rounded-xl border border-[#eceef1] bg-white px-3 py-2.5">
              <p className={`break-words text-[13px] font-semibold ${task.status === "done" ? "text-[#5c6371] line-through" : ""}`}>
                {task.subject}
              </p>
              <p className="mt-0.5 text-[11px] text-[#5c6371]">
                From {task.assignerName} · {when.format(task.createdAt)}
              </p>
              {task.description && (
                <p className="mt-1.5 whitespace-pre-wrap break-words text-[12px] leading-5 text-[#3d4350]">{task.description}</p>
              )}
              <fieldset className="mt-2.5" disabled={busyId === task.id}>
                <legend className="sr-only">Status of {task.subject}</legend>
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#f4f5f7] p-1">
                  {STATUSES.map((option) => {
                    const active = task.status === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => void changeStatus(task, option.id)}
                        className={`h-7 cursor-pointer rounded-lg text-[11px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c] disabled:cursor-wait ${
                          active ? `${STATUS_PILL[option.id]} shadow-sm` : "text-[#5c6371] hover:bg-white hover:text-[#12151c]"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
