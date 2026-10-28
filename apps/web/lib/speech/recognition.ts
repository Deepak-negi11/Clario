// Speech to text with the browser's Web Speech API. Turn-based: one question per listen.
// Chrome and Edge send the audio to their speech service; Safari has its own; Firefox has none.
// TypeScript's DOM types do not include SpeechRecognition, so the small part we use is typed here.

type RecognitionResult = { isFinal: boolean; 0?: { transcript: string } };

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type RecognitionClass = new () => Recognition;

function recognitionClass(): RecognitionClass | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as unknown as {
    SpeechRecognition?: RecognitionClass;
    webkitSpeechRecognition?: RecognitionClass;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return recognitionClass() !== null;
}

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "The microphone is blocked. Allow it from the icon in the address bar, or type instead.",
  "service-not-allowed": "The microphone is blocked. Allow it from the icon in the address bar, or type instead.",
  "no-speech": "I didn't catch that. Try again, a little closer to the mic.",
  "audio-capture": "No microphone was found. You can type instead.",
  network: "Voice input needs an internet connection in this browser. You can type instead.",
  "language-not-supported": "This browser can't recognise that language. Try English (US).",
};

export type ListenHandlers = {
  // The words heard so far. `final` is true once the browser is sure of them.
  onText: (text: string, final: boolean) => void;
  onError: (message: string) => void;
  // Always called last, after a stop, an error or silence.
  onEnd: () => void;
};

export type ListenSession = { stop: () => void; abort: () => void };

export function listen(lang: string, handlers: ListenHandlers): ListenSession | null {
  const Recognition = recognitionClass();
  if (!Recognition) return null;

  const recognition = new Recognition();
  recognition.lang = lang;
  recognition.interimResults = true;
  recognition.continuous = false; // stop by itself when the learner stops talking
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const results = Array.from(event.results);
    const text = results.map((result) => result[0]?.transcript ?? "").join(" ").replace(/\s+/g, " ").trim();
    const final = results.length > 0 && results.every((result) => result.isFinal);
    handlers.onText(text, final);
  };
  recognition.onerror = (event) => {
    if (event.error === "aborted") return; // we stopped it ourselves
    handlers.onError(ERROR_MESSAGES[event.error] ?? `Voice input stopped (${event.error}). You can type instead.`);
  };
  recognition.onend = () => handlers.onEnd();

  try {
    recognition.start();
  } catch {
    handlers.onError("Voice input could not start. You can type instead.");
    return null;
  }
  return { stop: () => recognition.stop(), abort: () => recognition.abort() };
}
