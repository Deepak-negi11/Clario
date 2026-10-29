"use client";

// TEMPORARY preview for checking bikes and drinks without signing in; delete after review.
// ?x=&y= where you stand, ?prop=bike:orange | can:lime:0 what you have, ?bot=x,y,bike:teal someone
// else, ?view=3d the 3D view, ?zoom= the 2D zoom. E, Q and the arrows work as in a space.
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { PlayerProp } from "@repo/shared";
import { createSceneBridge } from "../../components/phaser/scene-bridge";

const PhaserGame = dynamic(() => import("../../components/phaser/phaser-game").then((m) => m.PhaserGame), { ssr: false });
const Office3D = dynamic(() => import("../../components/space-3d/office-3d").then((m) => m.Office3D), { ssr: false });

function parseProp(text: string | null): PlayerProp | null {
  if (!text) return null;
  const [kind, a, b] = text.split(":");
  if (kind === "bike") return { kind: "bike", bike: a as "orange" | "teal" };
  if (kind === "can") return { kind: "can", drink: a as "orange" | "cola" | "lime" | "berry", sips: Number(b ?? 0) };
  return null;
}

export default function PropsPreview() {
  const [params, setParams] = useState<URLSearchParams | null>(null);
  useEffect(() => setParams(new URLSearchParams(window.location.search)), []);
  return <main className="relative h-screen w-screen overflow-hidden bg-neutral-950">{params && <Preview params={params} />}</main>;
}

function Preview({ params }: { params: URLSearchParams }) {
  const selfRef = useRef({ x: Number(params.get("x") ?? 22), y: Number(params.get("y") ?? 16) });
  const bot = params.get("bot")?.split(",");
  const othersRef = useRef<Record<string, { x: number; y: number }>>(bot ? { bot: { x: Number(bot[0]), y: Number(bot[1]) } } : {});
  const namesRef = useRef<Record<string, string>>({ me: "deepak", bot: "Tester B" });
  const moveRef = useRef((next: { x: number; y: number }) => { selfRef.current = next; });
  const bridgeRef = useRef(createSceneBridge());
  const bridge = bridgeRef.current;
  if (!bridge.setProp) {
    const props: Record<string, PlayerProp> = {};
    const mine = parseProp(params.get("prop"));
    if (mine) props.me = mine;
    const theirs = parseProp(bot?.[2] ?? null);
    if (theirs) props.bot = theirs;
    bridge.props = props;
    bridge.setProp = (prop) => {
      const next = { ...bridge.props };
      if (prop) next.me = prop; else delete next.me;
      bridge.props = next;
    };
  }
  useEffect(() => { (window as unknown as { __bridge: typeof bridgeRef; __self: typeof selfRef }).__bridge = bridgeRef; (window as unknown as { __self: typeof selfRef }).__self = selfRef; }, []);
  return (
    <>
      <PhaserGame mapTemplate="clario-hq" selfRef={selfRef} othersRef={othersRef} namesRef={namesRef} moveRef={moveRef} bridgeRef={bridgeRef} selfId="me" onReady={() => {}} />
      {params.get("view") === "3d" && <Office3D selfId="me" selfRef={selfRef} othersRef={othersRef} namesRef={namesRef} onClose={() => {}} onWalkTo={(x, y) => bridgeRef.current.walkTo?.(x, y)} bridgeRef={bridgeRef} />}
    </>
  );
}
