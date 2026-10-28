import type { Mission } from "./missions";

// Feedback on one message, in four visible categories (never a single opaque score), and the
// code rules for passing and XP (PS7_BUILD_BRIEF.md sections 5.2, 7, 8.2 and 11).
// A mission passes when every category scores at least PASS_SCORE; the AI never decides that.

export const FEEDBACK_CATEGORIES = ["clarity", "completeness", "tone", "nextAction"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  clarity: "Clarity",
  completeness: "Completeness",
  tone: "Tone",
  nextAction: "Next action",
};

export type CategoryScore = { score: number; tip: string };

export type MissionFeedback = Record<FeedbackCategory, CategoryScore> & {
  summary: string;           // one or two sentences to the learner about the biggest gap (or what worked)
  problemPhrases: string[];  // exact parts of the draft that lowered the scores
};

export const PASS_SCORE = 7;
export const MAX_SENDS = 4;
export const MISSION_XP = 50;
export const FIRST_TRY_BONUS = 10;

export const isPassing = (feedback: MissionFeedback) =>
  FEEDBACK_CATEGORIES.every((category) => feedback[category].score >= PASS_SCORE);

/** XP for completing a mission on the given send (1 = first try). */
export const xpForCompletion = (sendsUsed: number) => MISSION_XP + (sendsUsed === 1 ? FIRST_TRY_BONUS : 0);

/** The weakest category, used as the one suggestion to act on next. */
export function weakestCategory(feedback: MissionFeedback): FeedbackCategory {
  return FEEDBACK_CATEGORIES.reduce((worst, category) => (feedback[category].score < feedback[worst].score ? category : worst));
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Case-insensitive keyword match; keywords that start or end with a letter match whole words only ("by" is not in "maybe"). */
export function hasKeyword(text: string, keyword: string): boolean {
  const start = /^\w/.test(keyword) ? "\\b" : "";
  const end = /\w$/.test(keyword) ? "\\b" : "";
  return new RegExp(`${start}${escapeRegex(keyword)}${end}`, "i").test(text);
}

const APOLOGY = /\b(sorry|apologi[sz]e|apologies)\b/gi;
const RUDE: RegExp[] = [/asap!!/gi, /why haven'?t you/gi, /!!!+/g];
const REQUEST_PHRASES = ["could you", "can you", "would you", "please", "let me know", "i'll", "i will", "i can", "let's", "shall i"];
const TIME_WORDS = /\b(today|tonight|tomorrow|by|eod|minutes?|this (morning|afternoon|evening|week)|(mon|tues|wednes|thurs|fri|satur|sun)day|mon|tue|wed|thu|fri)\b|\bat \d/i;
const GREETING = /^\s*(hi|hello|hey|dear|good (morning|afternoon|evening))\b/i;

function finish(score: number, tips: string[], good: string): CategoryScore {
  return { score: Math.max(0, Math.min(10, Math.round(score))), tip: tips.length ? tips.join(" ") : good };
}

/** Deterministic grading, used when the AI coach is unavailable and as the baseline in tests. */
export function scoreWithRules(mission: Mission, draft: string): MissionFeedback {
  const text = draft.trim();
  const words = text.split(/\s+/).filter(Boolean);
  const sentences = text.split(/[.!?\n]+/).map((s) => s.trim()).filter(Boolean);
  const problemPhrases: string[] = [];

  // Clarity
  let clarity = 10;
  const clarityTips: string[] = [];
  if (words.length < 8) {
    clarity -= 5;
    clarityTips.push("Say a little more so the main point is clear on the first read.");
  }
  if (words.length > 200) {
    clarity -= 3;
    clarityTips.push("Shorten it: keep only what the reader needs.");
  }
  if (sentences.length && words.length / sentences.length > 25) {
    clarity -= 2;
    clarityTips.push("Split long sentences into shorter ones.");
  }
  const allKeywords = mission.mustInclude.flatMap((item) => item.ruleKeywords);
  if (!allKeywords.some((keyword) => hasKeyword(text, keyword))) {
    clarity -= 3;
    clarityTips.push("Mention the actual topic so the reader knows what this is about.");
  }

  // Completeness
  const missing = mission.mustInclude.filter((item) => !item.ruleKeywords.some((keyword) => hasKeyword(text, keyword)));
  const matched = mission.mustInclude.length - missing.length;
  const completeness = finish(
    (10 * matched) / mission.mustInclude.length,
    missing.length ? [`Add ${missing[0]!.label}.`] : [],
    "It has everything this message needs.",
  );

  // Tone
  let tone = 10;
  const toneTips: string[] = [];
  const apologies = [...text.matchAll(APOLOGY)];
  if (apologies.length > 1) {
    tone -= 2 * (apologies.length - 1);
    toneTips.push("One apology is enough; ask with confidence.");
    for (const match of apologies.slice(1)) problemPhrases.push(match[0]);
  }
  const rudeMatches = RUDE.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => match[0]));
  const shouting = words.filter((word) => /^[A-Z]{2,}[!?.,]*$/.test(word) && !/\d/.test(word));
  if (shouting.length >= 3) rudeMatches.push(...shouting);
  if (rudeMatches.length) {
    tone -= 3 * rudeMatches.length;
    toneTips.push("Keep it calm: drop the pressure and the capitals.");
    problemPhrases.push(...rudeMatches);
  }
  if (mission.coworker.formality !== "casual" && !GREETING.test(text)) {
    tone -= 1;
    toneTips.push(`Start with a short greeting, like "Hi ${mission.coworker.name.split(" ")[0]},".`);
  }

  // Next action
  let nextAction = 10;
  const nextTips: string[] = [];
  if (!REQUEST_PHRASES.some((phrase) => hasKeyword(text, phrase))) {
    nextAction -= 5;
    nextTips.push("Say clearly what should happen next, for example \"Could you…\" or \"I'll…\".");
  }
  if (!TIME_WORDS.test(text)) {
    nextAction -= 3;
    nextTips.push("Add when: today, by Friday, or a time.");
  }

  const feedback: MissionFeedback = {
    clarity: finish(clarity, clarityTips, "Easy to understand on the first read."),
    completeness,
    tone: finish(tone, toneTips, "Polite and confident."),
    nextAction: finish(nextAction, nextTips, "It's clear what happens next."),
    summary: "",
    problemPhrases: [...new Set(problemPhrases)].filter((phrase) => text.includes(phrase)).slice(0, 5),
  };
  feedback.summary = isPassing(feedback)
    ? `Clear and complete. ${mission.coworker.name.split(" ")[0]} has what they need.`
    : missing.length
      ? `Your message doesn't yet include ${missing.map((item) => item.label).join(", ")}.`
      : feedback[weakestCategory(feedback)].tip;
  return feedback;
}
