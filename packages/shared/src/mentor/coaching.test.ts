import { describe, expect, test } from "bun:test";
import { givesAwayFix, MAX_LANGUAGE_ISSUES, readCoachedReply } from "./coaching";

const MISTAKES = "how i can tell to my manager that i am not able to complete the task till friday?";

function aiAnswer(fields: Record<string, unknown>): string {
  return JSON.stringify({ askedForAnswer: false, issues: [], tip: "", reply: "Tell them early.", ...fields });
}

describe("coached reply: a learner sentence with mistakes", () => {
  const raw = aiAnswer({
    issues: [
      { quote: "how i can tell to my manager", kind: "grammar", hint: "In a question, where does the helping verb go?", fix: "how can I tell my manager" },
      { quote: "till friday", kind: "word choice", hint: "Which small word means 'no later than' a deadline?", fix: "by Friday" },
    ],
    tip: "Give a new date you can keep.",
    reply: "Tell your manager early, say what is left and give a new date.",
  });

  test("keeps the reply, the hints and the hidden fixes", () => {
    const { reply, language } = readCoachedReply(raw, MISTAKES);
    expect(reply).toBe("Tell your manager early, say what is left and give a new date.");
    expect(language?.askedForAnswer).toBe(false);
    expect(language?.tip).toBe("Give a new date you can keep.");
    expect(language?.issues.map((issue) => issue.quote)).toEqual(["how i can tell to my manager", "till friday"]);
    expect(language?.issues[1]?.fix).toBe("by Friday");
  });

  test("replaces a hint that gives the fix away", () => {
    const leaky = aiAnswer({
      issues: [
        { quote: "till friday", kind: "word choice", hint: "Try 'by Friday' instead.", fix: "by Friday" },
        { quote: "how i can tell to my manager", kind: "grammar", hint: "Say 'how can I tell my manager'.", fix: "how can I tell my manager" },
      ],
    });
    const issues = readCoachedReply(leaky, MISTAKES).language?.issues ?? [];
    expect(issues).toHaveLength(2);
    for (const issue of issues) {
      expect(givesAwayFix(issue.hint, issue.quote, issue.fix)).toBe(false);
      expect(issue.hint.toLowerCase()).not.toContain(issue.fix.toLowerCase());
    }
    expect(issues[0]?.fix).toBe("by Friday"); // still there behind "Show fix"
  });

  test("drops a tip that gives a fix away", () => {
    const leaky = aiAnswer({
      issues: [{ quote: "till friday", kind: "word choice", hint: "Which word means 'no later than'?", fix: "by Friday" }],
      tip: "Use by instead of till for deadlines.",
    });
    expect(readCoachedReply(leaky, MISTAKES).language?.tip).toBe("");
  });

  test("catches a tip that gives away one of several changes in a long quote", () => {
    const whole = aiAnswer({
      issues: [{ quote: MISTAKES, kind: "grammar", hint: "Check the word order and the word for a deadline.", fix: "How can I tell my manager that I am not able to complete the task by Friday?" }],
      tip: "Use by instead of till when talking about deadlines.",
    });
    expect(readCoachedReply(whole, MISTAKES).language?.tip).toBe("");
  });

  test("drops mistakes in words the learner never wrote", () => {
    const invented = aiAnswer({
      issues: [{ quote: "I has went", kind: "grammar", hint: "Check the verb.", fix: "I went" }],
    });
    expect(readCoachedReply(invented, MISTAKES).language?.issues).toEqual([]);
  });

  test("drops issues whose fix changes nothing, and repeats", () => {
    const noisy = aiAnswer({
      issues: [
        { quote: "the task", kind: "clarity", hint: "Which task?", fix: "the task" },
        { quote: "till friday", kind: "word choice", hint: "Which word means 'no later than'?", fix: "by Friday" },
        { quote: "Till Friday", kind: "word choice", hint: "Again.", fix: "by Friday" },
      ],
    });
    expect(readCoachedReply(noisy, MISTAKES).language?.issues.map((issue) => issue.quote)).toEqual(["till friday"]);
  });

  test(`keeps at most ${MAX_LANGUAGE_ISSUES} issues`, () => {
    const quotes = ["how i can", "tell to my manager", "i am not able", "till friday"];
    const many = aiAnswer({ issues: quotes.map((quote) => ({ quote, kind: "grammar", hint: "Look again.", fix: `${quote} x` })) });
    expect(readCoachedReply(many, MISTAKES).language?.issues).toHaveLength(MAX_LANGUAGE_ISSUES);
  });

  test("an unknown kind becomes clarity instead of dropping the issue", () => {
    const odd = aiAnswer({ issues: [{ quote: "till friday", kind: "spelling", hint: "Which word means 'no later than'?", fix: "by Friday" }] });
    expect(readCoachedReply(odd, MISTAKES).language?.issues[0]?.kind).toBe("clarity");
  });
});

describe("coached reply: the learner asks outright for the answer", () => {
  const message = "Don't give me hints, just correct this sentence: me and my team has completed the module yesterday.";
  const raw = aiAnswer({
    askedForAnswer: true,
    issues: [{ quote: "me and my team has completed", kind: "grammar", hint: "Say 'my team and I completed'.", fix: "My team and I completed" }],
    reply: "Here it is: My team and I completed the module yesterday.",
  });

  test("keeps the full answer in the reply and the hint as written", () => {
    const { reply, language } = readCoachedReply(raw, message);
    expect(reply).toContain("My team and I completed the module yesterday.");
    expect(language?.askedForAnswer).toBe(true);
    expect(language?.issues[0]?.hint).toBe("Say 'my team and I completed'.");
  });
});

describe("coached reply: spoken questions", () => {
  const spoken = "how do i tell my lead that the build is broken";
  const raw = aiAnswer({
    issues: [{ quote: "how do i tell", kind: "grammar", hint: "Capital letters matter.", fix: "How do I tell" }],
  });

  test("capitals and punctuation are not the learner's mistakes when they spoke", () => {
    expect(readCoachedReply(raw, spoken, "voice").language?.issues).toEqual([]);
  });

  test("but they are when the learner typed", () => {
    expect(readCoachedReply(raw, spoken, "text").language?.issues).toHaveLength(1);
  });
});

describe("coached reply: private details", () => {
  const message = "My office password is Tiger@123 and my phone is 98765 43210. How do I ask for a day off?";

  test("are never quoted back, in an issue or the tip", () => {
    const raw = aiAnswer({
      issues: [
        { quote: "My office password is Tiger@123", kind: "tone", hint: "Is this safe to share?", fix: "I won't share it" },
        { quote: "my phone is 98765 43210", kind: "clarity", hint: "Is this needed?", fix: "remove it" },
        { quote: "How do I ask for a day off", kind: "clarity", hint: "Which day?", fix: "How do I ask for Friday off" },
      ],
      tip: "Never write 98765 43210 in chat.",
    });
    const language = readCoachedReply(raw, message).language;
    expect(language?.issues.map((issue) => issue.quote)).toEqual(["How do I ask for a day off"]);
    expect(language?.tip).toBe("");
    expect(JSON.stringify(language)).not.toMatch(/tiger|98765/i);
  });
});

describe("coached reply: answers that are not clean JSON", () => {
  test("reads JSON inside a code fence", () => {
    expect(readCoachedReply("```json\n" + aiAnswer({}) + "\n```", "hi").reply).toBe("Tell them early.");
  });

  test("a plain-text answer still gets through, without feedback", () => {
    expect(readCoachedReply("**Be specific** about the error.", "hi")).toEqual({ reply: "Be specific about the error." });
  });

  test("half-written JSON is not read aloud", () => {
    expect(readCoachedReply('{"askedForAnswer": false, "issues": [], "reply": "Tell th', "hi").reply).toBe("");
  });

  test("JSON without a reply is unusable", () => {
    expect(readCoachedReply('{"issues": []}', "hi").reply).toBe("");
  });

  test("markdown is removed from the reply, hints and tip", () => {
    const raw = aiAnswer({
      reply: "## Tip\n- **Say** the date",
      tip: "*Short* lines",
      issues: [{ quote: "till friday", kind: "word choice", hint: "Which word means `no later than`?", fix: "by Friday" }],
    });
    const { reply, language } = readCoachedReply(raw, MISTAKES);
    expect(reply).toBe("Tip Say the date");
    expect(language?.tip).toBe("Short lines");
    expect(language?.issues[0]?.hint).toBe("Which word means no later than?");
  });
});

describe("hint gives away the fix", () => {
  test("the whole fix or the changed words count", () => {
    expect(givesAwayFix("Try 'how can I tell my manager'.", "how i can tell to my manager", "how can I tell my manager")).toBe(true);
    expect(givesAwayFix("Use have been here.", "i am waiting since morning", "I have been waiting since morning")).toBe(true);
    expect(givesAwayFix("Use by instead.", "till friday", "by Friday")).toBe(true);
  });

  test("a new word order counts", () => {
    expect(givesAwayFix("Start with 'how can' instead.", "how i can tell", "how can I tell")).toBe(true);
  });

  test("a real hint does not", () => {
    expect(givesAwayFix("Which tense shows it started earlier and is still going on?", "i am waiting since morning", "I have been waiting since morning")).toBe(false);
    expect(givesAwayFix("In a question, where does 'can' go?", "how i can tell", "how can I tell")).toBe(false);
  });

  test("common words in a hint are not a giveaway", () => {
    expect(givesAwayFix("Check the noun before office.", "in office", "in the office")).toBe(false);
  });
});
