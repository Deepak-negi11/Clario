"use client";

import { Footprints, Gamepad2, X } from "lucide-react";
import type { ReactNode } from "react";
import { useCompanions, type TalkerId } from "../../lib/companions/store";

// "Walk with me" and "Play a game" in Maya's and the AI coworkers' talk panels, shown while the
// 3D view is open (that is where they walk and play); while they are with you, what they are
// doing and a button to stop. Each button says its words in the chat, the same as typing them.
export function CompanionBar({ id, first, disabled, onSay }: { id: TalkerId; first: string; disabled?: boolean; onSay: (text: string) => void }) {
  const { open, modes } = useCompanions();
  if (!open) return null;
  const mode = modes[id];

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-[#eceef1] px-4 py-2">
      {mode && (
        <p role="status" className="mr-auto flex items-center gap-1.5 text-[12px] font-semibold text-[#12151c]">
          <span className="h-2 w-2 rounded-full bg-[#1f9d55] motion-safe:animate-pulse" aria-hidden="true" />
          {mode === "follow" ? `${first} is walking with you` : `${first} is playing with you`}
        </p>
      )}
      {!mode && (
        <Chip disabled={disabled} onClick={() => onSay("Walk with me")} icon={<Footprints size={13} aria-hidden="true" />}>
          Walk with me
        </Chip>
      )}
      {mode !== "play" && (
        <Chip disabled={disabled} onClick={() => onSay("Play a game")} icon={<Gamepad2 size={13} aria-hidden="true" />}>
          Play a game
        </Chip>
      )}
      {mode && (
        <Chip
          disabled={disabled}
          onClick={() => onSay(mode === "follow" ? "Stop following me" : "Stop playing")}
          icon={<X size={13} aria-hidden="true" />}
        >
          {mode === "follow" ? "Stop following" : "Stop playing"}
        </Chip>
      )}
    </div>
  );
}

function Chip({ disabled, onClick, icon, children }: { disabled?: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-[#e6e7ea] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#3b414c] transition hover:border-[#12151c]/30 hover:text-[#12151c] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]"
    >
      {icon}
      {children}
    </button>
  );
}
