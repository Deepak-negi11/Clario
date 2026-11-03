"use client";

import { Check, CircleCheck, Copy, LoaderCircle, X } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { useDraggablePanel } from "../../hooks/use-draggable-panel";
import {
  agentSetupCommand,
  createAgentKey,
  getAgentStatus,
} from "../../lib/agent-api";
import { getAuthToken } from "../../lib/auth-token";
import { PixelPet } from "./pixel-pet";
import { PanelDragHandle, draggableHeader } from "./panel-drag-handle";

const POLL_MS = 3000;

// The agents the one setup command finds and registers.
const AGENTS = [
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "cursor", label: "Cursor" },
] as const;

/**
 * Whether this user's Claude Code hook (clario-agent) has connected: null while unknown.
 * The sidebar shows the Agent setup until it's true. Activity from their own agent counts too.
 */
export function useAgentSetup(selfAgentActive: boolean) {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;
    let cancelled = false;
    getAgentStatus(token)
      .then(
        (status) =>
          !cancelled && setConnected((current) => current || status.connected),
      )
      .catch(() => {}); // unknown: keep the setup hidden rather than nag on a server error
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selfAgentActive) setConnected(true);
  }, [selfAgentActive]);

  const markConnected = useCallback(() => setConnected(true), []);
  return { connected, markConnected };
}

/**
 * The setup panel behind the sidebar's Agent button: makes a key, shows the one terminal
 * command to run, and waits until the hook reaches the server.
 */
export function AgentSetupPanel({
  onClose,
  onConnected,
}: {
  onClose: () => void;
  onConnected: () => void;
}) {
  const titleId = useId();
  const drag = useDraggablePanel("agent");
  const [key, setKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [connected, setConnected] = useState(false);
  const command = key ? agentSetupCommand(key) : null;

  const makeCommand = async () => {
    const token = getAuthToken();
    if (!token) return setError("Sign in again to make your setup command.");
    setCreating(true);
    setError(null);
    try {
      setKey((await createAgentKey(token)).key);
    } catch {
      setError("Couldn't make your setup command. Try again.");
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy. Select the command and copy it yourself.");
    }
  };

  // Once there's a command to run, wait for setup to reach the server.
  useEffect(() => {
    if (!key || connected) return;
    const token = getAuthToken();
    if (!token) return;
    const timer = window.setInterval(() => {
      getAgentStatus(token)
        .then((status) => {
          if (!status.connected) return;
          setConnected(true);
          onConnected();
        })
        .catch(() => {});
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [key, connected, onConnected]);

  return (
    <section
      ref={drag.ref}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        // Keep typing out of the Phaser scene, which listens for arrow keys on window.
        event.stopPropagation();
        if (event.key === "Escape") onClose();
      }}
      className="pointer-events-auto absolute left-[76px] top-3 z-[65] flex max-h-[calc(100dvh-1.5rem)] w-[min(23rem,calc(100vw-6rem))] flex-col overflow-hidden rounded-2xl border border-black/5 bg-white/95 text-[#12151c] shadow-[0_18px_44px_-18px_rgba(18,21,28,0.45)] backdrop-blur-md"
    >
      <header
        {...drag.headerProps}
        className={`${draggableHeader} flex items-center justify-between border-b border-[#eceef1] px-4 py-3`}
      >
        <PanelDragHandle label="Move agent setup panel" {...drag.handleProps} />
        <h2 id={titleId} className="text-sm font-semibold">
          Show your coding agent
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close agent setup"
          className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-[#8a909b] transition hover:bg-[#f4f5f7] hover:text-[#12151c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 text-[13px] leading-5 text-[#3f4552]">
        <p>
          People in your space see what your Claude Code, Codex or Cursor agent
          is doing on your avatar: the project, branch and commit, and the
          current step. Never your code or prompts.
        </p>

        {connected && (
          <p
            role="status"
            className="flex items-start gap-2 rounded-xl bg-[#ecfdf3] px-3 py-2.5 text-[#106b3a]"
          >
            <CircleCheck
              size={18}
              className="mt-px shrink-0"
              aria-hidden="true"
            />
            <span>
              <span className="font-semibold">
                Clario has received a connection.
              </span>{" "}
              Finish the approval or restart step below, then give your agent a
              task.
            </span>
          </p>
        )}
        {!command ? (
          <button
            type="button"
            onClick={() => void makeCommand()}
            disabled={creating}
            className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-[#3f4ae8] px-4 text-[14px] font-medium text-white transition hover:bg-[#3540d7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3f4ae8] active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none"
          >
            {creating && (
              <LoaderCircle
                size={16}
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            {creating ? "Making your command…" : "Get my setup command"}
          </button>
        ) : (
          <div className="space-y-2.5">
            <p className="font-medium text-[#12151c]">
              Run this once in the terminal, inside the project you want to
              share. It sets up every agent you have:
            </p>
            <ul
              aria-label="Agents it sets up"
              className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] font-medium text-[#3f4552]"
            >
              {AGENTS.map((agent) => (
                <li key={agent.id} className="flex items-center gap-1">
                  <PixelPet agent={agent.id} size={24} />
                  {agent.label}
                </li>
              ))}
            </ul>
            <div className="flex items-stretch gap-1.5">
              <code
                translate="no"
                className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-[#eceef1] bg-[#f6f7f9] px-2.5 py-2 font-mono text-[11.5px] text-[#12151c]"
              >
                {command}
              </code>
              <button
                type="button"
                onClick={() => void copy()}
                aria-label={copied ? "Copied" : "Copy the setup command"}
                className="grid w-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-[#eceef1] bg-white text-[#3f4552] transition hover:bg-[#f4f5f7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c] active:scale-95 motion-reduce:transition-none"
              >
                {copied ? (
                  <Check size={16} aria-hidden="true" />
                ) : (
                  <Copy size={16} aria-hidden="true" />
                )}
              </button>
            </div>
            <p className="text-[12px] text-[#3f4552]">
              Codex: review the Clario hooks in Settings → Hooks (or{" "}
              <code className="font-mono">/hooks</code> in the CLI). Cursor:
              restart it if it&apos;s open. Other tools such as Ember keep their
              own hooks.
            </p>
            <p className="text-[12px] text-[#5c6371]">
              This is your own key and it stays the same. Keep it private:
              anyone with it can post as your agent.
            </p>
            <p
              role="status"
              className="flex items-center gap-2 text-[12px] text-[#5c6371]"
            >
              <LoaderCircle
                size={14}
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              {connected
                ? "Connection detected; your command stays available for other agents."
                : "Waiting for a connection…"}
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="text-[12px] text-[#c9332f]">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
