"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ImageUp, LoaderCircle, RotateCcw } from "lucide-react";
import { AVATAR_BASES, PHOTO_AI_SIZE, lookForAiHair, type AvatarBase, type AvatarLook, type HairShape, type PhotoAiReading } from "@repo/shared";
import { readPhoto } from "../../lib/avatar/photo-detect";
import { getAuthToken, isGuestSession } from "../../lib/auth-token";
import { FRAME_HEIGHT, FRAME_WIDTH, originalLook, recolorSheet, sheetUrl } from "../../lib/avatar/recolor";

const STYLE_LABELS: Record<AvatarBase, string> = {
  adam: "Messy hair",
  alex: "Side part",
  amelia: "Long hair",
  bob: "Short hair",
};

// On a 3D map you pick the 3D person: three.js only loads there.
const Avatar3D = dynamic(() => import("../space-3d/avatar-3d").then((module) => module.Avatar3D), { ssr: false });

// The 3D people have fewer hairstyles than the 2D sprites: the side part is the same person as
// messy hair there, so 3D shows three styles (space-3d/people.ts, hairFor).
const STYLE_LABELS_3D: Partial<Record<AvatarBase, string>> = {
  adam: "Short hair",
  amelia: "Long hair",
  bob: "Buzz cut",
};
const sameIn3d = (base: AvatarBase) => (base === "alex" ? "adam" : base);

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
// "Use AI to read my photo" (on unless they turn it off): a small copy goes to NVIDIA's vision
// model through /api/avatar/photo for the hairstyle, glasses and beard, which the face detector
// guesses least well. Colours and the 3D face picture still come from the photo here.
const PHOTO_AI_KEY = "clario:avatar-photo-ai";
const PHOTO_AI_TIMEOUT_MS = 16_000;

function readPhotoAiChoice(): boolean {
  try {
    return localStorage.getItem(PHOTO_AI_KEY) !== "off";
  } catch {
    return true;
  }
}

// The photo as a small JPEG data URL, for the AI.
async function smallJpeg(file: Blob): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, PHOTO_AI_SIZE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  }
  bitmap.close();
  return ctx ? canvas.toDataURL("image/jpeg", 0.85) : null;
}

// What the AI read from the photo, or null (signed out, no key on the server, no face, a failure).
async function readPhotoWithAi(file: Blob): Promise<PhotoAiReading | null> {
  const token = getAuthToken();
  if (!token) return null;
  try {
    const image = await smallJpeg(file);
    if (!image) return null;
    const response = await fetch("/api/avatar/photo", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ image }),
      signal: AbortSignal.timeout(PHOTO_AI_TIMEOUT_MS),
    });
    return response.ok ? ((await response.json()) as PhotoAiReading) : null;
  } catch {
    return null;
  }
}

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

// `view="3d"` shows you as the 3D view does (for 3D maps) instead of the 2D sprite.
export function AvatarPicker({ look, onChange, view = "2d" }: { look: AvatarLook; onChange: (look: AvatarLook) => void; view?: "2d" | "3d" }) {
  const sheets = useSheets();
  // The 3D style pictures (made by Avatar3D), and whether the 3D people failed to load: then the
  // picker falls back to the 2D sprites.
  const [thumbs, setThumbs] = useState<Partial<Record<AvatarBase, string>>>({});
  const [failed3d, setFailed3d] = useState(false);
  const in3d = view === "3d" && !failed3d;
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [stage, setStage] = useState<"loading" | "reading" | null>(null);
  const reading = stage !== null;
  const [note, setNote] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  // Guests (joined from a link) can't use the site's AI, so they don't get the switch.
  const [aiAllowed] = useState(() => !isGuestSession());
  const [aiChoice, setUseAi] = useState(readPhotoAiChoice);
  const useAi = aiAllowed && aiChoice;
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
      // On 3D maps the face itself goes on your 3D head (and is saved, for others to see).
      // Both at once: the AI answers in a second or two, while the detector may still be downloading.
      const [result, ai] = await Promise.all([
        readPhoto(file, setStage, { cutFace: view === "3d" }),
        useAi ? readPhotoWithAi(file) : Promise.resolve(null),
      ]);
      if (result.method === "none" && !ai) {
        setNote({ tone: "warn", text: "Couldn't find a face in that photo. Try a clear, front-facing one, or pick below." });
        return;
      }
      // The AI's hairstyle, glasses and beard win over the detector's guesses; colours come from the photo.
      const fromAi = ai ? lookForAiHair(ai.hair) : null;
      const photo = result.method === "none" ? null : result.look;
      const detectedShape = result.method === "detected" ? result.look.hairShape : null;
      const hairShape = fromAi ? fromAi.hairShape : detectedShape;
      const style = fromAi?.style ?? photo?.style ?? null;
      const glasses = ai?.glasses ?? photo?.glasses ?? false;
      const beard = ai?.beard ?? photo?.beard ?? false;
      onChange({
        base: style ?? look.base,
        skin: photo?.skin ?? look.skin,
        hair: photo?.hair ?? look.hair,
        top: photo?.top ?? look.top,
        glasses,
        beard,
        ...(hairShape ? { hairShape } : {}),
        ...(result.method === "detected" && result.face ? { face: result.face } : {}),
      });
      // Say what was read, so a wrong guess is easy to spot and undo below.
      const found = [
        result.method === "detected" && result.face ? "face" : null,
        photo && "skin",
        photo?.hair && "hair colour",
        hairShape ? SHAPE_NAMES[hairShape] : style && `hairstyle (${STYLE_LABELS[style].toLowerCase()})`,
        glasses && "glasses",
        beard && "beard",
        photo?.top && "top",
      ].filter((item): item is string => Boolean(item));
      const list = found.length > 1 ? `${found.slice(0, -1).join(", ")} and ${found.at(-1)}` : found[0];
      const how = ai
        ? result.method === "detected" ? " Hairstyle, glasses and beard read by AI." : " Read by AI; the colours couldn't be read, so pick them below."
        : result.method === "colours" ? " Face detection couldn't load, so this is from colours only." : "";
      setNote({ tone: result.method === "detected" || ai ? "ok" : "warn", text: `From your photo: ${list}.${how} Change anything below.` });
    } catch {
      setNote({ tone: "warn", text: "That file couldn't be read as an image." });
    } finally {
      setStage(null);
    }
  }

  return (
    <div className="mb-5 rounded-[14px] border border-[#e1e1e1] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-start gap-4">
        <div className={`relative grid shrink-0 place-items-center rounded-[10px] ${in3d ? "h-[176px] w-[112px] bg-gradient-to-b from-[#e3eef8] to-[#eef0f6]" : "h-[136px] w-[88px] bg-[#eef0f6]"}`}>
          {in3d ? (
            <Avatar3D
              look={look}
              onThumbs={setThumbs}
              onError={() => setFailed3d(true)}
            />
          ) : (
            <Character sheet={recolored[look.base] ?? null} frame={WALK_DOWN[frameIndex]!} scale={4} label="Your avatar" />
          )}
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
          {in3d ? (
            <div className="mt-2.5 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Avatar style">
              {(Object.keys(STYLE_LABELS_3D) as AvatarBase[]).map((base) => {
                const checked = sameIn3d(look.base) === base;
                const picture = thumbs[base];
                return (
                  <button
                    key={base}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    aria-label={STYLE_LABELS_3D[base]}
                    title={STYLE_LABELS_3D[base]}
                    onClick={() => onChange({ ...look, base })}
                    className={`grid h-[60px] cursor-pointer place-items-center overflow-hidden rounded-lg transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3f4ae8] ${
                      checked ? "bg-[#e6e8fd] ring-2 ring-[#3f4ae8]" : "bg-[#f4f4f5] hover:bg-[#ebebee]"
                    }`}
                  >
                    {picture ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a picture drawn here, which next/image can't optimise
                      <img src={picture} alt="" className="h-14 w-14" />
                    ) : (
                      <span className="h-8 w-8 animate-pulse rounded-full bg-[#e2e4ea]" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
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
          )}
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
      {aiAllowed && (
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs font-medium text-[#404040]">
          <input
            type="checkbox"
            checked={aiChoice}
            disabled={reading}
            onChange={(event) => {
              setUseAi(event.target.checked);
              try {
                localStorage.setItem(PHOTO_AI_KEY, event.target.checked ? "on" : "off");
              } catch {
                // Private mode: the choice lasts until the page reloads.
              }
            }}
            className="h-3.5 w-3.5 cursor-pointer accent-[#3f4ae8]"
          />
          Use AI to read my photo
        </label>
      )}
      <p className="mt-1 text-[11px] leading-4 text-[#7a7a7a]">
        {stage === "loading"
          ? `The first time, this downloads the face detector (about 8 MB).${useAi ? "" : " Your photo isn't uploaded."}`
          : `${useAi
              ? "A small copy of your photo goes to NVIDIA through our server, to read your hairstyle, glasses and beard. It isn't saved."
              : "Your photo stays on this device."} ${view === "3d"
              ? "A small picture of your face from it is saved with your avatar, and others in the space see it on your 3D head."
              : "Only the avatar made from it is saved."}`}
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
            {look.face && (
              <button
                type="button"
                aria-pressed="true"
                aria-label="Remove photo face"
                title="Remove the face from your photo"
                onClick={() => {
                  const next: AvatarLook = { ...look };
                  delete next.face;
                  onChange(next);
                }}
                className="h-6 cursor-pointer rounded-full bg-[#e6e8fd] px-2.5 text-xs font-medium text-[#2f39c9] ring-2 ring-[#3f4ae8] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3f4ae8]"
              >
                Photo face ×
              </button>
            )}
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
