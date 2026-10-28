"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { MISSIONS } from "@repo/shared";
import { MissionChat } from "../../../components/missions/mission-chat";
import { readShowXp } from "../../../lib/missions/progress";

export default function MissionPage() {
  const { id } = useParams<{ id: string }>();
  const index = MISSIONS.findIndex((mission) => mission.id === id);
  const mission = MISSIONS[index];
  const [showXp, setShowXp] = useState(true);

  useEffect(() => {
    setShowXp(readShowXp());
  }, []);

  if (!mission) notFound();
  const next = MISSIONS[index + 1];

  return (
    <main className="grid min-h-dvh grid-cols-[minmax(0,1fr)] place-items-center bg-[#1b1d2a] px-4 py-6">
      <div className="flex h-[min(52rem,calc(100dvh-3rem))] w-full max-w-2xl flex-col gap-3">
        <nav className="flex items-center justify-between text-xs text-white/70">
          <Link href="/missions" className="rounded underline-offset-2 hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
            All missions
          </Link>
          <span>Workplace Quest</span>
        </nav>
        <div className="min-h-0 flex-1">
          <MissionChat mission={mission} number={index + 1} showXp={showXp} nextHref={next ? `/missions/${next.id}` : "/missions"} />
        </div>
      </div>
    </main>
  );
}
