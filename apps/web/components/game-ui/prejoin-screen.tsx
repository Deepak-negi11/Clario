"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Camera, CameraOff, Check, ChevronLeft, LoaderCircle, Mic, MicOff, TriangleAlert } from "lucide-react";
import { WORK_LEVELS, WORK_LEVEL_INFO, workLevelRank, type AvatarLook, type WorkLevel } from "@repo/shared";
import type { LocalMediaController } from "../../hooks/use-local-media";
import { originalLook } from "../../lib/avatar/recolor";
import { readSavedLook } from "../../lib/avatar/saved-look";
import { AvatarPicker } from "./avatar-picker";

type PrejoinScreenProps = {
  media: LocalMediaController;
  spaceName: string;
  initialName: string;
  /** The level saved on the profile, if any; it can arrive after the screen mounts. */
  initialLevel: WorkLevel | null;
  onEnter: (displayName: string, look: AvatarLook, level: WorkLevel) => Promise<void>;
  /** "3d" on a map only seen in 3D: the avatar picker shows the 3D person. */
  avatarView?: "2d" | "3d";
};

const LEVEL_BARS = 12;
const blueButton =
  "flex h-11 w-full items-center justify-center rounded-[10px] bg-[#3f4ae8] px-5 text-[16px] font-medium text-white shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition hover:bg-[#3540d7] disabled:cursor-wait disabled:opacity-60";

export function PrejoinScreen({ media, spaceName, initialName, initialLevel, onEnter, avatarView = "2d" }: PrejoinScreenProps) {
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const [displayName, setDisplayName] = useState(initialName);
  const [look, setLook] = useState<AvatarLook>(() => readSavedLook() ?? originalLook("adam"));
  // Name and look first, then the work level.
  const [step, setStep] = useState<"name" | "level">("name");
  const [level, setLevel] = useState<WorkLevel | null>(initialLevel);
  const [isEntering, setIsEntering] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const isRequesting = media.micStatus === "requesting" || media.camStatus === "requesting";
  const permissionBlocked = media.micStatus === "blocked" || media.camStatus === "blocked";

  useEffect(() => {
    if (previewRef.current) previewRef.current.srcObject = media.stream;
  }, [media.stream]);

  // The saved level loads after the screen appears; it never overrides a choice made here.
  useEffect(() => {
    if (initialLevel) setLevel((current) => current ?? initialLevel);
  }, [initialLevel]);

  useEffect(() => {
    const audioTrack = media.stream?.getAudioTracks()[0];
    if (!media.micOn || !media.stream || !audioTrack) {
      setAudioLevel(0);
      return;
    }

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;

    const measure = () => {
      analyser.getByteFrequencyData(samples);
      const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
      setAudioLevel(Math.min(1, average / 80));
      frame = requestAnimationFrame(measure);
    };
    measure();

    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      analyser.disconnect();
      void audioContext.close();
    };
  }, [media.micOn, media.stream]);

  function handleNext() {
    if (!displayName.trim()) {
      setEntryError("Enter your name to continue.");
      return;
    }
    setEntryError(null);
    setStep("level");
  }

  async function handleEnter(event: FormEvent) {
    event.preventDefault();
    const name = displayName.trim();
    if (!level) {
      setEntryError("Pick your level to continue.");
      return;
    }

    setEntryError(null);
    setIsEntering(true);
    try {
      await onEnter(name, look, level);
    } catch (error) {
      setEntryError(error instanceof Error ? error.message : "Could not enter the space.");
      setIsEntering(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f3f3f3] px-5 py-10 font-sans text-[#202020] sm:px-8 lg:grid lg:place-items-center">
      <div className="mx-auto grid w-full max-w-[1060px] gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)] lg:items-center lg:gap-16">
        <section className="overflow-hidden rounded-[22px] bg-[#242424] shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
          <div className="relative aspect-[1.58/1] min-h-[300px]">
            <video
              ref={previewRef}
              autoPlay
              playsInline
              muted
              className={`h-full w-full scale-x-[-1] object-cover ${media.camOn ? "block" : "hidden"}`}
            />

            {!media.camOn && (
              <div className="grid h-full place-items-center text-center text-[#d6d6d6]">
                <p className="text-base font-medium tracking-[-0.01em] text-[#d8d8d8] sm:text-lg">Your camera is off</p>
              </div>
            )}

            {media.micOn && (
              <div className="absolute right-3 top-3 flex items-center gap-2 rounded-full bg-[#292929]/90 px-2.5 py-2 shadow-lg backdrop-blur-sm">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-[#202020]">
                  <Mic size={12} strokeWidth={3} />
                </span>
                <div className="flex h-4 items-center gap-[4px]" aria-label="Microphone level">
                  {Array.from({ length: LEVEL_BARS }, (_, index) => {
                    const isActive = index < Math.max(1, Math.round(audioLevel * LEVEL_BARS));
                    return (
                      <span
                        key={index}
                        className={`h-3 w-[4px] rounded-full transition-colors ${isActive ? "bg-[#29d873]" : "bg-white"}`}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            <div className="absolute inset-x-0 bottom-3 flex justify-center sm:bottom-5">
              <div className="flex items-center gap-1.5 rounded-[20px] bg-[#303030]/95 p-2 shadow-xl backdrop-blur-md">
                <MediaButton
                  label={media.micOn ? "Turn microphone off" : "Turn microphone on"}
                  active={media.micOn}
                  loading={media.micStatus === "requesting"}
                  onClick={() => void media.toggleMic()}
                >
                  {media.micOn ? <Mic size={22} /> : <MicOff size={22} />}
                </MediaButton>
                <MediaButton
                  label={media.camOn ? "Turn camera off" : "Turn camera on"}
                  active={media.camOn}
                  loading={media.camStatus === "requesting"}
                  onClick={() => void media.toggleCam()}
                >
                  {media.camOn ? <Camera size={22} /> : <CameraOff size={22} />}
                </MediaButton>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[360px]">
          {step === "name" ? (
            <>
              <h2 className="mb-1 text-xl font-semibold tracking-tight text-[#1a1a1a]">
                Join {spaceName}
              </h2>
              <p className="mb-5 text-sm text-[#606060]">
                Choose how you look, then enter your display name.
              </p>
              <AvatarPicker look={look} onChange={setLook} view={avatarView} />
              <label htmlFor="prejoin-name" className="sr-only">Display name</label>
              <input
                id="prejoin-name"
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  // Without this, focus moves into the level form during this keypress and the
                  // browser's Enter then submits it at once, showing "Pick your level".
                  event.preventDefault();
                  handleNext();
                }}
                maxLength={25}
                autoComplete="name"
                className="h-11 w-full rounded-[10px] border border-[#c9c9c9] bg-white px-3.5 text-[16px] font-normal shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none transition focus:border-[#6771e9] focus:ring-2 focus:ring-[#dfe2ff]"
              />
              <button type="button" onClick={handleNext} disabled={isRequesting} className={`mt-2.5 ${blueButton}`}>
                Next
              </button>
            </>
          ) : (
            <LevelStep
              level={level}
              onChange={(next) => {
                setLevel(next);
                setEntryError(null);
              }}
              onBack={() => {
                setEntryError(null);
                setStep("name");
              }}
              onSubmit={(event) => void handleEnter(event)}
              busy={isRequesting || isEntering}
              isEntering={isEntering}
            />
          )}

          {permissionBlocked && (
            <p className="mt-4 flex items-center gap-2 text-sm text-amber-700">
              <TriangleAlert size={16} /> Check your browser settings to allow a blocked device.
            </p>
          )}
          {entryError && <p className="mt-3 text-sm text-red-600">{entryError}</p>}
        </section>
      </div>
    </main>
  );
}

function LevelStep({
  level,
  onChange,
  onBack,
  onSubmit,
  busy,
  isEntering,
}: {
  level: WorkLevel | null;
  onChange: (level: WorkLevel) => void;
  onBack: () => void;
  onSubmit: (event: FormEvent) => void;
  busy: boolean;
  isEntering: boolean;
}) {
  const headingId = useId();

  return (
    <form onSubmit={onSubmit} aria-labelledby={headingId}>
      <button
        type="button"
        onClick={onBack}
        className="-ml-1.5 mb-2 flex cursor-pointer items-center gap-0.5 rounded-md px-1.5 py-1 text-sm text-[#606060] transition hover:text-[#1a1a1a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#6771e9]"
      >
        <ChevronLeft size={16} aria-hidden="true" /> Back
      </button>
      <h2 id={headingId} className="mb-1 text-xl font-semibold tracking-tight text-[#1a1a1a]">
        What&apos;s your level at work?
      </h2>
      <p className="mb-5 text-sm text-[#606060]">
        People can give tasks to anyone below their level. You can change it next time you join.
      </p>
      <fieldset>
        <legend className="sr-only">Work level</legend>
        <div className="flex flex-col gap-2">
          {WORK_LEVELS.map((id) => {
            const checked = level === id;
            return (
              <label
                key={id}
                className={`flex cursor-pointer items-center gap-3 rounded-[10px] border px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#dfe2ff] ${
                  checked ? "border-[#3f4ae8] bg-[#f3f4ff]" : "border-[#c9c9c9] bg-white hover:border-[#9a9a9a]"
                }`}
              >
                <input
                  type="radio"
                  name="work-level"
                  value={id}
                  checked={checked}
                  onChange={() => onChange(id)}
                  // The current choice, or the first option, takes focus so arrow keys work at once.
                  autoFocus={level ? checked : id === WORK_LEVELS[0]}
                  className="sr-only"
                />
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-semibold tabular-nums ${
                    checked ? "bg-[#3f4ae8] text-white" : "bg-[#ececec] text-[#505050]"
                  }`}
                  aria-hidden="true"
                >
                  {workLevelRank(id)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium leading-5 text-[#1a1a1a]">{WORK_LEVEL_INFO[id].label}</span>
                  <span className="block text-[12.5px] leading-4 text-[#606060]">{WORK_LEVEL_INFO[id].hint}</span>
                </span>
                {checked && <Check size={18} className="shrink-0 text-[#3f4ae8]" aria-hidden="true" />}
              </label>
            );
          })}
        </div>
      </fieldset>
      <button type="submit" disabled={busy} className={`mt-4 ${blueButton}`}>
        {isEntering ? <LoaderCircle className="animate-spin" size={21} /> : "Join space"}
      </button>
    </form>
  );
}

function MediaButton({
  label,
  active,
  loading,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  loading: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={loading}
      onClick={onClick}
      className={`grid h-11 w-14 place-items-center rounded-[14px] transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-70 ${
        active ? "bg-[#244a35] text-[#29df79]" : "bg-[#353535] text-[#ef5b62]"
      }`}
    >
      {loading ? <LoaderCircle className="animate-spin" size={20} /> : children}
    </button>
  );
}
