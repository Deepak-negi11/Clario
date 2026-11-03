"use client";
import { useEffect, useState } from "react";
import { MessageSquare, X } from "lucide-react";
import { WORK_LEVEL_INFO, type WorkLevel } from "@repo/shared";
import { AGENT_IDENTITY, agentKind } from "../../lib/agents/identity";
import type { AgentActivityEntry } from "../../hooks/use-space-socket";
import { AgentEmblem } from "./agent-emblem";
import { AgentWorkspace } from "./agent-workspace";

export type PlayerAgentChat = {
  state: "none" | "pending" | "declined" | "incoming" | "open";
  onRequest: () => void;
  onAccept: () => void;
  onOpen: () => void;
};
export type AgentCardProps = {
  activity: AgentActivityEntry | undefined;
  name: string;
  level: WorkLevel | null;
  onClose: () => void;
  chat: PlayerAgentChat | null;
};
export function AgentCard({
  activity,
  name,
  level,
  onClose,
  chat,
}: AgentCardProps) {
  const working = activity?.state === "cooking";
  const kind = activity ? agentKind(activity.agent) : "agent";
  const identity = AGENT_IDENTITY[kind];
  const [age, setAge] = useState(0);
  useEffect(() => {
    if (!activity) return;
    const update = () =>
      setAge(Math.max(0, Math.floor((Date.now() - activity.at) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [activity]);
  const chatAction =
    chat &&
    {
      none: {
        hint: "Only the two of you will see it.",
        label: "Request chat",
        onClick: chat.onRequest,
      },
      pending: {
        hint: `Waiting for ${name} to accept.`,
        label: "Request sent",
        onClick: undefined,
      },
      declined: {
        hint: `${name} said no for now. You can ask again in a minute.`,
        label: "Ask again",
        onClick: chat.onRequest,
      },
      incoming: {
        hint: `${name} asked to chat with you.`,
        label: "Accept",
        onClick: chat.onAccept,
      },
      open: {
        hint: "You're chatting privately.",
        label: "Open chat",
        onClick: chat.onOpen,
      },
    }[chat.state];
  return (
    <aside
      aria-label={`${name}'s coding agent`}
      className="pointer-events-auto absolute left-1/2 top-4 z-50 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-[24px] border border-white/90 bg-[#fdfdfb]/95 text-[#26312d] shadow-[0_16px_48px_-16px_rgba(19,34,28,0.3)] backdrop-blur-xl"
    >
      <div className="px-4 pb-4 pt-3.5">
        <header className="flex items-start gap-3">
          <AgentEmblem key={kind} kind={kind} working={working} />
          <div className="min-w-0 flex-1 pt-1.5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="truncate text-[15px] font-semibold tracking-[-0.025em]">
                {name}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close agent card"
                className="-mr-1 grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-[#87918c] transition hover:bg-black/5 hover:text-[#26312d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#416858]"
              >
                <X size={15} />
              </button>
            </div>
            <p
              className="mt-1 flex items-center gap-1.5 text-[12px] font-medium"
              style={{ color: identity.color }}
            >
              {identity.name}
              <span className="h-1 w-1 rounded-full bg-current opacity-30" />
              <span className="text-[11px] font-normal text-[#78837c]">
                {working ? "Working" : "Standby"}
              </span>
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${working ? "motion-safe:animate-pulse" : "opacity-40"}`}
                style={{ background: identity.color }}
              />
              <span className="text-[10px] text-[#6f7c73]">
                {working ? "Live activity" : "Ready when you are"}
              </span>
              {level && (
                <span className="rounded-md bg-[#eaf0e9] px-1.5 py-0.5 text-[9px] font-medium text-[#61715f]">
                  {WORK_LEVEL_INFO[level].label}
                </span>
              )}
            </div>
          </div>
        </header>
        {working && activity ? (
          <div className="mt-3 overflow-hidden rounded-xl border border-[#e5eae3] bg-white/90">
            <div className="flex items-start gap-2 border-b border-[#eef0e9] px-3 py-2">
              <span className="mt-1 flex gap-1 opacity-40" aria-hidden="true">
                <span className="h-1 w-1 rounded-full bg-current" />
                <span className="h-1 w-1 rounded-full bg-current" />
                <span className="h-1 w-1 rounded-full bg-current" />
              </span>
              <div className="min-w-0 flex-1 [&>dl]:mt-0">
                <AgentWorkspace
                  project={activity.project}
                  branch={activity.branch}
                  commit={activity.commit}
                />
                {!activity.project && !activity.branch && !activity.commit && (
                  <span className="text-[10px] text-[#809086]">
                    Current task
                  </span>
                )}
              </div>
            </div>
            <p
              role="status"
              className="break-words px-3 py-3 font-mono text-[11px] leading-[1.8] text-[#3c5f50]"
            >
              {activity.text}
            </p>
            <footer className="flex items-center justify-between border-t border-[#eef0e9] bg-[#f7f9f5] px-3 py-1.5 text-[9px] text-[#879287]">
              <span>{identity.short} session</span>
              <span>
                Updated {age < 60 ? `${age}s` : `${Math.floor(age / 60)}m`} ago
              </span>
            </footer>
          </div>
        ) : (
          <p className="mt-3 rounded-xl bg-[#f1f5ee] px-3 py-3 text-[12px] leading-5 text-[#788477]">
            No agent is working right now. Live activity appears here when a
            connected agent starts a task.
          </p>
        )}
      </div>
      {chatAction && (
        <footer className="flex items-center justify-between gap-3 border-t border-[#e9ede5] bg-[#f5f7f1] px-4 py-3">
          <span className="min-w-0 text-[11px] leading-4 text-[#788477]">
            {chatAction.hint}
          </span>
          <button
            type="button"
            onClick={chatAction.onClick}
            disabled={!chatAction.onClick}
            className="flex min-h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-[#293d33] px-3 text-xs font-medium text-white transition hover:bg-[#1a2d23] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#416858] disabled:cursor-default disabled:bg-[#e1e7dd] disabled:text-[#8b9587]"
          >
            <MessageSquare size={13} />
            {chatAction.label}
          </button>
        </footer>
      )}
    </aside>
  );
}
