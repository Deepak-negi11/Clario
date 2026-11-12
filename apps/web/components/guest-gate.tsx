"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { ArrowRight } from "lucide-react";
import { BrandLogo } from "./brand-logo";
import { TextField } from "./TextField";
import { joinAsGuest } from "../lib/auth-api";
import { saveAuthToken } from "../lib/auth-token";
import { authLink } from "../lib/next-path";

// Shown when someone opens a space's link without being signed in: they can walk in as a guest
// with just a name (the server's POST /api/v1/guest), or sign in or up and come back to this space.
export function GuestGate({ spacePath, onJoined }: { spacePath: string; onJoined: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const username = name.trim();
    if (!username) return;
    setError("");
    setJoining(true);
    try {
      const { token } = await joinAsGuest(username);
      saveAuthToken(token, true);
      localStorage.setItem("metaverse:username", username);
      onJoined();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't join. Try again.");
      setJoining(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#dbe8f8] p-4 sm:p-7">
      <div className="w-full max-w-md border-2 border-[#111827] bg-[#f8fbff] p-6 shadow-[8px_8px_0_#183a8f] sm:p-8">
        <Link href="/" aria-label="Back to Clario home" className="inline-flex items-center gap-2 text-[#183a8f] transition-opacity hover:opacity-75">
          <span aria-hidden="true">←</span>
          <BrandLogo markSize={26} className="text-[1.35rem] text-[#111827]" />
        </Link>
        <p className="mt-9 font-mono text-xs font-bold tracking-[0.1em] text-[#183a8f]">YOU&apos;RE INVITED</p>
        <h1 className="mt-2 text-4xl font-bold tracking-[-0.05em] text-[#111827]">Join the room.</h1>
        <p className="mt-3 max-w-sm text-sm leading-6 text-[#52627b]">
          No account needed. Pick a name, then walk over to people to talk. Your mic and camera stay off until you turn them on.
        </p>

        <form className="mt-7 flex flex-col gap-5" onSubmit={handleSubmit}>
          <TextField
            id="guest-name"
            label="Your name"
            autoComplete="nickname"
            maxLength={40}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />

          {error ? <p className="border border-[#b7483d] bg-[#fff4f2] px-3 py-2 text-sm text-[#8b2f29]">{error}</p> : null}

          <button
            type="submit"
            disabled={joining || !name.trim()}
            className="mt-1 inline-flex min-h-11 items-center justify-center gap-2 bg-[#183a8f] px-4 py-2 text-sm font-bold text-white shadow-[3px_3px_0_#111827] transition hover:translate-x-px hover:translate-y-px hover:bg-[#2451b2] hover:shadow-[2px_2px_0_#111827] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#183a8f] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
          >
            {joining ? "Joining..." : "Join as guest"}
            {!joining && <ArrowRight size={17} aria-hidden="true" />}
          </button>
        </form>

        <p className="mt-4 text-xs leading-5 text-[#52627b]">
          Guests can move, talk, chat and share their screen. Create a free account to make your own space, chat with the AI coworkers
          or send email.
        </p>
        <p className="mt-6 border-t border-[#b9c7d9] pt-5 text-sm text-[#52627b]">
          Have an account?{" "}
          <Link href={authLink("/signin", spacePath)} className="font-bold text-[#183a8f] underline decoration-[#8da6c9] underline-offset-4 hover:text-[#111827]">
            Sign in
          </Link>
          {" or "}
          <Link href={authLink("/signup", spacePath)} className="font-bold text-[#183a8f] underline decoration-[#8da6c9] underline-offset-4 hover:text-[#111827]">
            create one
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
