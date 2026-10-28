"use client";

import { useEffect, useState } from "react";
import { Mic, MicOff, Video, VideoOff, MonitorUp, MonitorX, Smile } from "lucide-react";
import type { AvatarLook } from "@repo/shared";
import { originalLook } from "../../lib/avatar/recolor";
import { readSavedLook } from "../../lib/avatar/saved-look";
import { AvatarPicker } from "./avatar-picker";

type ControlBarProps = {
  displayName?: string;
  /** Your current avatar look, or null for the default character. */
  look?: AvatarLook | null;
  onUpdateLook?: (look: AvatarLook) => Promise<void>;
  onReact?: (emoji: string) => void;
  micOn?: boolean;
  camOn?: boolean;
  screenOn?: boolean;
  onToggleMic?: () => void;
  onToggleCam?: () => void;
  onToggleScreen?: () => void;
  onUpdateName?: (newName: string) => Promise<void>;
};

const REACTION_EMOJIS = ["👋", "👍", "❤️", "😂", "🎉", "🙌", "🔥", "👏"];

// The dark toolbar at the bottom of a space: your name, mic, camera, screen and reactions.
export function ControlBar({
  displayName = "You",
  look = null,
  onUpdateLook,
  onReact,
  micOn: micProp,
  camOn: camProp,
  screenOn: screenProp,
  onToggleMic,
  onToggleCam,
  onToggleScreen,
  onUpdateName,
}: ControlBarProps) {
  const [localMic, setLocalMic] = useState(true);
  const [localCam, setLocalCam] = useState(true);
  const [localScreen, setLocalScreen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState(displayName);
  const [draftLook, setDraftLook] = useState<AvatarLook>(() => originalLook("adam"));
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setNewName(displayName);
  }, [displayName]);

  const micOn = micProp ?? localMic;
  const camOn = camProp ?? localCam;
  const screenOn = screenProp ?? localScreen;
  const toggleMic = onToggleMic ?? (() => setLocalMic((v) => !v));
  const toggleCam = onToggleCam ?? (() => setLocalCam((v) => !v));
  const toggleScreen = onToggleScreen ?? (() => setLocalScreen((v) => !v));

  const initial = displayName.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-50 flex justify-center px-3">
      {isEditingName && (
        <div className="pointer-events-auto fixed inset-0 z-[80] flex items-center justify-center bg-[#12151c]/45 backdrop-blur-xs">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const name = newName.trim();
              const lookChanged = JSON.stringify(draftLook) !== JSON.stringify(look ?? originalLook("adam"));
              setIsSaving(true);
              setSaveError(null);
              try {
                if (name && name !== displayName && onUpdateName) await onUpdateName(name);
                if (lookChanged && onUpdateLook) await onUpdateLook(draftLook);
                setIsEditingName(false);
              } catch {
                setSaveError("Couldn't save. Check your connection and try again.");
              } finally {
                setIsSaving(false);
              }
            }}
            className="flex max-h-[calc(100dvh-2rem)] w-full max-w-sm flex-col gap-4 overflow-y-auto rounded-2xl border border-black/5 bg-white p-6 text-[#12151c] shadow-[0_24px_60px_-28px_rgba(24,32,56,0.45)]"
          >
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold">Edit profile</h3>
              <p className="text-xs text-[#8a909b]">Your avatar and the name people see above it.</p>
            </div>
            {onUpdateLook && <AvatarPicker look={draftLook} onChange={setDraftLook} />}
            <label className="-mb-2.5 text-xs font-medium text-[#5c6371]" htmlFor="display-name">Display name</label>
            <input
              id="display-name"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Display name"
              maxLength={25}
              required
              autoFocus
              autoComplete="nickname"
              className="w-full rounded-xl border border-[#e6e7ea] bg-[#f7f8fa] px-3.5 py-2.5 text-sm outline-none transition placeholder:text-[#8a909b] focus:border-[#12151c]/30 focus:bg-white"
            />
            <div className="flex justify-end gap-2 text-sm">
              <button
                type="button"
                onClick={() => setIsEditingName(false)}
                className="cursor-pointer rounded-xl px-4 py-2 font-semibold text-[#5c6371] transition hover:bg-[#f4f5f7] hover:text-[#12151c]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="cursor-pointer rounded-xl bg-[#12151c] px-4 py-2 font-semibold text-white transition hover:bg-black active:scale-95 disabled:cursor-wait disabled:opacity-60"
              >
                {isSaving ? "Saving…" : "Save"}
              </button>
            </div>
            {saveError && <p role="alert" className="-mt-2 text-xs text-red-600">{saveError}</p>}
          </form>
        </div>
      )}

      <div className="pointer-events-auto flex max-w-full items-center gap-1 rounded-2xl bg-[#1b1d2a]/95 p-1.5 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.6)] ring-1 ring-white/10 backdrop-blur-md">
        <button
          type="button"
          onClick={() => {
            setNewName(displayName);
            setDraftLook(look ?? readSavedLook() ?? originalLook("adam"));
            setSaveError(null);
            setIsEditingName(true);
          }}
          className="flex h-10 cursor-pointer items-center gap-2 rounded-xl pl-1.5 pr-3 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          title={onUpdateLook ? "Change avatar and name" : "Change display name"}
          aria-label={`${displayName}, ${onUpdateLook ? "change avatar and name" : "change display name"}`}
        >
          <span className="relative grid h-7 w-7 place-items-center rounded-full bg-[#3a6ee8] text-xs">
            {initial}
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#1b1d2a] bg-[#22c55e]" aria-hidden="true" />
          </span>
          <span className="hidden max-w-[9rem] truncate sm:inline">{displayName}</span>
        </button>

        <div className="mx-1 h-6 w-px bg-white/10" aria-hidden="true" />

        <ControlButton label={micOn ? "Mute microphone" : "Unmute microphone"} pressed={micOn} off={!micOn} onClick={toggleMic}>
          {micOn ? <Mic size={18} /> : <MicOff size={18} />}
        </ControlButton>
        <ControlButton label={camOn ? "Turn camera off" : "Turn camera on"} pressed={camOn} off={!camOn} onClick={toggleCam}>
          {camOn ? <Video size={18} /> : <VideoOff size={18} />}
        </ControlButton>
        <ControlButton label={screenOn ? "Stop screen sharing" : "Share your screen"} pressed={screenOn} live={screenOn} onClick={toggleScreen}>
          {screenOn ? <MonitorX size={18} /> : <MonitorUp size={18} />}
        </ControlButton>

        <div className="relative">
          {pickerOpen && (
            <div className="absolute bottom-13 left-1/2 flex -translate-x-1/2 gap-1 rounded-xl bg-[#1b1d2a]/95 p-2 shadow-2xl ring-1 ring-white/10 backdrop-blur-md">
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onReact?.(emoji);
                    setPickerOpen(false);
                  }}
                  aria-label={`React with ${emoji}`}
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-xl transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
          <ControlButton label="Send a reaction" pressed={pickerOpen} onClick={() => setPickerOpen((v) => !v)}>
            <Smile size={18} />
          </ControlButton>
        </div>
      </div>
    </div>
  );
}

type ControlButtonProps = {
  label: string;
  pressed?: boolean;
  off?: boolean;
  live?: boolean;
  onClick: () => void;
  children: React.ReactNode;
};

function ControlButton({ label, pressed, off, live, onClick, children }: ControlButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={
        "flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-white transition active:scale-95 motion-reduce:transition-none " +
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white " +
        (off
          ? "bg-[#e5484d] hover:bg-[#d23c41]"
          : live
            ? "bg-[#22a861] hover:bg-[#1d9554]"
            : pressed
              ? "bg-white/[0.16] hover:bg-white/[0.22]"
              : "bg-white/[0.06] hover:bg-white/[0.14]")
      }
    >
      {children}
    </button>
  );
}
