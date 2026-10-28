"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

// The Practice Session without the map: same panel as talking to Maya in the office, reachable
// with the keyboard and a screen reader. Loaded in the browser only (speech APIs and storage).
const PracticeSession = dynamic(
  () => import("../../components/practice-session/practice-session").then((module) => module.PracticeSession),
  {
    ssr: false,
    loading: () => <div className="h-full animate-pulse rounded-2xl bg-white/70" aria-hidden="true" />,
  },
);

export default function PracticePage() {
  return (
    <main className="grid min-h-dvh grid-cols-[minmax(0,1fr)] place-items-center bg-[#1b1d2a] px-4 py-6">
      <div className="flex h-[min(46rem,calc(100dvh-3rem))] w-full max-w-md flex-col gap-3">
        <nav className="flex items-center justify-between text-xs text-white/70">
          <Link href="/spaces" className="rounded underline-offset-2 hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
            Back to spaces
          </Link>
          <span>Practice Session</span>
        </nav>
        <div className="min-h-0 flex-1">
          <PracticeSession />
        </div>
      </div>
    </main>
  );
}
