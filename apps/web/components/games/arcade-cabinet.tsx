"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
import { AnimatePresence, MotionConfig, motion, type Transition } from "motion/react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Box, Gamepad2, LoaderCircle, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import {
  SCREEN_H, SCREEN_W, SEATS, emptyInput,
  type ArcadeInput, type Direction, type GameInstance, type GamePhase, type GameStage, type HudItem, type Level, type Seat,
} from "./arcade-kit";
import { KEY_SETS, defaultZone, type ArcadeGameSpec } from "./arcade-games";
import { playSound } from "./arcade-sound";
import { applyRemoteInput, packHeld, readMatchData, type Match } from "./play-link";

// One game on screen: runs its loop, feeds it keys, game controllers, mouse and touch, and draws
// the score, pause, restart and end cards around it. Three ways to play:
//   solo   - you, and the computer in any other seats
//   local  - up to four people on one device: a set of keys each (W A S D, arrows, I J K L,
//            numpad), a game controller each, or a finger each in their part of the screen
//   online - people elsewhere in the space: the host runs the game and streams it to the guests
// Solo and local games pause themselves when the window loses focus.
// Games with a 3D table (spec.stage) draw it over the pixel screen once it has loaded; the pixel
// screen stays underneath while it loads, if WebGL isn't there, and for anyone who turns 3D off.

export type CabinetMode = { kind: "solo"; seats: number; level?: Level } | { kind: "local"; seats: number } | { kind: "online"; match: Match };

const SOUND_KEY = "arcade:sound";
// "flat" when the player turned the 3D table off (the menu stills follow it too).
export const VIEW_KEY = "arcade:view";
const bestKey = (kind: string) => `arcade:best:${kind}`;
const SEND_EVERY_MS = 33;
const INPUT_HEARTBEAT_MS = 250;
const PAD_THRESHOLD = 0.45;

type View = { phase: GamePhase; hud: HudItem[]; hint: string | null; headline: string; result: string; pads: number };
type PadState = { up: boolean; down: boolean; left: boolean; right: boolean; action: boolean; start: boolean };

function readStored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or full storage: scores just aren't remembered.
  }
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia(REDUCED_MOTION).matches, () => false);
}

function releaseAll(input: ArcadeInput) {
  input.held.up = input.held.down = input.held.left = input.held.right = false;
}

// Connected game controllers. Some browsers block the Gamepad API (in a frame, by policy): none then.
function connectedPads(): Gamepad[] {
  try {
    return navigator.getGamepads ? [...navigator.getGamepads()].filter((pad): pad is Gamepad => !!pad?.connected) : [];
  } catch {
    return [];
  }
}

// A standard-layout controller: d-pad or left stick to move, A (or X) for the button, Start.
function readPad(pad: Gamepad): PadState {
  const button = (index: number) => pad.buttons[index]?.pressed ?? false;
  const x = pad.axes[0] ?? 0;
  const y = pad.axes[1] ?? 0;
  return {
    up: button(12) || y < -PAD_THRESHOLD,
    down: button(13) || y > PAD_THRESHOLD,
    left: button(14) || x < -PAD_THRESHOLD,
    right: button(15) || x > PAD_THRESHOLD,
    action: button(0) || button(2),
    start: button(9),
  };
}

// The seats a mode puts in the game: you and the computer, people here by colour, or the table.
export function seatsFor(mode: CabinetMode, spec: ArcadeGameSpec): Seat[] {
  if (mode.kind === "online") return mode.match.seats;
  const count = Math.max(spec.players.min === 1 ? 1 : 2, Math.min(spec.players.max, mode.seats));
  if (mode.kind === "local") return Array.from({ length: count }, (_, index) => ({ name: SEATS[index]!.name, bot: false }));
  return Array.from({ length: count }, (_, index) =>
    index === 0 ? { name: "You", bot: false } : { name: count === 2 ? "Computer" : SEATS[index]!.name, bot: true },
  );
}

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12151c]";
const iconButton = `grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-xl bg-[#f4f5f7] text-[#3b4150] transition hover:bg-[#e9ebee] hover:text-[#12151c] active:scale-[0.96] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-[#f4f5f7] disabled:active:scale-100 motion-reduce:transition-none ${focusRing}`;
const cardButton = `pointer-events-auto mt-3 inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl bg-[#12151c] px-4 text-[13px] font-semibold text-white transition hover:bg-black active:scale-[0.98] motion-reduce:transition-none ${focusRing}`;
const kbd = "min-w-5 rounded-md border border-[#e3e5e8] bg-[#f6f7f8] px-1.5 py-px text-center font-mono text-[11px] text-[#3b4150]";
const pixelFont = "font-[family-name:var(--font-pixel)]";
// Cards and calls land with a little weight; scores tick over like a flip counter.
const springy: Transition = { type: "spring", stiffness: 420, damping: 30, mass: 0.8 };
const flip: Transition = { type: "spring", stiffness: 520, damping: 28 };

type StageStatus = "off" | "loading" | "ready" | "failed";

export function ArcadeCabinet({ spec, mode }: { spec: ArcadeGameSpec; mode: CabinetMode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const table3dRef = useRef<GameStage | null>(null);
  const inputsRef = useRef<ArcadeInput[]>([emptyInput(), emptyInput(), emptyInput(), emptyInput()]);
  const gameRef = useRef<GameInstance | null>(null);
  const pausedRef = useRef(false);
  const soundRef = useRef(true);
  const bestRef = useRef(0);
  const movesRef = useRef(0);
  const ownersRef = useRef(new Map<number, number>());
  const padsRef = useRef<Map<number, PadState>>(new Map());
  const controlsId = useId();
  const reducedMotion = usePrefersReducedMotion();
  const [round, setRound] = useState(0);
  const [paused, setPausedState] = useState(false);
  const [soundOn, setSoundOn] = useState(() => readStored(SOUND_KEY) !== "off");
  const [best, setBest] = useState(() => Number(readStored(bestKey(spec.kind))) || 0);
  const [view, setView] = useState<View>({ phase: "ready", hud: [], hint: null, headline: "", result: "", pads: 0 });
  const [want3d, setWant3d] = useState(() => readStored(VIEW_KEY) !== "flat");
  const [stageStatus, setStageStatus] = useState<StageStatus>("off");
  const [stageCard, setStageCard] = useState<GameStage["card"]>("low");
  const has3d = !!spec.stage && stageStatus !== "failed";
  const shows3d = stageStatus === "ready";

  const match = mode.kind === "online" ? mode.match : null;
  const level = mode.kind === "solo" ? mode.level : undefined;
  const role = match?.role ?? null;
  const local = mode.kind === "local";
  const canPause = mode.kind !== "online";
  const seats = useMemo(() => seatsFor(mode, spec), [mode, spec]);
  const seatsKey = JSON.stringify(seats);
  const count = seats.length;
  const keepsBest = mode.kind === "solo" && count === 1;

  const setPaused = useCallback((value: boolean) => {
    pausedRef.current = value;
    setPausedState(value);
    inputsRef.current.forEach(releaseAll);
  }, []);

  const focusStage = useCallback(() => stageRef.current?.focus({ preventScroll: true }), []);

  // A guest can't restart the host's game: it asks, and the host restarts for everyone.
  const restart = useCallback(() => {
    const host = match?.role === "guest" ? match.peers[0] : undefined;
    if (host) match!.send({ k: "restart" }, host.id);
    else setRound((value) => value + 1);
    focusStage();
  }, [match, focusStage]);

  const togglePause = useCallback(() => {
    if (!canPause) return;
    if (!pausedRef.current && gameRef.current?.phase() !== "playing") return;
    setPaused(!pausedRef.current);
    focusStage();
  }, [canPause, setPaused, focusStage]);

  // Space, Enter, a controller's Start: resume, play again, or start the round for everyone (and,
  // for one player, also their button: serve, launch, dash).
  const startButton = useCallback(() => {
    const phase = gameRef.current?.phase();
    if (pausedRef.current) return setPaused(false);
    if (phase === "over" || phase === "won") return restart();
    const inputs = inputsRef.current;
    for (const input of inputs) input.presses.push("start");
    if (!local) inputs[0]!.presses.push("action");
  }, [local, restart, setPaused]);
  const startButtonRef = useRef(startButton);
  startButtonRef.current = startButton;

  useEffect(() => {
    soundRef.current = soundOn;
    writeStored(SOUND_KEY, soundOn ? "on" : "off");
  }, [soundOn]);

  useEffect(() => {
    bestRef.current = best;
  }, [best]);

  // A fresh game for each round, and whenever who's playing (or how well the computer plays) changes.
  useEffect(() => {
    gameRef.current = spec.create({
      reducedMotion,
      seats: JSON.parse(seatsKey) as Seat[],
      level,
      sound: (sound) => {
        if (soundRef.current) playSound(sound);
      },
    });
    inputsRef.current = [emptyInput(), emptyInput(), emptyInput(), emptyInput()];
    setPaused(false);
  }, [spec, round, reducedMotion, seatsKey, level, setPaused]);

  // The 3D table: loaded on demand, put over the pixel screen and sized to it. If it can't start
  // (no WebGL) or the GPU is lost later, the pixel screen carries on.
  useEffect(() => {
    const load = spec.stage;
    const host = tableRef.current;
    if (!load || !want3d || !host) {
      setStageStatus("off");
      return;
    }
    let cancelled = false;
    let stage: GameStage | null = null;
    let observer: ResizeObserver | null = null;
    setStageStatus("loading");
    load()
      .then(async (create) => {
        if (cancelled) return;
        stage = create({
          reducedMotion,
          onLost: () => {
            table3dRef.current = null;
            setStageStatus("failed");
          },
        });
        // Wait for its models, so the table doesn't change in front of the player.
        await stage.ready?.catch(() => {});
        if (cancelled) return;
        stage.canvas.className = "absolute inset-0 block h-full w-full";
        stage.canvas.setAttribute("aria-hidden", "true");
        host.appendChild(stage.canvas);
        const fit = () => stage?.resize(host.clientWidth, host.clientHeight);
        fit();
        observer = new ResizeObserver(fit);
        observer.observe(host);
        table3dRef.current = stage;
        setStageCard(stage.card ?? "low");
        setStageStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStageStatus("failed");
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      table3dRef.current = null;
      stage?.dispose();
    };
  }, [spec, want3d, reducedMotion]);

  const toggle3d = useCallback(() => {
    writeStored(VIEW_KEY, want3d ? "flat" : "3d");
    setWant3d(!want3d);
    focusStage();
  }, [want3d, focusStage]);

  // Online: guests draw the host's snapshots; the host takes each guest's keys for their seat.
  useEffect(() => {
    if (!match) return;
    return match.subscribe((raw, fromUserId) => {
      const data = readMatchData(raw);
      if (!data) return;
      if (data.k === "state" && match.role === "guest") gameRef.current?.restore(data.s);
      else if (data.k === "input" && match.role === "host") {
        const peer = match.peers.find((candidate) => candidate.id === fromUserId);
        if (peer) applyRemoteInput(inputsRef.current[peer.seat]!, data);
      } else if (data.k === "restart" && match.role === "host") setRound((value) => value + 1);
    });
  }, [match]);

  // The loop: read controllers, update unless paused (guests never update, they only draw what
  // the host sent), draw, send to the other players if online, and copy what the score line
  // shows into state only when it changes, so React doesn't re-render every frame.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    let frame = 0;
    let last = performance.now();
    let lastSent = 0;
    let lastInput = "";
    let shown = "";
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const game = gameRef.current;
      if (!game) return;
      const inputs = inputsRef.current;

      // Controllers: one per seat on one device, otherwise any controller is yours.
      const pads = connectedPads();
      const padHeld: (PadState | null)[] = [null, null, null, null];
      pads.forEach((pad, order) => {
        const state = readPad(pad);
        const before = padsRef.current.get(pad.index);
        padsRef.current.set(pad.index, state);
        const seat = local ? order : 0;
        if (seat >= 4) return;
        const input = inputs[seat]!;
        const held = padHeld[seat];
        padHeld[seat] = held ? { up: held.up || state.up, down: held.down || state.down, left: held.left || state.left, right: held.right || state.right, action: false, start: false } : state;
        for (const direction of ["up", "down", "left", "right"] as Direction[]) if (state[direction] && !before?.[direction]) input.presses.push(direction);
        if (state.action && !before?.action) input.presses.push("action", "start");
        if (state.start && !before?.start) startButtonRef.current();
      });
      const merged = inputs.map((input, seat) => {
        const pad = padHeld[seat];
        if (!pad) return input;
        return { ...input, held: { up: input.held.up || pad.up, down: input.held.down || pad.down, left: input.held.left || pad.left, right: input.held.right || pad.right } };
      });

      if (role === "guest") {
        const mine = merged[0]!;
        const pointer = mine.pointer;
        const packed = { h: packHeld(mine.held), p: pointer ? ([Math.round(pointer.x), Math.round(pointer.y), pointer.down ? 1 : 0] as [number, number, number]) : null };
        const key = JSON.stringify(packed);
        const host = match?.peers[0];
        if (host && now - lastSent >= SEND_EVERY_MS && (inputs[0]!.presses.length > 0 || key !== lastInput || now - lastSent >= INPUT_HEARTBEAT_MS)) {
          match.send({ k: "input", ...packed, pr: inputs[0]!.presses.splice(0) }, host.id);
          lastSent = now;
          lastInput = key;
        }
      } else {
        if (!pausedRef.current) game.update(merged, dt);
        for (const input of inputs) input.presses.length = 0;
        if (role === "host" && match && now - lastSent >= SEND_EVERY_MS) {
          const state = { k: "state" as const, s: game.snapshot() };
          for (const peer of match.peers) match.send(state, peer.id);
          lastSent = now;
        }
      }
      const table = table3dRef.current;
      const scene = table ? game.view?.() : undefined;
      let drawn = false;
      if (table && scene) {
        try {
          table.render(scene, dt, now / 1000);
          drawn = true;
        } catch (error) {
          // A broken 3D frame shouldn't stop the game: go back to the pixel screen for good.
          console.error("Game Room: the 3D table failed, back to the flat view", error);
          table3dRef.current = null;
          setStageStatus("failed");
        }
      }
      if (!drawn) game.draw(ctx, now / 1000);

      const score = game.score();
      if (keepsBest && score > bestRef.current) {
        bestRef.current = score;
        setBest(score);
        writeStored(bestKey(spec.kind), String(score));
      }
      const phase = game.phase();
      const ended = phase === "over" || phase === "won";
      const next: View = {
        phase,
        hud: game.hud(),
        hint: game.hint(),
        headline: ended ? game.headline() : "",
        result: ended ? game.result() : "",
        pads: pads.length,
      };
      const key = JSON.stringify(next);
      if (key !== shown) {
        shown = key;
        setView(next);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [spec.kind, role, match, local, keepsBest]);

  // Stop the clock when the player tabs away or clicks out of the window (not online: the others
  // are still playing).
  useEffect(() => {
    if (!canPause) return;
    const pauseIfPlaying = () => {
      if (gameRef.current?.phase() === "playing") setPaused(true);
    };
    const onVisibility = () => {
      if (document.hidden) pauseIfPlaying();
    };
    window.addEventListener("blur", pauseIfPlaying);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", pauseIfPlaying);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [canPause, setPaused]);

  useEffect(() => {
    focusStage();
  }, [focusStage]);

  // Which input a key set drives: on one device each set is a seat; otherwise every key is yours.
  const inputFor = (seat: number) => inputsRef.current[local ? seat : 0]!;

  const keyOf = (code: string) => {
    for (const [seat, set] of KEY_SETS.entries()) {
      const direction = (set.codes as Record<string, Direction | undefined>)[code];
      if (direction) return { seat, direction, button: false };
      if ((set.buttons as readonly string[]).includes(code)) return { seat, direction: null, button: true };
    }
    return null;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = keyOf(event.code);
    if (key && (!local || key.seat < count)) {
      event.preventDefault();
      const input = inputFor(key.seat);
      if (key.direction) {
        input.held[key.direction] = true;
        if (!event.repeat) input.presses.push(key.direction);
      } else if (!event.repeat) input.presses.push("action");
      return;
    }
    switch (event.code) {
      case "Space":
      case "Enter":
      case "NumpadEnter":
        if (event.target instanceof HTMLButtonElement) return; // let the focused button do its job
        event.preventDefault();
        if (!event.repeat) startButton();
        return;
      case "KeyP":
        togglePause();
        return;
      case "KeyR":
        restart();
        return;
      case "KeyM":
        setSoundOn((value) => !value);
        return;
      case "KeyV":
        if (spec.stage && stageStatus !== "failed") toggle3d();
        return;
    }
  };

  const onKeyUp = (event: KeyboardEvent<HTMLDivElement>) => {
    const key = keyOf(event.code);
    if (key?.direction) inputFor(key.seat).held[key.direction] = false;
  };

  // Where the pointer is on the play field, in screen pixels. On the 3D table that's the spot on the
  // table under it, so dragging up and down the screen still slides a bat along the table.
  const toScreen = (event: PointerEvent<HTMLDivElement>) => {
    const picked = table3dRef.current?.pick(event.clientX, event.clientY);
    if (picked) return picked;
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * SCREEN_W,
      y: ((event.clientY - rect.top) / rect.height) * SCREEN_H,
    };
  };
  // On one device, a finger (or the mouse) belongs to whoever's part of the screen it's in.
  const ownerOf = (event: PointerEvent<HTMLDivElement>, at: { x: number; y: number }) => {
    if (!local) return 0;
    const owner = ownersRef.current.get(event.pointerId);
    if (owner !== undefined && event.pointerType !== "mouse") return owner;
    return (spec.zone ?? defaultZone)(at.x, at.y, count);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    focusStage();
    event.currentTarget.setPointerCapture(event.pointerId);
    const at = toScreen(event);
    const seat = ownerOf(event, at);
    ownersRef.current.set(event.pointerId, seat);
    movesRef.current++;
    const input = inputFor(seat);
    input.pointer = { ...at, down: true, moves: movesRef.current };
    if (!pausedRef.current) input.presses.push("start");
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const at = toScreen(event);
    const input = inputFor(ownerOf(event, at));
    // A mouse steers just by hovering; a finger only while it's down.
    if (event.pointerType !== "mouse" && !input.pointer?.down) return;
    movesRef.current++;
    input.pointer = { ...at, down: input.pointer?.down ?? false, moves: movesRef.current };
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const seat = ownersRef.current.get(event.pointerId) ?? 0;
    ownersRef.current.delete(event.pointerId);
    const input = inputFor(seat);
    input.pointer = event.pointerType === "mouse" && event.type === "pointerup" && input.pointer ? { ...input.pointer, down: false } : null;
  };

  const onPointerLeave = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    for (const input of inputsRef.current) if (!input.pointer?.down) input.pointer = null;
  };

  const press = (direction: Direction) => {
    const input = inputsRef.current[0]!;
    input.held[direction] = true;
    input.presses.push(direction);
  };
  const release = (direction: Direction) => {
    inputsRef.current[0]!.held[direction] = false;
  };

  const { phase } = view;
  const ended = phase === "over" || phase === "won";
  const startKeys = local ? "Press Space or Start to begin" : spec.start.keys;
  const startTouch = local ? "Tap to begin" : spec.start.touch;
  // Read out what the cards and the calls over the table say ("Deuce", "Your point").
  const status = paused ? "Paused." : ended ? `${view.headline} ${view.result}` : phase === "ready" ? `${spec.title}. ${startKeys}.` : (view.hint ?? "");
  const hud = keepsBest ? [...view.hud, { label: "Best", value: String(best) }] : view.hud;
  const humans = seats.map((seat, index) => ({ ...seat, index })).filter((seat) => !seat.bot);

  const card = paused ? "paused" : ended ? "ended" : phase === "ready" ? "ready" : null;
  // Over the 3D table the opening card sits low and, on a phone, small, so the table shows above it.
  const compactCard = card === "ready" && shows3d;

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex flex-col gap-3" onKeyDown={onKeyDown} onKeyUp={onKeyUp} onBlur={() => inputsRef.current.forEach(releaseAll)}>
        <div
          ref={stageRef}
          tabIndex={0}
          role="application"
          aria-label={`${spec.title} game`}
          aria-describedby={controlsId}
          className="relative mx-auto w-full overflow-hidden rounded-xl bg-[#1d1f23] shadow-[0_1px_2px_rgba(18,21,28,0.18),0_10px_28px_-14px_rgba(18,21,28,0.5)] outline-none ring-1 ring-black/10 focus-visible:ring-2 focus-visible:ring-[#12151c] focus-visible:ring-offset-2"
          style={{ maxWidth: "max(16rem, calc((100dvh - 18rem) * 1.5))" }}
        >
          <div
            className="relative touch-none select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onPointerLeave={onPointerLeave}
            onContextMenu={(event) => event.preventDefault()}
          >
            <canvas ref={canvasRef} width={SCREEN_W} height={SCREEN_H} aria-hidden="true" className="block aspect-[3/2] w-full [image-rendering:pixelated]" />
            {/* The 3D table's canvas goes in here, and fades in over the pixel screen once it's drawing. */}
            <motion.div ref={tableRef} aria-hidden="true" className="absolute inset-0" initial={false} animate={{ opacity: shows3d ? 1 : 0 }} transition={{ duration: 0.4, ease: "easeOut" }} />
          </div>

          <AnimatePresence>
            {stageStatus === "loading" && (
              <motion.p
                key="loading"
                role="status"
                className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[12px] font-medium text-[#12151c]"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <LoaderCircle size={13} aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> Setting up the table…
              </motion.p>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {card && (
              <motion.div
                key={card}
                className={`absolute inset-0 grid justify-items-center p-3 ${card === "ready" ? "pointer-events-none" : ""} ${card === "ready" && shows3d && stageCard === "low" ? "items-end" : "items-center"}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <motion.div
                  className={`max-w-[20rem] rounded-xl bg-white/95 text-center text-[#12151c] shadow-[0_12px_32px_-12px_rgba(18,21,28,0.55)] sm:px-5 sm:py-4 ${compactCard ? "px-3 py-2" : "px-4 py-3"}`}
                  initial={{ scale: 0.9, y: 12 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.96, y: -6 }}
                  transition={springy}
                >
                  {card === "paused" ? (
                    <>
                      <p className={`${pixelFont} text-xl sm:text-2xl`}>Paused</p>
                      <button type="button" className={cardButton} onClick={() => togglePause()}>
                        <Play size={15} aria-hidden="true" /> Resume
                      </button>
                    </>
                  ) : card === "ended" ? (
                    <>
                      <motion.p
                        className={`${pixelFont} text-xl sm:text-2xl`}
                        initial={{ scale: 0.6, rotate: -4 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: "spring", stiffness: 380, damping: 13, delay: 0.06 }}
                      >
                        {view.headline}
                      </motion.p>
                      <p className="mt-1 text-[13px] text-[#4b5260]">{view.result}</p>
                      <button type="button" className={cardButton} onClick={restart}>
                        <RotateCcw size={15} aria-hidden="true" /> {count > 1 ? "Rematch" : "Play again"}
                      </button>
                    </>
                  ) : (
                    <>
                      <p className={`${pixelFont} sm:text-2xl ${compactCard ? "text-lg" : "text-xl"}`}>{spec.title}</p>
                      {count > 1 && (
                        <ul className={`mt-2 flex-wrap justify-center gap-1.5 ${compactCard ? "hidden sm:flex" : "flex"}`} aria-label="Who's playing">
                          {seats.map((seat, index) => (
                            <li key={index} className="inline-flex items-center gap-1 rounded-full bg-[#f4f5f7] py-0.5 pl-1 pr-2 text-[12px] font-medium">
                              <span className="h-3 w-3 rounded-full" style={{ background: SEATS[index]!.color }} aria-hidden="true" />
                              {seat.name}
                              {seat.bot && <span className="text-[#6b7180]">(computer)</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className={`text-[13px] text-[#4b5260] pointer-coarse:hidden ${compactCard ? "mt-1 sm:mt-2" : "mt-2"}`}>{startKeys}</p>
                      <p className={`hidden text-[13px] text-[#4b5260] pointer-coarse:block ${compactCard ? "mt-1 sm:mt-2" : "mt-2"}`}>{startTouch}</p>
                    </>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {view.hint && !paused && phase === "playing" && (
              <motion.p
                key={view.hint}
                className={`pointer-events-none absolute inset-x-0 px-3 text-center ${shows3d ? "top-3" : "top-[62%]"}`}
                initial={{ opacity: 0, y: 8, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6 }}
                transition={springy}
              >
                <span className="rounded-md bg-white/90 px-2 py-0.5 text-[12px] font-medium text-[#12151c]">{view.hint}</span>
              </motion.p>
            )}
          </AnimatePresence>
          <p className="sr-only" aria-live="polite">{status}</p>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <dl className="flex flex-wrap items-end gap-1.5">
            {hud.map((item, index) => (
              <div
                key={`${item.label}-${index}`}
                className={`relative flex min-w-[3.4rem] flex-col overflow-hidden rounded-lg bg-[#f4f5f7] py-1.5 pl-2.5 pr-2.5 ${item.out ? "opacity-45" : ""}`}
              >
                {item.seat !== undefined && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ background: SEATS[item.seat]!.color }} />}
                <dt className="flex max-w-[7rem] items-center gap-1 truncate text-[11px] font-medium text-[#5c6371]">
                  <span className={`truncate ${item.out ? "line-through" : ""}`}>{item.label}</span>
                  {item.badge && <span className="rounded bg-[#12151c] px-1 text-[9.5px] font-semibold uppercase leading-[14px] text-white">{item.badge}</span>}
                </dt>
                {/* Each new score rolls in from below as the old one leaves. */}
                <dd className={`${pixelFont} relative text-xl leading-none tabular-nums text-[#12151c]`}>
                  <AnimatePresence initial={false} mode="popLayout">
                    <motion.span
                      key={item.value}
                      className="inline-block"
                      initial={{ y: "70%", opacity: 0, scale: 1.3 }}
                      animate={{ y: 0, opacity: 1, scale: 1 }}
                      exit={{ y: "-70%", opacity: 0 }}
                      transition={flip}
                    >
                      {item.value}
                    </motion.span>
                  </AnimatePresence>
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex items-center gap-1.5">
            {view.pads > 0 && (
              <span className="mr-1 inline-flex items-center gap-1 text-[12px] text-[#5c6371]" title="Game controllers connected">
                <Gamepad2 size={15} aria-hidden="true" /> {view.pads}
                <span className="sr-only"> game controller{view.pads === 1 ? "" : "s"} connected</span>
              </span>
            )}
            {spec.stage && (
              <button
                type="button"
                className={`${iconButton} aria-pressed:bg-[#12151c] aria-pressed:text-white aria-pressed:hover:bg-black`}
                onClick={toggle3d}
                disabled={!has3d}
                aria-pressed={has3d && want3d}
                aria-label="3D table (V)"
                title={has3d ? `3D table ${want3d ? "on" : "off"} (V)` : "3D isn't available in this browser"}
              >
                <Box size={16} aria-hidden="true" />
              </button>
            )}
            {canPause && (
              <button type="button" className={iconButton} onClick={togglePause} disabled={!paused && phase !== "playing"} aria-label={paused ? "Resume (P)" : "Pause (P)"} title={paused ? "Resume (P)" : "Pause (P)"}>
                {paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
              </button>
            )}
            <button type="button" className={iconButton} onClick={restart} aria-label="Restart (R)" title="Restart (R)">
              <RotateCcw size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={iconButton}
              onClick={() => setSoundOn((value) => !value)}
              aria-pressed={soundOn}
              aria-label="Sound (M)"
              title={soundOn ? "Sound on (M)" : "Sound off (M)"}
            >
              {soundOn ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
            </button>
          </div>
        </div>

        {spec.dpad && !local && (
          <div className="mx-auto hidden grid-cols-3 gap-1.5 pointer-coarse:grid" aria-label="Arrows" role="group">
            {(
              [
                ["up", ArrowUp, "col-start-2"],
                ["left", ArrowLeft, "col-start-1 row-start-2"],
                ["down", ArrowDown, "col-start-2 row-start-2"],
                ["right", ArrowRight, "col-start-3 row-start-2"],
              ] as const
            ).map(([direction, Icon, place]) => (
              <button
                key={direction}
                type="button"
                aria-label={direction[0]!.toUpperCase() + direction.slice(1)}
                className={`${place} grid h-14 w-14 touch-none select-none place-items-center rounded-xl bg-[#f4f5f7] text-[#12151c] active:bg-[#e3e5e8] ${focusRing}`}
                onPointerDown={(event) => {
                  event.preventDefault();
                  press(direction);
                }}
                onPointerUp={() => release(direction)}
                onPointerLeave={() => release(direction)}
                onPointerCancel={() => release(direction)}
                onContextMenu={(event) => event.preventDefault()}
              >
                <Icon size={22} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}

        <div id={controlsId} className="text-[12px] leading-relaxed text-[#5c6371]">
          {local ? (
            // Everyone's keys, by seat colour, with the controller that also works for them.
            <ul className="grid grid-cols-1 gap-1 pointer-coarse:hidden sm:grid-cols-2">
              {humans.map((seat) => (
                <li key={seat.index} className="flex flex-wrap items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: SEATS[seat.index]!.color }} aria-hidden="true" />
                  <span className="font-semibold text-[#12151c]">{seat.name}</span>
                  <kbd className={kbd}>{spec.seatKeys?.[seat.index] ?? KEY_SETS[seat.index]!.keys}</kbd>
                  {spec.action && (
                    <>
                      <kbd className={kbd}>{KEY_SETS[seat.index]!.button}</kbd>
                      <span>{spec.action}</span>
                    </>
                  )}
                  <span className="text-[#8a909b]">or controller {seat.index + 1}</span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 pointer-coarse:hidden">
              {[
                { keys: spec.move, action: "move" },
                ...(spec.action ? [{ keys: ["Space"], action: spec.action }] : []),
                ...(canPause ? [{ keys: ["P"], action: "pause" }] : []),
                ...(has3d ? [{ keys: ["V"], action: "3D" }] : []),
                { keys: ["R"], action: mode.kind === "online" ? "rematch" : "restart" },
                { keys: ["Esc"], action: "close" },
              ].map((control) => (
                <li key={control.action} className="flex items-center gap-1">
                  {control.keys.map((key) => (
                    <kbd key={key} className={kbd}>
                      {key}
                    </kbd>
                  ))}
                  <span>{control.action}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="hidden pointer-coarse:block">{local ? spec.multiTouch : spec.touch}</p>
        </div>
      </div>
    </MotionConfig>
  );
}
