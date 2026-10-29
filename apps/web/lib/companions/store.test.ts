import { afterEach, describe, expect, test } from "bun:test";
import { answerCompanion, companions } from "./store";

afterEach(() => companions.setOpen(false));

describe("answerCompanion", () => {
  test("does nothing while the 3D view is closed", () => {
    expect(answerCompanion("maya", "walk with me")).toBeNull();
    expect(companions.get().modes).toEqual({});
  });

  test("walk, play and stop change what they do, and they answer", () => {
    companions.setOpen(true);
    expect(answerCompanion("arjun", "Walk with me")).toContain("walk with you");
    expect(companions.get().modes.arjun).toBe("follow");
    expect(answerCompanion("arjun", "follow me")).toContain("right behind you");
    expect(answerCompanion("arjun", "let's play a game")).toContain("find a game");
    expect(companions.get().modes.arjun).toBe("play");
    expect(answerCompanion("arjun", "stop playing")).toContain("head back");
    expect(companions.get().modes.arjun).toBeUndefined();
  });

  test("other messages, and goodbyes to someone who isn't with you, go to the AI", () => {
    companions.setOpen(true);
    expect(answerCompanion("priya", "What are you working on?")).toBeNull();
    expect(answerCompanion("priya", "bye")).toBeNull();
  });

  test("each of them is asked separately, and closing the 3D view sends them all back", () => {
    companions.setOpen(true);
    answerCompanion("maya", "walk with me");
    answerCompanion("rahul", "let's play");
    expect(companions.get().modes).toEqual({ maya: "follow", rahul: "play" });
    companions.setOpen(false);
    expect(companions.get()).toEqual({ open: false, modes: {} });
  });
});
