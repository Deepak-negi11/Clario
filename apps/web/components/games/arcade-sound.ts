import type { Sound } from "./arcade-kit";

// Short blips made with Web Audio, so there are no sound files to load. The context is created
// on the first sound, which always follows a key press or tap, so browsers allow it to play.
// Table tennis sounds (KNOCKS) are knocks instead: a burst of filtered noise with a short tone
// under it, like a celluloid ball on wood and rubber.
type Knock = "bat" | "table" | "net" | "floor" | "smash" | "clap";

const TONES: Record<Exclude<Sound, Knock>, { from: number; to: number; seconds: number; wave: OscillatorType; volume?: number }> = {
  start: { from: 440, to: 880, seconds: 0.12, wave: "square" },
  hit: { from: 520, to: 540, seconds: 0.05, wave: "square" },
  wall: { from: 300, to: 290, seconds: 0.04, wave: "square" },
  tick: { from: 900, to: 860, seconds: 0.025, wave: "triangle", volume: 0.035 },
  score: { from: 660, to: 1320, seconds: 0.18, wave: "triangle" },
  lose: { from: 300, to: 110, seconds: 0.3, wave: "sawtooth" },
  brick: { from: 660, to: 990, seconds: 0.06, wave: "square" },
  eat: { from: 600, to: 1200, seconds: 0.08, wave: "triangle" },
  win: { from: 523, to: 1046, seconds: 0.4, wave: "triangle" },
  power: { from: 400, to: 1600, seconds: 0.22, wave: "triangle" },
  dash: { from: 220, to: 440, seconds: 0.08, wave: "sawtooth", volume: 0.03 },
  bump: { from: 160, to: 120, seconds: 0.07, wave: "square" },
  fall: { from: 500, to: 80, seconds: 0.45, wave: "triangle" },
};

// noise: the band of noise (centre Hz, how narrow, seconds to die away); body: a tone under it
// (Hz at the start and end); claps: how many short bursts, spread over `spread` seconds.
const KNOCKS: Record<Knock, { noise: [number, number, number]; body?: [number, number]; volume: number; claps?: number; spread?: number }> = {
  bat: { noise: [1700, 1.4, 0.035], body: [980, 720], volume: 0.16 },
  smash: { noise: [1300, 1, 0.05], body: [760, 520], volume: 0.24 },
  table: { noise: [3200, 2.2, 0.02], body: [2300, 2100], volume: 0.1 },
  net: { noise: [520, 0.7, 0.07], volume: 0.08 },
  floor: { noise: [1500, 1.2, 0.03], body: [640, 560], volume: 0.06 },
  clap: { noise: [1300, 0.9, 0.025], volume: 0.035, claps: 14, spread: 0.7 },
};

const isKnock = (sound: Sound): sound is Knock => sound in KNOCKS;

let context: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function knock(ctx: AudioContext, sound: Knock) {
  const spec = KNOCKS[sound];
  if (!noise) {
    noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.25), ctx.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  }
  const [centre, q, seconds] = spec.noise;
  const count = spec.claps ?? 1;
  for (let i = 0; i < count; i++) {
    const at = ctx.currentTime + (count > 1 ? Math.random() * (spec.spread ?? 0) : 0);
    const volume = spec.volume * (count > 1 ? 0.5 + Math.random() * 0.5 : 1);
    const source = ctx.createBufferSource();
    source.buffer = noise;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = centre * (count > 1 ? 0.8 + Math.random() * 0.4 : 1);
    band.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    source.connect(band).connect(gain).connect(ctx.destination);
    source.start(at, Math.random() * 0.15, seconds + 0.02);
  }
  if (!spec.body) return;
  const now = ctx.currentTime;
  const tone = ctx.createOscillator();
  const gain = ctx.createGain();
  tone.type = "sine";
  tone.frequency.setValueAtTime(spec.body[0], now);
  tone.frequency.exponentialRampToValueAtTime(spec.body[1], now + 0.04);
  gain.gain.setValueAtTime(spec.volume * 0.6, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
  tone.connect(gain).connect(ctx.destination);
  tone.start(now);
  tone.stop(now + 0.06);
}

export function playSound(sound: Sound) {
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    if (isKnock(sound)) return knock(context, sound);
    const tone = TONES[sound];
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = tone.wave;
    oscillator.frequency.setValueAtTime(tone.from, now);
    oscillator.frequency.exponentialRampToValueAtTime(tone.to, now + tone.seconds);
    gain.gain.setValueAtTime(tone.volume ?? 0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.seconds);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + tone.seconds + 0.02);
  } catch {
    // No Web Audio here: the games just play silently.
  }
}
