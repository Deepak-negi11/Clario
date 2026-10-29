"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImageUp, LoaderCircle, RotateCcw } from "lucide-react";
import { AVATAR_BASES, type AvatarBase, type AvatarLook, type HairShape } from "@repo/shared";
import { readPhoto } from "../../lib/avatar/photo-detect";
import { FRAME_HEIGHT, FRAME_WIDTH, originalLook, recolorSheet, sheetUrl } from "../../lib/avatar/recolor";

const STYLE_LABELS: Record<AvatarBase, string> = {
  adam: "Messy hair",
  alex: "Side part",
  amelia: "Long hair",
  bob: "Short hair",
};

const SWATCHES = {
  skin: ["#ffd9c2", "#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#5c3a21"],
  hair: ["#2b2321", "#4e3629", "#8a5a33", "#d1a55f", "#a3a3a3", "#b8433a"],
  top: ["#805e8e", "#3f6fd8", "#2f9d6a", "#e0a43a", "#d9534f", "#2d3142"],
} as const;

const PART_LABELS = { skin: "Skin", hair: "Hair", top: "Top" } as const;
type Part = keyof typeof SWATCHES;

// Painted onto the character; a photo turns them on when it shows them.
const FACE_DETAILS = [
  { key: "glasses", label: "Glasses" },
  { key: "beard", label: "Beard" },
] as const;

// Changes to the style's own hair. "As styled" keeps it.
const HAIR_SHAPES: { value: HairShape | undefined; label: string }[] = [
  { value: undefined, label: "As styled" },
  { value: "bald", label: "Shaved" },
  { value: "curly", label: "Curly" },
  { value: "bun", label: "Bun" },
];
const SHAPE_NAMES: Record<HairShape, string> = { bald: "shaved head", curly: "curly hair", bun: "bun" };

// Walking-down frames of the character sheet (see the "walk-down" animation in the map).
const WALK_DOWN = [18, 19, 20, 21, 22, 23];
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

function useSheets() {
  const [sheets, setSheets] = useState<Partial<Record<AvatarBase, HTMLImageElement>>>({});
  useEffect(() => {
    let cancelled = false;
    for (const base of AVATAR_BASES) {
      const image = new Image();
      image.src = sheetUrl(base);
      image.decode().then(
        () => !cancelled && setSheets((current) => ({ ...current, [base]: image })),
        () => undefined,
      );
    }
    return () => {
      cancelled = true;
    };
  }, []);
  return sheets;
}

// One frame of a character sheet, scaled up. Without a label it is decorative (its button names it).
function Character({ sheet, frame, scale, label }: { sheet: HTMLCanvasElement | null; frame: number; scale: number; label?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    if (sheet) ctx.drawImage(sheet, frame * FRAME_WIDTH, 0, FRAME_WIDTH, FRAME_HEIGHT, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
  }, [sheet, frame]);
  return (
    <canvas
      ref={ref}
      width={FRAME_WIDTH}
      height={FRAME_HEIGHT}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      style={{ width: FRAME_WIDTH * scale, height: FRAME_HEIGHT * scale }}
      className="[image-rendering:pixelated]"
    />
  );
}

export function AvatarPicker({ look, onChange }: { look: AvatarLook; onChange: (look: AvatarLook) => void }) {
  const sheets = useSheets();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [stage, setStage] = useState<"loading" | "reading" | null>(null);
  const reading = stage !== null;
  const [note, setNote] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  // The photo, shown beside the avatar to compare. It stays in this browser tab.
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  // Every style in the current colours, so the style buttons preview the result.
  const recolored = useMemo(() => {
    const out: Partial<Record<AvatarBase, HTMLCanvasElement>> = {};
    for (const base of AVATAR_BASES) {
      const sheet = sheets[base];
      if (sheet) out[base] = recolorSheet(sheet, sheet.naturalWidth, sheet.naturalHeight, { ...look, base });
    }
    return out;
  }, [sheets, look]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setFrameIndex((index) => (index + 1) % WALK_DOWN.length), 130);
    return () => window.clearInterval(timer);
  }, []);

  async function matchPhoto(file: File) {
    if (file.size > MAX_PHOTO_BYTES) {
      setNote({ tone: "warn", text: "That photo is too large. Try one under 15 MB." });
      return;
    }
    setStage("reading");
    setNote(null);
    setPhotoUrl(URL.createObjectURL(file));
    try {
      const result = await readPhoto(file, setStage);
      if (result.method === "none") {
        setNote({ tone: "warn", text: "Couldn't find a face in that photo. Try a clear, front-facing one, or pick below." });
        return;
      }
      const photo = result.look;
      const hairShape = result.method === "detected" ? result.look.hairShape : null;
      onChange({
        base: photo.style ?? look.base,
        skin: photo.skin,
        hair: photo.hair ?? look.hair,
        top: photo.top ?? look.top,
        glasses: photo.glasses,
        beard: photo.beard,
        ...(hairShape ? { hairShape } : {}),
      });
      // Say what was read, so a wrong guess is easy to spot and undo below.
      const found = [
        "skin",
        photo.hair && "hair colour",
        hairShape ? SHAPE_NAMES[hairShape] : photo.style && `hairstyle (${STYLE_LABELS[photo.style].toLowerCase()})`,
        photo.glasses && "glasses",
        photo.beard && "beard",
        photo.top && "top",
      ].filter((item): item is string => Boolean(item));
      const list = found.length > 1 ? `${found.slice(0, -1).join(", ")} and ${found.at(-1)}` : found[0];
      const how = result.method === "colours" ? " Face detection couldn't load, so this is from colours only." : "";
      setNote({ tone: result.method === "detected" ? "ok" : "warn", text: `From your photo: ${list}.${how} Change anything below.` });
    } catch {
      setNote({ tone: "warn", text: "That file couldn't be read as an image." });
    } finally {
      setStage(null);
    }
  }

  return (
    <div className="mb-5 rounded-[14px] border border-[#e1e1e1] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-start gap-4">
        <div className="relative grid h-[136px] w-[88px] shrink-0 place-items-center rounded-[10px] bg-[#eef0f6]">
          <Character sheet={recolored[look.base] ?? null} frame={WALK_DOWN[frameIndex]!} scale={4} label="Your avatar" />
          {photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- a local blob URL, which next/image can't optimise
            <img
              src={photoUrl}
              alt="The photo your avatar was matched to"
              className="absolute -bottom-2 -right-2 h-11 w-11 rounded-lg object-cover ring-2 ring-white shadow-[0_2px_6px_rgba(0,0,0,0.18)]"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#1a1a1a]">Your avatar</p>
          <p className="mt-0.5 text-xs leading-4 text-[#606060]">Pick a style and colours, or match them to a photo.</p>
          <div className="mt-2.5 grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Avatar style">
            {AVATAR_BASES.map((base) => (
              <button
                key={base}
                type="button"
                role="radio"
                aria-checked={look.base === base}
                aria-label={STYLE_LABELS[base]}
                title={STYLE_LABELS[base]}
                onClick={() => onChange({ ...look, base })}
                className={`grid h-[52px] cursor-pointer place-items-center overflow-hidden rounded-lg transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3f4ae8] ${
                  look.base === base ? "bg-[#e6e8fd] ring-2 ring-[#3f4ae8]" : "bg-[#f4f4f5] hover:bg-[#ebebee]"
                }`}
              >
                <Character sheet={recolored[base] ?? null} frame={WALK_DOWN[0]!} scale={1.5} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void matchPhoto(file);
        }}
      />
      <div className="mt-3.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={reading}
          className="flex h-9 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-[#c9c9c9] bg-white px-3 text-sm font-medium text-[#202020] transition hover:bg-[#f6f6f7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3f4ae8] disabled:cursor-wait disabled:opacity-60"
        >
          {reading ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <ImageUp size={16} aria-hidden="true" />}
          {stage === "loading" ? "Loading face detection…" : stage === "reading" ? "Reading photo…" : "Match a photo"}
        </button>
        <button
          type="button"
          onClick={() => {
            onChange(originalLook(look.base));
            setNote(null);
          }}
          aria-label="Reset colours and face"
          title="Reset colours and face"
          className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-[10px] border border-[#c9c9c9] bg-white text-[#606060] transition hover:bg-[#f6f6f7] hover:text-[#202020] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3f4ae8]"
        >
          <RotateCcw size={15} aria-hidden="true" />
        </button>
      </div>
      <p className="mt-1.5 text-[11px] leading-4 text-[#7a7a7a]">
        {stage === "loading"
          ? "The first time, this downloads the face detector (about 8 MB). Your photo isn't uploaded."
          : "Your photo stays on this device. Only the avatar made from it is saved."}
      </p>
      {note && (
        <p role="status" className={`mt-1.5 text-xs leading-4 ${note.tone === "ok" ? "text-[#1f7a4a]" : "text-amber-700"}`}>
          {note.text}
        </p>
      )}

      <div className="mt-3 space-y-2">
        {(Object.keys(SWATCHES) as Part[]).map((part) => (
          <div key={part} className="flex items-center gap-2" role="group" aria-label={`${PART_LABELS[part]} colour`}>
            <span className="w-9 shrink-0 text-xs font-medium text-[#606060]">{PART_LABELS[part]}</span>
            <div className="flex flex-1 flex-wrap items-center gap-1.5">
              {SWATCHES[part].map((color, index) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`${PART_LABELS[part]} colour ${index + 1}`}
                  aria-pressed={look[part] === color}
                  onClick={() => onChange({ ...look, [part]: color })}
                  style={{ backgroundColor: color }}
                  className={`h-6 w-6 cursor-pointer rounded-full ring-offset-2 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3f4ae8] ${
                    look[part] === color ? "ring-2 ring-[#3f4ae8]" : "ring-1 ring-black/10 hover:scale-110"
                  }`}
                />
              ))}
              <label
                className={`relative grid h-6 w-6 cursor-pointer place-items-center overflow-hidden rounded-full ring-offset-2 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#3f4ae8] ${
                  (SWATCHES[part] as readonly string[]).includes(look[part]) ? "ring-1 ring-black/10" : "ring-2 ring-[#3f4ae8]"
                }`}
                style={{ background: (SWATCHES[part] as readonly string[]).includes(look[part]) ? "conic-gradient(#f87171,#facc15,#4ade80,#60a5fa,#c084fc,#f87171)" : look[part] }}
                title={`Custom ${PART_LABELS[part].toLowerCase()} colour`}
              >
                <span className="sr-only">Custom {PART_LABELS[part].toLowerCase()} colour</span>
                <input
                  type="color"
                  value={look[part]}
                  onChange={(event) => onChange({ ...look, [part]: event.target.value.toLowerCase() })}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2" role="radiogroup" aria-label="Hair shape">
          <span className="w-9 shrink-0 text-xs font-medium text-[#606060]">Shape</span>
          <div className="flex flex-1 flex-wrap items-center gap-1.5">
            {HAIR_SHAPES.map(({ value, label }) => {
              const active = look.hairShape === value;
              return (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    const next: AvatarLook = { ...look, hairShape: value };
                    if (!value) delete next.hairShape;
                    onChange(next);
                  }}
                  className={`h-6 cursor-pointer rounded-full px-2.5 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3f4ae8] ${
                    active ? "bg-[#e6e8fd] text-[#2f39c9] ring-2 ring-[#3f4ae8]" : "bg-[#f4f4f5] text-[#404040] ring-1 ring-black/10 hover:bg-[#ebebee]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-2" role="group" aria-label="Face details">
          <span className="w-9 shrink-0 text-xs font-medium text-[#606060]">Face</span>
          <div className="flex flex-1 flex-wrap items-center gap-1.5">
            {FACE_DETAILS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                aria-pressed={Boolean(look[key])}
                onClick={() => onChange({ ...look, [key]: !look[key] })}
                className={`h-6 cursor-pointer rounded-full px-2.5 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3f4ae8] ${
                  look[key] ? "bg-[#e6e8fd] text-[#2f39c9] ring-2 ring-[#3f4ae8]" : "bg-[#f4f4f5] text-[#404040] ring-1 ring-black/10 hover:bg-[#ebebee]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
