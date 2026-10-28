// Text to speech with the browser's speechSynthesis. Works in all major browsers, no key.

import { splitSentences } from "@repo/shared";

export type VoiceSettings = { lang: string; pitch: number; rate: number };

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// Voices load asynchronously in Chrome; asking early makes them ready by the first reply.
export function warmUpVoices(): void {
  if (isSpeechSynthesisSupported()) window.speechSynthesis.getVoices();
}

// Matching voice, then Indian English, then any English voice, then the browser default.
function pickVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const same = (voice: SpeechSynthesisVoice, code: string) =>
    voice.lang.replace("_", "-").toLowerCase() === code.toLowerCase();
  return (
    voices.find((voice) => same(voice, lang)) ??
    voices.find((voice) => same(voice, "en-IN")) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) ??
    null
  );
}

// Speaks `text` one sentence at a time (Chrome cuts off long single utterances) and returns
// a cancel function. `onEnd` runs once when she finishes, never after cancel.
export function speak(text: string, settings: VoiceSettings, onEnd: () => void): () => void {
  const synth = window.speechSynthesis;
  synth.cancel();

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    window.clearTimeout(watchdog);
    onEnd();
  };
  // Some browsers occasionally never fire "end"; don't leave Maya talking forever.
  const watchdog = window.setTimeout(finish, 4000 + text.length * 90);

  const voice = pickVoice(settings.lang);
  const sentences = splitSentences(text);
  sentences.forEach((sentence, index) => {
    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.lang = voice?.lang ?? settings.lang;
    if (voice) utterance.voice = voice;
    utterance.pitch = settings.pitch;
    utterance.rate = settings.rate;
    if (index === sentences.length - 1) utterance.onend = finish;
    utterance.onerror = (event) => {
      if (event.error !== "interrupted" && event.error !== "canceled") finish();
    };
    synth.speak(utterance);
  });
  if (sentences.length === 0) finish();

  return () => {
    finished = true;
    window.clearTimeout(watchdog);
    synth.cancel();
  };
}
