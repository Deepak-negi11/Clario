// What a typed or spoken message asks Maya or an AI coworker to do with you in the 3D view: walk
// with you, play a game with you, or stop. A small fixed list of phrases, so it never depends on
// the AI and a chat about something else is never taken as a request. Anything else is a normal
// message for the AI to answer.

export type CompanionIntent = "follow" | "play" | "stop";

// Patterns run on one clause of the message at a time, normalised: lower case, no apostrophes,
// no punctuation, single spaces.
const PATTERNS: { intent: CompanionIntent; pattern: RegExp }[] = [
  { intent: "follow", pattern: /\b(walk|come|go|head|stroll) (along )?with me\b/g },
  { intent: "follow", pattern: /\bfollow me\b/g },
  { intent: "follow", pattern: /\b(come|tag) along\b/g },
  { intent: "follow", pattern: /\bwalk together\b/g },
  { intent: "follow", pattern: /\b(lets|let us) (go for a |take a )?walk\b/g },
  { intent: "follow", pattern: /\b(go|come) for a walk\b/g },
  { intent: "follow", pattern: /\bwalk me (to|over)\b/g },
  { intent: "follow", pattern: /\b(keep me company|accompany me)\b/g },
  // A bare "let's play" only ends a clause: "I want to play my part" or "let's play it safe" isn't a game.
  { intent: "play", pattern: /\b(lets|let us|wanna|want to|shall we|can we|could we|should we|time to) (go )?play( (something|together|now|again|instead|then|too|for a bit))?$/g },
  { intent: "play", pattern: /\bplay (a |some )?(game|games|pong|ping pong|table tennis|foosball|arcade|snake|breakout|round)\b/g },
  { intent: "play", pattern: /\bplay (with me|together)\b/g },
  { intent: "play", pattern: /\b(up for|fancy|how about) a (game|round)\b/g },
  { intent: "play", pattern: /\bgame time\b/g },
  { intent: "stop", pattern: /\bstop (following|walking|playing|the game)\b/g },
  { intent: "stop", pattern: /\b(dont|not|no need to|never) (need to |have to )?(follow|walk with|come with) me\b/g },
  { intent: "stop", pattern: /\bstay (here|there|put)\b/g },
  { intent: "stop", pattern: /\b(you can|feel free to) (go|head) back\b/g },
  { intent: "stop", pattern: /\bgo back to your (desk|spot|place|room)\b/g },
];

// A goodbye or a bare "stop" counts only as a whole clause ("ok, bye", "see you later, Maya"),
// not inside a longer one ("I said bye to my manager").
const GOODBYE = "bye|bye bye|goodbye|good bye|see you|see ya|see you later|later|cya|ttyl";
const SHORT_STOP = new RegExp(
  `^((ok|okay|alright|thanks|thank you|cool|great|fine|well) )?((stop|${GOODBYE})( (now|then|for now|thanks|thank you|later|please))?|(${GOODBYE}) \\w+)$`,
);

// "Don't", "not" or "no need to" a few words before a request turns it down instead.
const NEGATION = /\b(dont|not|no need to|never|cant|cannot|wont|rather not)( \w+){0,3} $/;

const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// The request in a message, or null when it doesn't ask for one. When a message asks for more
// than one ("stop following me, let's play instead") the last one wins.
export function parseCompanionIntent(text: string): CompanionIntent | null {
  let found: CompanionIntent | null = null;
  for (const clause of text.split(/[.,!?;:\n]+/).map(normalise)) {
    if (!clause) continue;
    if (SHORT_STOP.test(clause)) {
      found = "stop";
      continue;
    }
    let last: { intent: CompanionIntent; at: number } | null = null;
    for (const { intent, pattern } of PATTERNS) {
      for (const match of clause.matchAll(pattern)) {
        if (intent !== "stop" && NEGATION.test(clause.slice(0, match.index))) continue;
        if (!last || match.index >= last.at) last = { intent, at: match.index };
      }
    }
    if (last) found = last.intent;
  }
  return found;
}

// What they say back. `already` is true when they are already doing what was asked.
export function companionReply(intent: CompanionIntent, already = false) {
  if (intent === "follow") return already ? "I'm right behind you." : "Sure, lead the way. I'll walk with you.";
  if (intent === "play") return already ? "I'm in. Let's play!" : "You're on! Let's find a game.";
  return "Okay, I'll head back. Come find me anytime.";
}
