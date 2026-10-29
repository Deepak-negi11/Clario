import type { Sound } from "./arcade-kit";

// Short blips made with Web Audio, so there are no sound files to load. The context is created
// on the first sound, which always follows a key press or tap, so browsers allow it to play.
const TONES: Record<Sound, { from: number; to: number; seconds: number; wave: OscillatorType; volume?: number }> = {
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

let context: AudioContext | null = null;

export function playSound(sound: Sound) {
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
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
