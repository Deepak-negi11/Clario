"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { Bot, ChevronDown, ChevronLeft, ChevronRight, Gamepad2, Globe, LoaderCircle, Pause, Play, Redo2, RotateCcw, Undo2, User, UsersRound, Volume2, VolumeX, X } from "lucide-react";
import { LEVELS, seeded, type Level, type Sound } from "./arcade-kit";
import { playSound } from "./arcade-sound";
import { OverlayDialog } from "./overlay-dialog";
import type { PlayLink } from "./play-link";
import { createBot } from "./tetris-ai";
import type { CabinetButton, CabinetControls, CabinetFrame, TetrisCabinet } from "./tetris-3d";
import { createAutoRepeat, createTetris, type Tetris, type TetrisEvent } from "./tetris-rules";
import { applyTetrisSnapshot, snapshotTetris, useTetrisOnline, type TetrisOnline } from "./tetris-online";
import { TetrisOnlinePanel } from "./tetris-online-panel";
import { createScreenPainter } from "./tetris-screen";

// Tetris on the Game Room's arcade machines, as a modal. The game (tetris-rules.ts) is painted onto
// a canvas (tetris-screen.ts) that becomes the monitor of a 3D cabinet (tetris-3d.ts, loaded only
// when this opens: three.js is large), with the blocks themselves in 3D. Until it loads, or without
// WebGL, the screen is shown flat.
// Four ways to play: alone, against the computer (tetris-ai.ts), two people on one keyboard, or
// online with someone else in the space (tetris-online.ts: each runs their own game, from one seed).
// In versus both get the same pieces, clears send garbage to the other, and the last one standing
// wins; the other player's game is on the machine to the right (on phones, in the corner).
// Keys, game controllers, or on touch screens the buttons and swipes. Escape closes it; the game
// pauses itself when the window loses focus.

const SOUND_KEY = "arcade:sound";
const BEST_KEY = "arcade:best:tetris";
const MODE_KEY = "arcade:tetris:mode";
// Shared with the Game Room (arcade-overlay.tsx).
const LEVEL_KEY = "arcade:level";
// How long a button on the cabinet stays down after a tap, in seconds.
const PRESS_SHOWN = 0.12;
const PAD_THRESHOLD = 0.5;
// Touch: a sideways drag of this many pixels moves a column; a quick flick down drops.
const SWIPE_STEP = 28;
const FLICK_SPEED = 1.1;

type Mode = "solo" | "computer" | "local" | "online";
const MODES: { id: Mode; label: string; short: string }[] = [
  { id: "solo", label: "1 player", short: "Solo" },
  { id: "computer", label: "vs Computer", short: "vs CPU" },
  { id: "local", label: "2 players", short: "2P" },
];
// Online is only offered in a space (with a link to the others there), and never remembered.
const ONLINE_MODE: { id: Mode; label: string; short: string } = { id: "online", label: "Online", short: "Online" };
// How often your screen goes to the other player when playing online, in seconds.
const SNAPSHOT_EVERY = 0.1;
const LEVEL_NAMES: Record<Level, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

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
    // Private mode or full storage: it just isn't remembered.
  }
}

function useMedia(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

// What each event sounds like, from the arcade's own blips.
function soundFor(event: TetrisEvent): Sound {
  switch (event.type) {
    case "move":
      return "tick";
    case "rotate":
      return "hit";
    case "land":
    case "lock":
      return "bump";
    case "hardDrop":
      return "dash";
    case "hold":
      return "eat";
    case "clear":
      return event.lines === 4 || (event.tSpin && event.lines > 0) ? "win" : event.lines > 0 ? "brick" : "score";
    case "level":
      return "power";
    case "attack":
      return "smash";
    case "garbage":
      return "wall";
    case "over":
      return "lose";
  }
}

type Action = "left" | "right" | "soft" | "cw" | "ccw" | "drop" | "hold" | "start" | "pause";

// Alone or against the computer: every usual key is yours.
const SOLO_KEYS: Record<string, Action> = {
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
  ArrowDown: "soft", KeyS: "soft",
  ArrowUp: "cw", KeyX: "cw", KeyW: "cw",
  KeyZ: "ccw", ControlLeft: "ccw", ControlRight: "ccw",
  Space: "drop",
  KeyC: "hold", ShiftLeft: "hold", ShiftRight: "hold",
  Enter: "start", NumpadEnter: "start",
  KeyP: "pause", F1: "pause",
};
// Two on one keyboard: the left hand's keys and the right hand's.
const DUO_KEYS: Record<string, [player: 0 | 1, action: Action]> = {
  KeyA: [0, "left"], KeyD: [0, "right"], KeyS: [0, "soft"], KeyW: [0, "cw"], KeyQ: [0, "ccw"], KeyE: [0, "hold"], Space: [0, "drop"],
  ArrowLeft: [1, "left"], ArrowRight: [1, "right"], ArrowDown: [1, "soft"], ArrowUp: [1, "cw"], Period: [1, "ccw"], ShiftRight: [1, "hold"], Slash: [1, "drop"],
  Enter: [0, "start"], NumpadEnter: [0, "start"], KeyP: [0, "pause"],
};

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffe066]";
const iconButton = `grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-xl bg-white/[0.07] text-[#c9cde0] transition hover:bg-white/[0.14] hover:text-white active:scale-[0.96] disabled:cursor-default disabled:opacity-40 motion-reduce:transition-none ${focusRing}`;
const textButton = `inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-white/[0.07] px-3 text-[13px] font-semibold text-[#c9cde0] transition hover:bg-white/[0.14] hover:text-white active:scale-[0.96] motion-reduce:transition-none ${focusRing}`;
const segment = `inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[12.5px] font-semibold text-[#a9aec4] transition hover:text-white aria-pressed:bg-white/[0.14] aria-pressed:text-white disabled:cursor-default disabled:opacity-40 motion-reduce:transition-none ${focusRing}`;
const kbd = "min-w-6 rounded-md border border-white/15 bg-white/[0.06] px-1.5 py-px text-center font-mono text-[11px] text-[#e4e6f0]";
const pad = `grid cursor-pointer touch-none select-none place-items-center rounded-2xl border border-white/10 bg-white/[0.08] text-white shadow-[inset_0_-3px_0_rgba(0,0,0,0.35)] transition active:translate-y-px active:bg-white/[0.18] active:shadow-none motion-reduce:transition-none ${focusRing}`;

type StageStatus = "loading" | "ready" | "flat";
type Hands = { repeat: ReturnType<typeof createAutoRepeat>; soft: { key: boolean; touch: boolean; pad: boolean }; pressed: Record<CabinetButton, number> };

const freshHands = (): Hands => ({ repeat: createAutoRepeat(), soft: { key: false, touch: false, pad: false }, pressed: { cw: 0, ccw: 0, hold: 0, drop: 0, start: 0 } });

// Games: yours, and in versus the other player's (same pieces, from the same seed).
function makeGames(seed = newSeed()): [Tetris, Tetris] {
  return [createTetris({ random: seeded(seed) }), createTetris({ random: seeded(seed) })];
}
const newSeed = () => Math.floor(Math.random() * 2 ** 31);

function storedMode(): Mode {
  const value = readStored(MODE_KEY);
  return MODES.find((mode) => mode.id === value)?.id ?? "solo";
}
function storedLevel(): Level {
  const value = readStored(LEVEL_KEY);
  return LEVELS.find((level) => level === value) ?? "medium";
}

export function TetrisOverlay({
  onDismiss,
  onMoreGames,
  banner,
  link,
  joined,
}: {
  onDismiss: () => void;
  onMoreGames?: () => void;
  banner?: ReactNode;
  // In a space: online play with the others there. `joined`: you accepted someone's invite.
  link?: PlayLink;
  joined?: { hostId: string; hostName: string };
}) {
  const titleId = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLCanvasElement>(null);
  const rivalScreenRef = useRef<HTMLCanvasElement>(null);
  const cabinetRef = useRef<TetrisCabinet | null>(null);
  const reducedMotion = useMedia("(prefers-reduced-motion: reduce)");
  const touch = useMedia("(pointer: coarse)");
  const [mode, setModeState] = useState<Mode>(() => {
    if (joined) return "online";
    const stored = storedMode();
    return stored === "local" && window.matchMedia("(pointer: coarse)").matches ? "solo" : stored;
  });
  const [level, setLevelState] = useState<Level>(storedLevel);
  const versus = mode !== "solo";

  const gamesRef = useRef<[Tetris, Tetris] | null>(null);
  gamesRef.current ??= makeGames();
  const botRef = useRef(createBot(level));
  const handsRef = useRef<[Hands, Hands]>([freshHands(), freshHands()]);
  const clockRef = useRef(0);
  // When the last game ended, so a drop still being mashed doesn't start the next one at once.
  const overAtRef = useRef(-Infinity);
  const soundRef = useRef(true);
  const bestRef = useRef(0);
  const narrowRef = useRef(false);
  const onlineRef = useRef<TetrisOnline | null>(null);
  const live = useRef({ mode, versus, reducedMotion, touch, rival: "" });
  live.current = { mode, versus, reducedMotion, touch, rival: "" };
  const [status, setStatus] = useState<StageStatus>("loading");
  const [phase, setPhase] = useState(gamesRef.current[0].state.phase);
  const [narrow, setNarrow] = useState(false);
  const [soundOn, setSoundOn] = useState(() => readStored(SOUND_KEY) !== "off");
  const [announce, setAnnounce] = useState("");

  useEffect(() => {
    soundRef.current = soundOn;
    writeStored(SOUND_KEY, soundOn ? "on" : "off");
  }, [soundOn]);

  useEffect(() => {
    bestRef.current = Number(readStored(BEST_KEY)) || 0;
  }, []);

  const focusStage = useCallback(() => stageRef.current?.focus({ preventScroll: true }), []);

  const press = useCallback((player: 0 | 1, button: CabinetButton) => {
    handsRef.current[player].pressed[button] = clockRef.current + PRESS_SHOWN;
  }, []);

  // A versus game from a seed both players share (online, the host picks it and sends it over).
  const beginSeeded = useCallback((seed: number) => {
    gamesRef.current = makeGames(seed);
    handsRef.current = [freshHands(), freshHands()];
    for (const game of gamesRef.current) game.start();
    if (soundRef.current) playSound("start");
    setAnnounce("Versus game started.");
  }, []);

  // Starts a game, or resumes a paused one; `fresh` starts over whatever is going on. Online the host
  // starts both games; the guest asks the host to.
  const start = useCallback((fresh = false) => {
    const games = gamesRef.current!;
    press(0, "start");
    if (live.current.mode === "online") {
      const online = onlineRef.current;
      if (!online?.partner) return;
      if (!fresh && games[0].state.phase === "playing") return;
      if (online.role === "host") {
        const seed = newSeed();
        online.send({ k: "t-go", seed });
        beginSeeded(seed);
      } else {
        online.send({ k: "t-again" });
        setAnnounce(`Asked ${online.partner.name} for a game.`);
      }
      return;
    }
    if (!fresh && games[0].state.phase === "paused") {
      for (const game of games) game.pause(false);
      return;
    }
    if (!fresh && games[0].state.phase === "playing") return;
    gamesRef.current = makeGames();
    botRef.current = createBot(level);
    handsRef.current = [freshHands(), freshHands()];
    gamesRef.current[0].start();
    if (versus) gamesRef.current[1].start();
    if (soundRef.current) playSound("start");
    setAnnounce(versus ? "Versus game started." : "Game started.");
  }, [press, level, versus, beginSeeded]);

  const online = useTetrisOnline({
    link,
    joined,
    active: mode === "online",
    handlers: {
      start: beginSeeded,
      rematch: () => start(true),
      attack: (lines) => gamesRef.current?.[0].receive(lines),
      rivalSnapshot: (snapshot) => {
        if (gamesRef.current) applyTetrisSnapshot(gamesRef.current[1].state, snapshot);
      },
      rivalOver: () => {
        const game = gamesRef.current?.[0];
        if (!game || (game.state.phase !== "playing" && game.state.phase !== "paused")) return;
        game.win();
        overAtRef.current = clockRef.current;
        if (soundRef.current) playSound("win");
        setAnnounce(`You win! ${onlineRef.current?.partner?.name ?? "The other player"} topped out.`);
      },
      left: (name) => setAnnounce(`${name} left the game.`),
    },
  });
  onlineRef.current = online;
  live.current.rival = online.partner?.name.toUpperCase() ?? "";
  // Online, a game against no one (they left, or you did) ends.
  const partnerId = online.partner?.id;
  useEffect(() => {
    if (mode === "online" && !partnerId) gamesRef.current = makeGames();
  }, [mode, partnerId]);

  const togglePause = useCallback(() => {
    if (live.current.mode === "online") return; // the other player can't wait for you
    const games = gamesRef.current!;
    const paused = games[0].state.phase === "paused";
    if (games[0].state.phase !== "playing" && !paused) return;
    for (const game of games) game.pause(!paused);
  }, []);

  // Changing how you play ends the game in progress.
  const setMode = (next: Mode) => {
    focusStage();
    if (next === mode) return;
    setModeState(next);
    if (next !== "online") writeStored(MODE_KEY, next);
    gamesRef.current = makeGames();
    setPhase("ready");
    focusStage();
  };
  const setLevel = (next: Level) => {
    setLevelState(next);
    writeStored(LEVEL_KEY, next);
    botRef.current = createBot(next);
    focusStage();
  };

  const setSoft = useCallback((player: 0 | 1, source: "key" | "touch" | "pad", on: boolean) => {
    const soft = handsRef.current[player].soft;
    soft[source] = on;
    gamesRef.current![player].setSoftDrop(soft.key || soft.touch || soft.pad);
  }, []);

  // One action for one player, from a key, a button, a swipe or a controller.
  const act = useCallback(
    (player: 0 | 1, action: Action, down: boolean) => {
      const game = gamesRef.current![player];
      const hands = handsRef.current[player];
      if (action === "soft") return setSoft(player, "key", down);
      if (action === "left" || action === "right") {
        const direction = action === "left" ? -1 : 1;
        if (!down) return hands.repeat.release(direction);
        if (hands.repeat.press(direction)) game.shift(direction);
        return;
      }
      if (!down) return;
      const phase = gamesRef.current![0].state.phase;
      if (action === "start") return start();
      if (action === "pause") return togglePause();
      // Before the first game and after the last, the play buttons start one.
      if (phase === "ready" || phase === "over" || phase === "won") {
        if ((action === "drop" || action === "cw") && clockRef.current - overAtRef.current > 1) start();
        return;
      }
      if (phase === "paused") return;
      if (action === "cw") {
        press(player, "cw");
        game.rotate(1);
      } else if (action === "ccw") {
        press(player, "ccw");
        game.rotate(-1);
      } else if (action === "drop") {
        press(player, "drop");
        game.hardDrop();
      } else if (action === "hold") {
        press(player, "hold");
        game.hold();
      }
    },
    [press, setSoft, start, togglePause],
  );
  const actRef = useRef(act);
  actRef.current = act;

  const onKey = (event: KeyboardEvent, down: boolean) => {
    const mapped: [0 | 1, Action] | undefined = mode === "local" ? DUO_KEYS[event.code] : SOLO_KEYS[event.code] ? [0, SOLO_KEYS[event.code]!] : undefined;
    if (!mapped) return;
    const [player, action] = mapped;
    // Enter and Space on a button press that button.
    if ((action === "start" || action === "drop") && event.target !== stageRef.current) return;
    event.preventDefault();
    if (down && event.repeat) return;
    act(player, action, down);
  };

  // Let go of everything when focus leaves (a key released elsewhere would stay stuck down), and pause.
  useEffect(() => {
    const release = () => {
      handsRef.current.forEach((hands, player) => {
        hands.repeat.clear();
        hands.soft = { key: false, touch: false, pad: false };
        gamesRef.current?.[player]?.setSoftDrop(false);
      });
      // Online the other player is still going: no pause, just let go of the keys.
      if (live.current.mode !== "online") for (const game of gamesRef.current ?? []) game.pause(true);
    };
    const onVisibility = () => {
      if (document.hidden) release();
    };
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    focusStage();
  }, [focusStage]);

  // Phones and squarish boxes: the camera stays on your screen, and the other player's is in the corner.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const check = () => {
      const isNarrow = host.clientWidth / Math.max(1, host.clientHeight) < 1.3;
      narrowRef.current = isNarrow;
      setNarrow(isNarrow);
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  // The 3D cabinet: loaded on demand and sized to its box. If WebGL isn't there, or the GPU is lost
  // later, the flat screen carries on.
  useEffect(() => {
    const host = hostRef.current;
    const screen = screenRef.current;
    const rivalScreen = rivalScreenRef.current;
    if (!host || !screen || !rivalScreen) return;
    let cancelled = false;
    let cabinet: TetrisCabinet | null = null;
    let observer: ResizeObserver | null = null;
    setStatus("loading");
    import("./tetris-3d")
      .then(({ createTetrisCabinet }) => {
        if (cancelled) return;
        cabinet = createTetrisCabinet({
          screens: [screen, rivalScreen],
          reducedMotion,
          onLost: () => {
            cabinetRef.current = null;
            setStatus("flat");
          },
        });
        cabinet.canvas.className = "absolute inset-0 block h-full w-full";
        cabinet.canvas.setAttribute("aria-hidden", "true");
        host.appendChild(cabinet.canvas);
        const fit = () => cabinet?.resize(host.clientWidth, host.clientHeight);
        fit();
        observer = new ResizeObserver(fit);
        observer.observe(host);
        cabinetRef.current = cabinet;
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("flat");
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      cabinetRef.current = null;
      cabinet?.dispose();
    };
  }, [reducedMotion]);

  // The loop: controllers, auto-repeat, the computer, both games and the garbage between them,
  // sounds and effects, both screens, the cabinet.
  useEffect(() => {
    const screen = screenRef.current;
    const rivalScreen = rivalScreenRef.current;
    if (!screen || !rivalScreen) return;
    const paint = [createScreenPainter(screen), createScreenPainter(rivalScreen)];
    const padsBefore = new Map<number, boolean[]>();
    let frame = 0;
    let last = performance.now();
    let shownPhase = gamesRef.current![0].state.phase;
    let snapshotClock = 0;
    // The computer's machine: its stick and buttons follow what its piece just did.
    let botLast = { x: 0, rotation: 0, pieces: 0 };
    const controls: [CabinetControls, CabinetControls] = [0, 1].map(() => ({
      stick: { x: 0, down: false },
      pressed: { cw: false, ccw: false, hold: false, drop: false, start: false },
    })) as [CabinetControls, CabinetControls];

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      clockRef.current += dt;
      const time = clockRef.current;
      const games = gamesRef.current!;
      const { mode, versus, reducedMotion, touch, rival } = live.current;
      // Online the other player's game runs on their machine: only yours is played here.
      const remote = mode === "online";

      // Game controllers: d-pad or stick to move, A and B to turn, X or a shoulder to hold, up to drop.
      // Two players on one device each take a controller; otherwise any controller is yours.
      const padSoft = [false, false];
      connectedPads().forEach((gamepad, order) => {
        const player = mode === "local" ? (Math.min(order, 1) as 0 | 1) : 0;
        const x = gamepad.axes[0] ?? 0;
        const y = gamepad.axes[1] ?? 0;
        const button = (index: number) => gamepad.buttons[index]?.pressed ?? false;
        const state = [button(14) || x < -PAD_THRESHOLD, button(15) || x > PAD_THRESHOLD, button(12) || y < -PAD_THRESHOLD, button(0), button(1), button(2) || button(4) || button(5), button(9)];
        const before = padsBefore.get(gamepad.index) ?? [];
        padsBefore.set(gamepad.index, state);
        const edge = (index: number, action: Action) => {
          if (state[index] !== !!before[index]) actRef.current(player, action, state[index]!);
        };
        edge(0, "left");
        edge(1, "right");
        edge(2, "drop");
        edge(3, "cw");
        edge(4, "ccw");
        edge(5, "hold");
        edge(6, games[0].state.phase === "playing" ? "pause" : "start");
        if (button(13) || y > PAD_THRESHOLD) padSoft[player] = true;
      });
      ([0, 1] as const).forEach((player) => {
        if (padSoft[player] !== handsRef.current[player].soft.pad) setSoft(player, "pad", padSoft[player]!);
      });

      const players = versus && !remote ? 2 : 1;
      for (let player = 0; player < players; player++) {
        const game = games[player]!;
        const steps = handsRef.current[player]!.repeat.step(dt);
        for (let i = 0; i < Math.abs(steps); i++) if (!game.shift(steps < 0 ? -1 : 1)) break;
      }
      if (mode === "computer") botRef.current.step(games[1], dt);
      for (let player = 0; player < players; player++) games[player]!.step(dt);

      // Events: sounds, effects, garbage to the other player, and who's won.
      for (let player = 0; player < players; player++) {
        const game = games[player]!;
        const other = games[1 - player]!;
        for (const event of game.drain()) {
          if (soundRef.current && (player === 0 || mode === "local")) playSound(soundFor(event));
          cabinetRef.current?.effect(player, event, game);
          if (event.type === "attack" && versus) {
            if (remote) onlineRef.current?.send({ k: "t-atk", n: event.lines });
            else other.receive(event.lines);
          }
          if (player !== 0) {
            if (event.type === "over" && versus) {
              other.win();
              overAtRef.current = time;
              if (soundRef.current) playSound("win");
              setAnnounce(mode === "local" ? "Player 1 wins!" : "You win! The computer topped out.");
            }
            continue;
          }
          if (event.type === "clear" && event.lines > 0) setAnnounce(`${event.label}. Score ${game.state.score}.`);
          else if (event.type === "level") setAnnounce(`Level ${event.level}.`);
          else if (event.type === "over") {
            overAtRef.current = time;
            if (versus && remote) {
              // You topped out: tell the other player they've won (their game ends itself).
              onlineRef.current?.send({ k: "t-over" });
              setAnnounce(`${onlineRef.current?.partner?.name ?? "The other player"} wins. Play again?`);
              continue;
            }
            if (versus) {
              other.win();
              setAnnounce(mode === "local" ? "Player 2 wins!" : "The computer wins. Try again?");
              continue;
            }
            const best = bestRef.current;
            if (game.state.score > best) {
              bestRef.current = game.state.score;
              writeStored(BEST_KEY, String(game.state.score));
            }
            setAnnounce(`Game over. Score ${game.state.score}, ${game.state.lines} lines.${game.state.score > best ? " New best!" : ""}`);
          }
        }
      }

      const blocks3d = !!cabinetRef.current;
      const startLine = touch ? "TAP START" : "PRESS ENTER";
      paint[0]!(games[0], {
        best: bestRef.current, touch, reducedMotion, blocks3d, versus, startLine,
        name: versus ? (mode === "local" ? "PLAYER 1" : "YOU") : undefined,
      }, time);
      if (versus) {
        const rivalName = remote ? rival || "WAITING" : mode === "local" ? "PLAYER 2" : "COMPUTER";
        paint[1]!(games[1], { best: 0, touch, reducedMotion, versus, startLine, name: rivalName }, time);
      }

      // Online: your screen goes to the other player, about ten times a second.
      snapshotClock += dt;
      if (remote && snapshotClock >= SNAPSHOT_EVERY && onlineRef.current?.partner) {
        snapshotClock = 0;
        onlineRef.current.send({ k: "t-s", s: snapshotTetris(games[0].state) });
      }

      // The machines' sticks and buttons.
      ([0, 1] as const).forEach((player) => {
        const hands = handsRef.current[player];
        controls[player].stick.x = hands.repeat.direction();
        controls[player].stick.down = hands.soft.key || hands.soft.touch || hands.soft.pad;
        for (const id of Object.keys(controls[player].pressed) as CabinetButton[]) controls[player].pressed[id] = hands.pressed[id] > time;
      });
      if (mode === "computer") {
        const piece = games[1].state.piece;
        if (piece) {
          if (piece.rotation !== botLast.rotation && games[1].state.pieces === botLast.pieces) press(1, "cw");
          controls[1].stick.x = games[1].state.pieces === botLast.pieces ? Math.sign(piece.x - botLast.x) : 0;
          if (games[1].state.pieces !== botLast.pieces) press(1, "drop");
          botLast = { x: piece.x, rotation: piece.rotation, pieces: games[1].state.pieces };
        }
      }
      const state = games[0].state.phase;
      const cabinetFrame: CabinetFrame = {
        // Up close while playing, and for a few seconds after, to read the end card.
        playing: state === "playing" || state === "paused" || ((state === "over" || state === "won") && time - overAtRef.current < 4),
        versus,
        narrow: narrowRef.current,
        players: [{ game: games[0], controls: controls[0] }, ...(versus ? [{ game: games[1], controls: controls[1] }] : [])],
      };
      cabinetRef.current?.render(dt, time, cabinetFrame);

      if (state !== shownPhase) {
        shownPhase = state;
        setPhase(state);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [setSoft, press]);

  // A little parallax as the mouse moves over the cabinet.
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") {
      const rect = event.currentTarget.getBoundingClientRect();
      cabinetRef.current?.look(((event.clientX - rect.left) / rect.width) * 2 - 1, -(((event.clientY - rect.top) / rect.height) * 2 - 1));
      return;
    }
    swipeMove(event);
  };

  // Touch on the cabinet: drag sideways to move, drag down to soft drop, flick down to drop, tap to turn.
  const swipeRef = useRef<{ id: number; x: number; y: number; at: number; moved: boolean; lastY: number; lastAt: number } | null>(null);
  const swipeStart = (event: PointerEvent<HTMLDivElement>) => {
    focusStage();
    if (event.pointerType === "mouse" || gamesRef.current![0].state.phase !== "playing") return;
    swipeRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, at: event.timeStamp, moved: false, lastY: event.clientY, lastAt: event.timeStamp };
  };
  const swipeMove = (event: PointerEvent<HTMLDivElement>) => {
    const swipe = swipeRef.current;
    if (!swipe || swipe.id !== event.pointerId) return;
    const game = gamesRef.current![0];
    while (Math.abs(event.clientX - swipe.x) >= SWIPE_STEP) {
      const direction = event.clientX > swipe.x ? 1 : -1;
      game.shift(direction);
      swipe.x += direction * SWIPE_STEP;
      swipe.moved = true;
    }
    if (event.clientY - swipe.y > SWIPE_STEP * 1.5) {
      swipe.moved = true;
      setSoft(0, "touch", true);
    }
    swipe.lastY = event.clientY;
    swipe.lastAt = event.timeStamp;
  };
  const swipeEnd = (event: PointerEvent<HTMLDivElement>) => {
    const swipe = swipeRef.current;
    if (!swipe || swipe.id !== event.pointerId) return;
    swipeRef.current = null;
    setSoft(0, "touch", false);
    const game = gamesRef.current![0];
    const speed = (event.clientY - swipe.y) / Math.max(1, event.timeStamp - swipe.at);
    if (speed > FLICK_SPEED && event.clientY - swipe.y > 60) {
      press(0, "drop");
      game.hardDrop();
    } else if (!swipe.moved && event.timeStamp - swipe.at < 300) {
      press(0, "cw");
      game.rotate(1);
    }
  };

  // On-screen buttons: held for moves and soft drop, tapped for the rest. They don't take focus,
  // so the keys keep working.
  const hold = (action: Action) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      if (action === "soft") setSoft(0, "touch", true);
      else act(0, action, true);
    },
    onPointerUp: () => (action === "soft" ? setSoft(0, "touch", false) : act(0, action, false)),
    onPointerCancel: () => (action === "soft" ? setSoft(0, "touch", false) : act(0, action, false)),
    onContextMenu: (event: MouseEvent) => event.preventDefault(),
  });

  const playing = phase === "playing";
  const idle = phase === "ready" || phase === "over" || phase === "won";
  const rivalVisible = versus && (narrow || status === "flat");
  const modes = [...MODES.filter((option) => option.id !== "local" || !touch), ...(link ? [ONLINE_MODE] : [])];
  // Online, a game needs someone to play.
  const canStart = mode !== "online" || !!online.partner;

  return (
    <OverlayDialog labelledBy={titleId} onDismiss={onDismiss} className="w-[min(70rem,calc(100vw-1rem))]">
      <div
        className="flex flex-col gap-2.5 rounded-2xl border border-white/10 bg-[#0d0b18] p-2.5 text-white shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] sm:gap-3 sm:p-3.5"
        onKeyDown={(event) => onKey(event, true)}
        onKeyUp={(event) => onKey(event, false)}
      >
        {banner}
        <header className="flex items-center gap-2">
          <h2 id={titleId} className="mr-auto pl-1 font-[family-name:var(--font-pixel)] text-xl leading-none tracking-wide text-[#ffe066] sm:text-2xl">
            Tetris
          </h2>
          {onMoreGames && (
            <button type="button" onClick={onMoreGames} className={textButton}>
              <Gamepad2 size={16} aria-hidden="true" />
              <span className="hidden sm:inline">More games</span>
              <span className="sr-only sm:hidden">More games</span>
            </button>
          )}
          <button type="button" onClick={() => setSoundOn((value) => !value)} aria-pressed={soundOn} aria-label="Sound" className={iconButton}>
            {soundOn ? <Volume2 size={17} aria-hidden="true" /> : <VolumeX size={17} aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={() => {
              togglePause();
              focusStage();
            }}
            disabled={mode === "online" || (!playing && phase !== "paused")}
            aria-label={phase === "paused" ? "Resume" : "Pause"}
            className={iconButton}
          >
            {phase === "paused" ? <Play size={17} aria-hidden="true" /> : <Pause size={17} aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={() => {
              start(true);
              focusStage();
            }}
            disabled={mode === "online" && !online.partner}
            aria-label="New game"
            className={iconButton}
          >
            <RotateCcw size={17} aria-hidden="true" />
          </button>
          <button type="button" onClick={onDismiss} aria-label="Close Tetris" className={iconButton}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="How to play" className="flex gap-1 rounded-xl bg-white/[0.06] p-1">
            {modes.map((option) => (
              <button key={option.id} type="button" aria-pressed={mode === option.id} onClick={() => setMode(option.id)} className={segment}>
                {option.id === "solo" ? (
                  <User size={14} aria-hidden="true" />
                ) : option.id === "computer" ? (
                  <Bot size={14} aria-hidden="true" />
                ) : option.id === "online" ? (
                  <Globe size={14} aria-hidden="true" />
                ) : (
                  <UsersRound size={14} aria-hidden="true" />
                )}
                <span className="sm:hidden">{option.short}</span>
                <span className="hidden sm:inline">{option.label}</span>
              </button>
            ))}
          </div>
          {mode === "computer" && (
            <div role="group" aria-label="How well the computer plays" className="flex gap-1 rounded-xl bg-white/[0.06] p-1">
              {LEVELS.map((option) => (
                <button key={option} type="button" aria-pressed={level === option} onClick={() => setLevel(option)} className={segment}>
                  {LEVEL_NAMES[option]}
                </button>
              ))}
            </div>
          )}
          {versus && mode !== "online" && <p className="hidden text-[12px] text-[#a9aec4] sm:block">Same pieces for both. Clear 2+ lines to send garbage; last one standing wins.</p>}
        </div>
        {mode === "online" && <TetrisOnlinePanel online={online} playing={playing} />}

        <div
          ref={stageRef}
          tabIndex={0}
          role="group"
          aria-roledescription="game"
          aria-label={mode === "local" ? "Tetris, two players. Player 1: A D move, W turn, S soft drop, Space drop, E hold. Player 2: arrows, slash drops, right Shift holds." : "Tetris cabinet. Arrow keys move, up turns, space drops, C holds, P pauses."}
          onPointerMove={onPointerMove}
          onPointerLeave={() => cabinetRef.current?.look(null, null)}
          onPointerDown={swipeStart}
          onPointerUp={swipeEnd}
          onPointerCancel={swipeEnd}
          // A click or tap on the cabinet starts a game.
          onClick={() => {
            if (idle && clockRef.current - overAtRef.current > 1) start();
          }}
          className="relative h-[clamp(15rem,52dvh,42rem)] w-full touch-none overflow-hidden rounded-xl bg-[#07050d] outline-none ring-[#ffe066]/60 focus-visible:ring-2 sm:h-[min(68dvh,44rem)]"
        >
          <div ref={hostRef} className="absolute inset-0" />
          <canvas
            ref={screenRef}
            aria-hidden="true"
            className={`absolute inset-0 h-full w-full object-contain p-2 ${status === "ready" ? "invisible" : ""}`}
          />
          {/* The other player's screen: on the machine next door, or here in the corner on phones. */}
          <canvas
            ref={rivalScreenRef}
            aria-hidden="true"
            className={`pointer-events-none absolute right-2 bottom-2 w-[30%] max-w-64 rounded-md ring-1 ring-white/25 ${rivalVisible ? "" : "hidden"}`}
          />
          {status === "loading" && (
            <p role="status" className="absolute right-3 bottom-3 flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1.5 text-[12px] text-[#c9cde0]">
              <LoaderCircle size={14} aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> Setting up the cabinet…
            </p>
          )}
          <p className="sr-only" role="status" aria-live="polite">
            {announce}
          </p>
        </div>

        {/* Touch screens: a pad on the left, the turn, drop and hold buttons on the right. Swipes work on the cabinet too. */}
        <div className="hidden grid-cols-2 items-end gap-3 pointer-coarse:grid">
          <div className="grid grid-cols-3 gap-1.5">
            <button type="button" tabIndex={-1} aria-label="Move left" className={`${pad} h-[4.5rem]`} {...hold("left")}>
              <ChevronLeft size={30} aria-hidden="true" />
            </button>
            <button type="button" tabIndex={-1} aria-label="Soft drop" className={`${pad} h-[4.5rem]`} {...hold("soft")}>
              <ChevronDown size={30} aria-hidden="true" />
            </button>
            <button type="button" tabIndex={-1} aria-label="Move right" className={`${pad} h-[4.5rem]`} {...hold("right")}>
              <ChevronRight size={30} aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <button type="button" tabIndex={-1} aria-label="Hold" className={`${pad} h-12 text-[12px] font-bold tracking-wide text-[#ffe066]`} {...hold("hold")}>
              HOLD
            </button>
            <button type="button" tabIndex={-1} aria-label="Turn left" className={`${pad} h-12 text-[#7ee08f]`} {...hold("ccw")}>
              <Undo2 size={22} aria-hidden="true" />
            </button>
            <button type="button" tabIndex={-1} aria-label="Turn right" className={`${pad} h-12 text-[#8fb2ff]`} {...hold("cw")}>
              <Redo2 size={22} aria-hidden="true" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label={idle ? "Start" : "Hard drop"}
              className={`${pad} col-span-3 h-14 bg-[#e2332e]/80 text-[14px] font-bold tracking-wider active:bg-[#e2332e]`}
              {...hold(idle ? "start" : "drop")}
            >
              {idle ? "START" : "DROP"}
            </button>
          </div>
        </div>

        {/* Keyboards: how to play, and a start button. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-[12.5px] text-[#a9aec4] pointer-coarse:hidden">
          {mode === "local" ? (
            <>
              <span className="flex items-center gap-1.5">
                <strong className="font-semibold text-white">P1</strong> <kbd className={kbd}>A</kbd><kbd className={kbd}>D</kbd> move <kbd className={kbd}>W</kbd> turn <kbd className={kbd}>S</kbd> down <kbd className={kbd}>Space</kbd> drop <kbd className={kbd}>E</kbd> hold
              </span>
              <span className="flex items-center gap-1.5">
                <strong className="font-semibold text-white">P2</strong> <kbd className={kbd}>←</kbd><kbd className={kbd}>→</kbd> move <kbd className={kbd}>↑</kbd> turn <kbd className={kbd}>↓</kbd> down <kbd className={kbd}>/</kbd> drop <kbd className={kbd}>⇧</kbd> hold
              </span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5"><kbd className={kbd}>←</kbd><kbd className={kbd}>→</kbd> move</span>
              <span className="flex items-center gap-1.5"><kbd className={kbd}>↓</kbd> soft drop</span>
              <span className="flex items-center gap-1.5"><kbd className={kbd}>↑</kbd><kbd className={kbd}>X</kbd> turn</span>
              <span className="flex items-center gap-1.5"><kbd className={kbd}>Z</kbd> turn back</span>
              <span className="flex items-center gap-1.5"><kbd className={kbd}>Space</kbd> drop</span>
              <span className="flex items-center gap-1.5"><kbd className={kbd}>C</kbd> hold</span>
            </>
          )}
          <span className="flex items-center gap-1.5"><kbd className={kbd}>P</kbd> pause</span>
          <span className="flex items-center gap-1.5"><kbd className={kbd}>Esc</kbd> close</span>
          {idle && canStart && (
            <button
              type="button"
              onClick={() => {
                start();
                focusStage();
              }}
              className={`ml-auto inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl bg-[#ffe066] px-4 text-[13px] font-bold text-[#1a1430] transition hover:bg-[#fff0a0] active:scale-[0.98] motion-reduce:transition-none ${focusRing}`}
            >
              <Play size={15} aria-hidden="true" /> {phase === "ready" ? "Start" : "Play again"}
            </button>
          )}
        </div>
      </div>
    </OverlayDialog>
  );
}

// Connected game controllers. Some browsers block the Gamepad API (in a frame, by policy): none then.
function connectedPads(): Gamepad[] {
  try {
    return navigator.getGamepads ? [...navigator.getGamepads()].filter((pad): pad is Gamepad => !!pad?.connected) : [];
  } catch {
    return [];
  }
}
