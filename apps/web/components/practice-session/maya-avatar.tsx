"use client";

import { useEffect, useRef, useState } from "react";
import type { MentorState } from "@repo/shared";
import { useMicLevel } from "../../hooks/use-mic-level";

// Maya's portrait: pixel art drawn in code, in the colours of her sprite on the map
// (the "amelia" character). Eyes blink, the mouth moves while she speaks, and a ring grows
// with the learner's voice while she listens.

const PALETTE: Record<string, string> = {
  H: "#7b4f33", // hair
  S: "#e8b28c", // skin
  s: "#c98d68", // skin in shadow
  N: "#d9a07b", // neck
  T: "#c4456d", // top
  t: "#a3375a", // top in shadow
  C: "#f8e9ee", // collar
};

// Left half of a 20 x 22 grid; each row is mirrored to make the right half.
const HALF_ROWS = [
  "......HHHH",
  "....HHHHHH",
  "...HHHHHHH",
  "..HHHHHHHH",
  "..HHHHHHHH",
  "..HHHHHSSS",
  "..HHHSSSSS",
  "..HHSSSSSS",
  "..HHSSSSSS",
  ".HHHSSSSSS",
  ".HHHSSSSSS",
  ".HHHSSSSSS",
  ".HHHHSSSSS",
  ".HHHHHSSSS",
  ".HHHHHHHss",
  ".HHHHHHHNN",
  ".HHHTTTTCN",
  "TTTTTTTTTC",
  "TTTTTTTTTT",
  "TTTTTTTTTT",
  "tTTTTTTTTT",
  "tTTTTTTTTT",
];

type Pixel = { x: number; y: number; color: string };

const BASE: Pixel[] = HALF_ROWS.flatMap((half, y) => {
  const row = half + [...half].reverse().join("");
  return [...row].flatMap((key, x) => (PALETTE[key] ? [{ x, y, color: PALETTE[key]! }] : []));
});

const INK = "#2a2230";
const LIGHT = "#fbfaf7";
const LIPS = "#b4505a";
const MOUTH = "#6b2333";
const TONGUE = "#e2777e";

type Mouth = "closed" | "mid" | "open";
type Rect = [x: number, y: number, w: number, h: number, color: string];

function eyes(state: MentorState, blinking: boolean): Rect[] {
  if (blinking) return [[6, 9, 2, 1, INK], [12, 9, 2, 1, INK]];
  if (state === "thinking") {
    // Looking up while she thinks.
    return [[6, 8, 2, 1, INK], [12, 8, 2, 1, INK], [6, 9, 2, 1, LIGHT], [12, 9, 2, 1, LIGHT]];
  }
  return [
    [6, 8, 1, 2, INK], [7, 9, 1, 1, INK], [7, 8, 1, 1, LIGHT],
    [12, 8, 1, 2, INK], [13, 9, 1, 1, INK], [13, 8, 1, 1, LIGHT],
  ];
}

const MOUTHS: Record<Mouth, Rect[]> = {
  closed: [[8, 11, 1, 1, LIPS], [9, 12, 2, 1, LIPS], [11, 11, 1, 1, LIPS]],
  mid: [[9, 11, 2, 2, MOUTH]],
  open: [[8, 11, 4, 2, MOUTH], [9, 13, 2, 1, MOUTH], [9, 12, 2, 1, TONGUE]],
};

const DETAILS: Rect[] = [
  [6, 6, 2, 1, PALETTE.H!], [12, 6, 2, 1, PALETTE.H!], // brows
  [5, 11, 1, 1, "#ef8f8f"], [14, 11, 1, 1, "#ef8f8f"], // cheeks
  [5, 2, 2, 1, "#9a6844"], [4, 3, 1, 1, "#9a6844"], // hair shine
];

const TALKING: Mouth[] = ["open", "mid", "closed", "open", "mid", "open", "closed"];

type MayaAvatarProps = {
  state: MentorState;
  size?: number;
};

export function MayaAvatar({ state, size = 96 }: MayaAvatarProps) {
  const [talkingMouth, setTalkingMouth] = useState<Mouth>("open");
  const [blinking, setBlinking] = useState(false);
  const ringRef = useRef<HTMLSpanElement | null>(null);
  const mouth = state === "speaking" ? talkingMouth : "closed";

  useMicLevel(state === "listening", (level) => {
    ringRef.current?.style.setProperty("--level", level.toFixed(3));
  });

  // The browser can't tell us when each sound is made (not every voice even reports words),
  // so the mouth runs on a slightly random timer while she speaks.
  useEffect(() => {
    if (state !== "speaking") return;
    let step = 0;
    const timer = window.setInterval(() => {
      step += 1 + Math.floor(Math.random() * 2);
      setTalkingMouth(TALKING[step % TALKING.length]!);
    }, 130);
    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(() => {
    let timer = 0;
    const scheduleBlink = () => {
      timer = window.setTimeout(() => {
        setBlinking(true);
        timer = window.setTimeout(() => {
          setBlinking(false);
          scheduleBlink();
        }, 140);
      }, 2400 + Math.random() * 2600);
    };
    scheduleBlink();
    return () => window.clearTimeout(timer);
  }, []);

  const overlay = [...DETAILS, ...eyes(state, blinking), ...MOUTHS[mouth]];

  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }} aria-hidden="true">
      <span
        ref={ringRef}
        className={`absolute inset-0 rounded-2xl border-2 transition-[transform,border-color,opacity] duration-100 ${
          state === "listening" ? "border-[#b8325e] opacity-100" : "border-transparent opacity-0"
        }`}
        style={{ transform: "scale(calc(1 + var(--level, 0) * 0.12))" }}
      />
      <span className="absolute inset-[3px] overflow-hidden rounded-[14px] bg-[#dfe9f1]">
        <svg
          viewBox="0 0 20 22"
          className="absolute bottom-0 left-1/2 h-[92%] -translate-x-1/2"
          shapeRendering="crispEdges"
        >
          {BASE.map((pixel) => (
            <rect key={`${pixel.x},${pixel.y}`} x={pixel.x} y={pixel.y} width={1} height={1} fill={pixel.color} />
          ))}
          {overlay.map(([x, y, w, h, color], index) => (
            <rect key={`o${index}`} x={x} y={y} width={w} height={h} fill={color} />
          ))}
        </svg>
      </span>
      {state === "thinking" && (
        <span className="absolute -right-1 -top-1 flex gap-0.5 rounded-full bg-white px-1.5 py-1 shadow-sm ring-1 ring-black/5">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="h-1 w-1 rounded-full bg-[#5c6371] motion-safe:animate-bounce"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </span>
      )}
    </span>
  );
}
