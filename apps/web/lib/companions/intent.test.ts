import { describe, expect, test } from "bun:test";
import { companionReply, parseCompanionIntent } from "./intent";

describe("parseCompanionIntent", () => {
  test.each([
    "walk with me",
    "Walk with me!",
    "Follow me",
    "can you come with me?",
    "come along, Maya",
    "let's walk",
    "Let’s go for a walk",
    "wanna walk together?",
    "walk me to the kitchen",
    "keep me company",
  ])("asks them to walk with you: %s", (text) => {
    expect(parseCompanionIntent(text)).toBe("follow");
  });

  test.each([
    "let's play",
    "Let's play!",
    "lets play, I'm bored",
    "do you want to play?",
    "shall we play a game",
    "play a game with me",
    "how about a game of ping pong?",
    "fancy a round?",
    "play pong with me",
    "game time!",
    "want to play together",
  ])("asks them to play: %s", (text) => {
    expect(parseCompanionIntent(text)).toBe("play");
  });

  test.each([
    "stop",
    "Stop following me",
    "stop following me please",
    "ok bye",
    "Bye!",
    "thanks, bye",
    "see you later, Maya",
    "goodbye arjun",
    "you can go back now",
    "stay here",
    "don't follow me",
    "you don't need to follow me",
    "let's stop playing",
    "go back to your desk",
  ])("asks them to stop: %s", (text) => {
    expect(parseCompanionIntent(text)).toBe("stop");
  });

  test.each([
    "",
    "   ",
    "Hi! I just joined the team.",
    "What are you working on?",
    "Can you walk me through the deploy steps?",
    "I want to play my part in this release",
    "Let's play it safe and test first",
    "let's play out the interview scenario",
    "can we do a role play?",
    "how do I play the arcade game",
    "I said bye to my manager",
    "why are you following me",
    "I don't want to play",
    "I'd rather not walk with you",
    "please stop talking about the bug",
    "the build is stopped",
  ])("leaves anything else for the AI: %s", (text) => {
    expect(parseCompanionIntent(text)).toBeNull();
  });

  test("the last request in a message wins", () => {
    expect(parseCompanionIntent("stop following me, let's play instead")).toBe("play");
    expect(parseCompanionIntent("let's play. Actually no, bye")).toBe("stop");
    expect(parseCompanionIntent("walk with me and then let's play a game")).toBe("play");
    expect(parseCompanionIntent("let's play a game, then walk with me")).toBe("follow");
  });
});

describe("companionReply", () => {
  test("answers each request, and notices when they are already doing it", () => {
    expect(companionReply("follow")).toContain("walk with you");
    expect(companionReply("follow", true)).toContain("right behind you");
    expect(companionReply("play")).toContain("find a game");
    expect(companionReply("stop")).toContain("head back");
  });
});
