"use client";

import { Globe, LogOut, X } from "lucide-react";
import type { TetrisOnline } from "./tetris-online";

// Under the Tetris mode buttons when you play online: invite someone in the space, wait for them,
// then who you're playing and a way out.

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffe066]";
const chip = `inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-white/15 px-2.5 text-[13px] text-[#e4e6f0] transition hover:border-[#ffe066]/70 hover:text-white motion-reduce:transition-none ${focusRing}`;
const quiet = `inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-white/[0.07] px-3 text-[12.5px] font-semibold text-[#c9cde0] transition hover:bg-white/[0.14] hover:text-white motion-reduce:transition-none ${focusRing}`;

export function TetrisOnlinePanel({ online, playing }: { online: TetrisOnline; playing: boolean }) {
  const { partner, invited, people, notice } = online;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 px-2.5 py-2 text-[13px] text-[#c9cde0]" role="status" aria-live="polite">
      <Globe size={15} aria-hidden="true" className="shrink-0 text-[#ffe066]" />
      {partner ? (
        <>
          <span>
            Versus <strong className="font-semibold text-white">{partner.name}</strong> online.{" "}
            {playing ? "Same pieces for both; clear 2+ lines to send garbage." : "Press Start when you're both ready."}
          </span>
          <button type="button" onClick={online.leave} className={`${quiet} ml-auto`}>
            <LogOut size={14} aria-hidden="true" /> Leave
          </button>
        </>
      ) : invited ? (
        <>
          <span>Waiting for {invited.name}…</span>
          <button type="button" onClick={online.leave} className={`${quiet} ml-auto`}>
            <X size={14} aria-hidden="true" /> Cancel
          </button>
        </>
      ) : people.length === 0 ? (
        <span>No one else is in this space right now. Ask a colleague to come by the Game Room.</span>
      ) : (
        <>
          <span className="mr-1">Invite someone in this space:</span>
          <ul className="flex flex-wrap gap-1.5" aria-label="Invite to Tetris">
            {people.map((person) => (
              <li key={person.id}>
                <button type="button" onClick={() => online.invite(person)} className={chip}>
                  <span className="max-w-[9rem] truncate font-medium">{person.name}</span>
                  <span className="text-[12px] font-semibold text-[#ffe066]">Invite</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {notice && !partner && !invited && <span className="w-full text-[12.5px] text-[#a9aec4]">{notice}</span>}
    </div>
  );
}
