"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Eye, EyeOff, KeyRound, LoaderCircle, X } from "lucide-react";
import {
  AI_KEY_HEADER,
  AI_PROVIDERS,
  AI_PROVIDER_INFO,
  AiKeySchema,
  detectAiProvider,
  type AiModelsResponse,
  type AiProvider,
} from "@repo/shared";
import { clearStoredAi, readStoredAi, saveStoredAi } from "../../lib/ai/ai-settings";

// "Your AI key": a visitor pastes a key from NVIDIA, Google Gemini, Anthropic, OpenAI or OpenRouter.
// We guess the provider from the key, check the key and list its models (/api/ai/models), and they
// pick one. Saved in this browser only (lib/ai/ai-settings.ts). Shown over the coworker panel.

type KeyCheck = { state: "idle" } | { state: "checking" } | { state: "ok"; models: string[] } | { state: "error"; message: string };

const MANY_MODELS = 12;

export function AiSettingsDialog({ onClose }: { onClose: () => void }) {
  const [stored] = useState(readStoredAi);
  const [key, setKey] = useState(stored?.key ?? "");
  const [showKey, setShowKey] = useState(false);
  const [provider, setProvider] = useState<AiProvider | "">(stored?.provider ?? "");
  const [model, setModel] = useState(stored?.model ?? "");
  const [filter, setFilter] = useState("");
  const [remember, setRemember] = useState(stored?.remember ?? false);
  const [check, setCheck] = useState<KeyCheck>(stored ? { state: "ok", models: [stored.model] } : { state: "idle" });
  const titleId = useId();
  const keyId = useId();
  const providerId = useId();
  const modelId = useId();
  const keyRef = useRef<HTMLInputElement | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    keyRef.current?.focus();
    return () => requestRef.current?.abort();
  }, []);

  const keyValid = AiKeySchema.safeParse(key).success;
  const detected = detectAiProvider(key);
  const models = useMemo(() => (check.state === "ok" ? check.models : []), [check]);
  const shown = useMemo(() => {
    const words = filter.trim().toLowerCase();
    const matching = words ? models.filter((id) => id.toLowerCase().includes(words)) : models;
    // Keep the chosen model in the list even when the filter hides it.
    return model && !matching.includes(model) && models.includes(model) ? [model, ...matching] : matching;
  }, [models, filter, model]);
  const canSave = keyValid && !!provider && !!model && models.includes(model);

  function changeKey(next: string) {
    setKey(next);
    setCheck({ state: "idle" });
    setModel("");
    setFilter("");
    const guess = detectAiProvider(next);
    if (guess) setProvider(guess);
  }

  function changeProvider(next: AiProvider | "") {
    setProvider(next);
    setCheck({ state: "idle" });
    setModel("");
    setFilter("");
  }

  async function loadModels() {
    if (!keyValid || !provider) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setCheck({ state: "checking" });
    try {
      const response = await fetch("/api/ai/models", {
        method: "POST",
        headers: { "content-type": "application/json", [AI_KEY_HEADER]: key.trim() },
        body: JSON.stringify({ provider }),
        signal: controller.signal,
      });
      const body = (await response.json()) as AiModelsResponse & { error?: string };
      if (!response.ok) {
        setCheck({ state: "error", message: body.error ?? "That key didn't work." });
        return;
      }
      setCheck({ state: "ok", models: body.models });
      setModel(body.models.includes(model) ? model : body.suggested);
    } catch {
      if (!controller.signal.aborted) setCheck({ state: "error", message: "Couldn't reach the server. Try again." });
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  function save() {
    if (!canSave || !provider) return;
    saveStoredAi({ provider, model, key: key.trim(), remember });
    onClose();
  }

  function remove() {
    clearStoredAi();
    onClose();
  }

  const info = provider ? AI_PROVIDER_INFO[provider] : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="absolute inset-0 z-10 flex flex-col overflow-y-auto overscroll-contain bg-white"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation(); // close this, not the whole panel
        onClose();
      }}
    >
      <header className="flex items-center justify-between gap-2 border-b border-[#eceef1] px-4 py-3">
        <h2 id={titleId} className="flex items-center gap-2 text-sm font-semibold text-[#12151c]">
          <KeyRound size={15} aria-hidden="true" />
          Your AI key
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close AI settings"
          className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-[#5c6371] transition hover:bg-[#f4f5f7] hover:text-[#12151c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <form
        className="flex flex-1 flex-col gap-4 px-4 py-4 text-[13px] text-[#12151c]"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) save();
          else void loadModels();
        }}
      >
        <p className="leading-5 text-[#3b414c]">
          Power the coworkers with your own AI: paste a key from NVIDIA, Google Gemini, Anthropic, OpenAI or OpenRouter. Without one,
          they use the site&apos;s free AI.
        </p>

        <div>
          <label htmlFor={keyId} className="text-[12px] font-semibold">
            API key
          </label>
          <div className="mt-1 flex items-center gap-1.5">
            <input
              id={keyId}
              ref={keyRef}
              name="ai-key"
              type={showKey ? "text" : "password"}
              value={key}
              onChange={(event) => changeKey(event.target.value)}
              placeholder="Paste your key…"
              autoComplete="off"
              spellCheck={false}
              aria-describedby={`${keyId}-hint`}
              className="min-w-0 flex-1 rounded-xl border border-[#e6e7ea] bg-[#f7f8fa] px-3 py-2 font-mono text-[12px] outline-none transition placeholder:font-sans placeholder:text-[#6b7280] focus:border-[#12151c]/30 focus:bg-white"
            />
            <button
              type="button"
              onClick={() => setShowKey((current) => !current)}
              aria-label={showKey ? "Hide key" : "Show key"}
              aria-pressed={showKey}
              className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-xl bg-[#f1f3f6] text-[#12151c] transition hover:bg-[#e6e8ec] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12151c]"
            >
              {showKey ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
            </button>
          </div>
          <p id={`${keyId}-hint`} className="mt-1 text-[11px] text-[#5c6371]" aria-live="polite">
            {!key.trim()
              ? "We'll spot which company it's from."
              : detected
                ? `Looks like a ${AI_PROVIDER_INFO[detected].label} key.`
                : keyValid
                  ? "We can't tell whose key this is. Pick the provider below."
                  : "That doesn't look like a whole API key yet."}
          </p>
        </div>

        <div>
          <label htmlFor={providerId} className="text-[12px] font-semibold">
            Provider
          </label>
          <select
            id={providerId}
            value={provider}
            onChange={(event) => changeProvider(event.target.value as AiProvider | "")}
            className="mt-1 w-full cursor-pointer rounded-xl border border-[#e6e7ea] bg-[#f7f8fa] px-3 py-2 text-[13px] text-[#12151c] outline-none focus:border-[#12151c]/30 focus:bg-white"
          >
            <option value="">Choose…</option>
            {AI_PROVIDERS.map((id) => (
              <option key={id} value={id}>
                {AI_PROVIDER_INFO[id].label}
              </option>
            ))}
          </select>
          {info && (
            <a
              href={info.keyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block rounded text-[11px] font-semibold text-[#3a6ee8] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]"
            >
              Get a {info.label} key ({info.keyHint})
            </a>
          )}
        </div>

        {check.state !== "ok" && (
          <button
            type="button"
            onClick={() => void loadModels()}
            disabled={!keyValid || !provider || check.state === "checking"}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#12151c] px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-black active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#e6e7ea] disabled:text-[#6b7280] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12151c]"
          >
            {check.state === "checking" && <LoaderCircle size={14} className="motion-safe:animate-spin" aria-hidden="true" />}
            {check.state === "checking" ? "Checking the key…" : "Check key and load models"}
          </button>
        )}
        {check.state === "error" && (
          <p role="alert" className="rounded-xl bg-[#fdecec] px-3 py-2 text-[12px] leading-5 text-[#b42318]">
            {check.message}
          </p>
        )}

        {check.state === "ok" && (
          <div>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={modelId} className="flex items-center gap-1.5 text-[12px] font-semibold">
                <Check size={13} className="text-[#17663d]" aria-hidden="true" />
                Model <span className="font-normal text-[#5c6371]">({models.length} available)</span>
              </label>
              <button
                type="button"
                onClick={() => void loadModels()}
                className="cursor-pointer rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-[#3a6ee8] transition hover:bg-[#eef3fd] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]"
              >
                Refresh list
              </button>
            </div>
            {models.length > MANY_MODELS && (
              <input
                type="search"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter models…"
                aria-label="Filter models"
                autoComplete="off"
                spellCheck={false}
                className="mt-1 w-full rounded-xl border border-[#e6e7ea] bg-[#f7f8fa] px-3 py-1.5 text-[12px] outline-none placeholder:text-[#6b7280] focus:border-[#12151c]/30 focus:bg-white"
              />
            )}
            <select
              id={modelId}
              value={model}
              onChange={(event) => setModel(event.target.value)}
              className="mt-1 w-full cursor-pointer rounded-xl border border-[#e6e7ea] bg-[#f7f8fa] px-3 py-2 font-mono text-[12px] text-[#12151c] outline-none focus:border-[#12151c]/30 focus:bg-white"
            >
              {!model && <option value="">Choose a model…</option>}
              {shown.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-[#5c6371]">Smaller, faster models make snappier coworkers.</p>
          </div>
        )}

        <label className="flex cursor-pointer items-start gap-2 text-[12px] leading-5 text-[#3b414c]">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            className="mt-1 h-3.5 w-3.5 cursor-pointer accent-[#12151c]"
          />
          <span>
            <span className="font-semibold text-[#12151c]">Remember on this device.</span>
            {" Off: the key is forgotten when you close this tab. Don't tick this on a shared computer."}
          </span>
        </label>

        <p className="rounded-xl bg-[#f7f8fa] px-3 py-2 text-[11px] leading-[1.45] text-[#4a505e]">
          Your key stays in this browser. Each chat sends it to {info?.label ?? "your provider"} through our server, which uses it for
          that one reply and never saves or logs it. You pay your provider for what you use.
        </p>

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          {stored ? (
            <button
              type="button"
              onClick={remove}
              className="cursor-pointer rounded-lg px-2 py-1.5 text-[12px] font-semibold text-[#b42318] transition hover:bg-[#fdecec] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]"
            >
              Remove my key
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-xl px-3 py-2 text-[13px] font-semibold text-[#5c6371] transition hover:bg-[#f4f5f7] hover:text-[#12151c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="cursor-pointer rounded-xl bg-[#12151c] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-black active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#e6e7ea] disabled:text-[#6b7280] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12151c]"
            >
              Save
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
