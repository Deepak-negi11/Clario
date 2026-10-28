import { describe, expect, test } from "bun:test";
import { nextMentorState, type MentorEvent, type MentorState } from "./avatar-state";
import { MENTOR_HISTORY_LIMIT, MentorRequestSchema } from "./mentor.schema";
import { splitSentences, toPlainText } from "./plain-text";
import { matchSavedTip, OFFLINE_REPLY, SAVED_TIPS, savedTipReply } from "./saved-tips";

describe("saved tips", () => {
  const samples: Record<string, string> = {
    "ask-for-help": "How do I ask for help from a senior without looking weak?",
    "too-many-sorrys": "Is 'sorry to disturb you' too much?",
    "vague-task": "My ticket just says fix the login page, it's so vague",
    "follow-up": "IT never replied, how do I follow up?",
    "meeting-summary": "How do I write a summary after a meeting?",
    "pull-request": "What goes in a pull request description?",
    "standup": "What should I say in standup?",
    "dont-know": "What if my manager asks something and I don't know the answer?",
    "more-time": "How can I ask for a deadline extension?",
    "feedback": "I got harsh feedback on my code, how should I reply?",
    "tone": "How formal should I be on chat?",
  };

  test("every tip has a sample question that reaches it", () => {
    expect(Object.keys(samples).sort()).toEqual(SAVED_TIPS.map((tip) => tip.id).sort());
    for (const [id, question] of Object.entries(samples)) {
      expect(matchSavedTip(question)?.id).toBe(id);
    }
  });

  test("ignores case and curly apostrophes", () => {
    expect(matchSavedTip("I DON’T KNOW what to say")?.id).toBe("dont-know");
  });

  test("matches whole words only", () => {
    // "pr" must not match inside "practice", "late" not inside "translate".
    expect(matchSavedTip("can you translate my practice essay")).toBeNull();
  });

  test("the more specific keyword wins", () => {
    expect(matchSavedTip("how do I ask for help on a bug in review")?.id).toBe("ask-for-help");
  });

  test("ties go to the earlier tip", () => {
    // One keyword each for "too-many-sorrys" (sorry) and "tone" (manager).
    expect(matchSavedTip("sorry manager")?.id).toBe("too-many-sorrys");
  });

  test("off-topic questions get the offline reply listing topics", () => {
    expect(matchSavedTip("who will win the cricket match?")).toBeNull();
    expect(savedTipReply("who will win the cricket match?")).toBe(OFFLINE_REPLY);
    expect(OFFLINE_REPLY).toContain("standup updates");
  });

  test("answers are plain text, short enough to speak", () => {
    for (const tip of SAVED_TIPS) {
      expect(toPlainText(tip.answer)).toBe(tip.answer);
      expect(splitSentences(tip.answer).length).toBeLessThanOrEqual(4);
    }
  });
});

describe("plain text for speech", () => {
  test("removes markdown", () => {
    expect(toPlainText("## Tip\n- **Say** the `error`\n- see [docs](https://x.y)")).toBe("Tip Say the error see docs");
  });

  test("removes reasoning blocks and code", () => {
    expect(toPlainText("<think>hmm</think>Be specific.\n```js\nx()\n```")).toBe("Be specific.");
  });

  test("cuts long replies at a sentence end", () => {
    const long = "This is one sentence. ".repeat(60);
    const plain = toPlainText(long);
    expect(plain.length).toBeLessThanOrEqual(700);
    expect(plain.endsWith(".")).toBe(true);
  });

  test("splits sentences without breaking numbers", () => {
    expect(splitSentences("Meet at 10.30 today. Is that ok? Great!")).toEqual(["Meet at 10.30 today.", "Is that ok?", "Great!"]);
  });
});

describe("avatar state", () => {
  const run = (events: MentorEvent[], from: MentorState = "idle") =>
    events.reduce<MentorState>((state, event) => nextMentorState(state, event), from);

  test("voice round trip", () => {
    expect(run([{ type: "MIC_START" }])).toBe("listening");
    expect(run([{ type: "MIC_START" }, { type: "HEARD" }])).toBe("thinking");
    expect(run([{ type: "MIC_START" }, { type: "HEARD" }, { type: "REPLY", speak: true }])).toBe("speaking");
    expect(run([{ type: "MIC_START" }, { type: "HEARD" }, { type: "REPLY", speak: true }, { type: "SPEECH_END" }])).toBe("idle");
  });

  test("muted replies go straight back to idle", () => {
    expect(run([{ type: "SEND_TEXT" }, { type: "REPLY", speak: false }])).toBe("idle");
  });

  test("the mic stays off while waiting for a reply", () => {
    expect(run([{ type: "MIC_START" }], "thinking")).toBe("thinking");
  });

  test("the learner can interrupt Maya", () => {
    expect(run([{ type: "MIC_START" }], "speaking")).toBe("listening");
  });

  test("stopping the mic or hearing nothing returns to idle", () => {
    expect(run([{ type: "MIC_STOP" }], "listening")).toBe("idle");
  });

  test("closing always returns to idle", () => {
    for (const state of ["idle", "listening", "thinking", "speaking"] as const) {
      expect(nextMentorState(state, { type: "CLOSE" })).toBe("idle");
    }
  });

  test("a late speech end does not cut a new question short", () => {
    expect(run([{ type: "SPEECH_END" }], "thinking")).toBe("thinking");
  });

  test("Listen reads a reply aloud only when Maya is free", () => {
    expect(run([{ type: "SEND_TEXT" }, { type: "REPLY", speak: false }, { type: "READ_ALOUD" }])).toBe("speaking");
    expect(run([{ type: "READ_ALOUD" }, { type: "SPEECH_END" }])).toBe("idle");
    expect(run([{ type: "READ_ALOUD" }], "speaking")).toBe("speaking");
    expect(run([{ type: "READ_ALOUD" }], "listening")).toBe("listening");
    expect(run([{ type: "READ_ALOUD" }], "thinking")).toBe("thinking");
  });
});

describe("mentor request", () => {
  test("trims the message and keeps only the last turns", () => {
    const history = Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? "mentor" : "user", text: `turn ${i}` }));
    const parsed = MentorRequestSchema.parse({ message: "  hi  ", history });
    expect(parsed.message).toBe("hi");
    expect(parsed.history).toHaveLength(MENTOR_HISTORY_LIMIT);
    expect(parsed.history[0]?.text).toBe("turn 4");
    expect(parsed.inputMode).toBe("text");
  });

  test("rejects empty and over-long questions with a friendly message", () => {
    expect(MentorRequestSchema.safeParse({ message: "   " }).error?.issues[0]?.message).toBe("Type or say a question first.");
    expect(MentorRequestSchema.safeParse({ message: "a".repeat(601) }).success).toBe(false);
  });

  test("rejects unknown roles", () => {
    expect(MentorRequestSchema.safeParse({ message: "hi", history: [{ role: "system", text: "x" }] }).success).toBe(false);
  });
});
