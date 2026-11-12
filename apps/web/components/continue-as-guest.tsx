"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { getDemoSpace, joinAsGuest } from "../lib/auth-api";
import { saveAuthToken } from "../lib/auth-token";

// "Continue as guest" at the bottom of the sign-in and sign-up pages: one click, no account. The
// guest gets a name like "Guest 4821" (they can change it on the join screen) and goes to the
// space they were invited to (`next`), or else to the shared demo room.
export function ContinueAsGuest({ next }: { next: string | null }) {
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  async function join() {
    setError("");
    setJoining(true);
    try {
      const username = `Guest ${Math.floor(1000 + Math.random() * 9000)}`;
      const { token } = await joinAsGuest(username);
      saveAuthToken(token, true);
      localStorage.setItem("metaverse:username", username);
      router.push(next ?? `/space/${(await getDemoSpace(token)).spaceId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't join as a guest. Try again.");
      setJoining(false);
    }
  }

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={() => void join()}
        disabled={joining}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 border-2 border-[#111827] bg-white px-4 py-2 text-sm font-bold text-[#111827] shadow-[3px_3px_0_#183a8f] transition hover:translate-x-px hover:translate-y-px hover:bg-[#eef3fb] hover:shadow-[2px_2px_0_#183a8f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#183a8f] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
      >
        {joining ? "Joining..." : "Continue as guest"}
        {!joining && <ArrowRight size={17} aria-hidden="true" />}
      </button>
      <p className="mt-2 text-xs leading-5 text-[#52627b]">
        {next ? "No account needed: join the room you were invited to." : "No account needed: try Clario in the demo room."}
      </p>
      {error ? <p role="alert" className="mt-2 border border-[#b7483d] bg-[#fff4f2] px-3 py-2 text-sm text-[#8b2f29]">{error}</p> : null}
    </div>
  );
}
