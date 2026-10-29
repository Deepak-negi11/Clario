import { describe, expect, test } from "bun:test";
import {
  answerDirectChat,
  ASK_AGAIN_AFTER_MS,
  canDirectMessage,
  forgetDirectChats,
  requestDirectChat,
} from "./direct-chat";

const space = () => `space-${crypto.randomUUID()}`;

describe("direct chat", () => {
  test("messages are only allowed after the other person accepts", () => {
    const s = space();
    expect(canDirectMessage(s, "a", "b")).toBe(false);
    expect(requestDirectChat(s, "a", "b")).toBe("sent");
    expect(canDirectMessage(s, "a", "b")).toBe(false);
    expect(answerDirectChat(s, "b", "a", true)).toBe(true);
    expect(canDirectMessage(s, "a", "b")).toBe(true);
    expect(canDirectMessage(s, "b", "a")).toBe(true);
  });

  test("asking again before an answer passes the request on again", () => {
    const s = space();
    expect(requestDirectChat(s, "a", "b")).toBe("sent");
    expect(requestDirectChat(s, "a", "b")).toBe("sent");
    expect(answerDirectChat(s, "b", "a", true)).toBe(true);
    expect(answerDirectChat(s, "b", "a", true)).toBe(false);
  });

  test("asking during an open chat starts it over: no messages until the new request is accepted", () => {
    const s = space();
    requestDirectChat(s, "a", "b");
    answerDirectChat(s, "b", "a", true);
    expect(requestDirectChat(s, "a", "b")).toBe("sent");
    expect(canDirectMessage(s, "a", "b")).toBe(false);
    expect(answerDirectChat(s, "b", "a", true)).toBe(true);
    expect(canDirectMessage(s, "a", "b")).toBe(true);
  });

  test("only the person who was asked can answer, and only once", () => {
    const s = space();
    requestDirectChat(s, "a", "b");
    expect(answerDirectChat(s, "a", "b", true)).toBe(false);
    expect(answerDirectChat(s, "c", "a", true)).toBe(false);
    expect(answerDirectChat(s, "b", "a", false)).toBe(true);
    expect(answerDirectChat(s, "b", "a", true)).toBe(false);
    expect(canDirectMessage(s, "a", "b")).toBe(false);
  });

  test("after a decline the same person has to wait before asking again", () => {
    const s = space();
    requestDirectChat(s, "a", "b", 1_000);
    answerDirectChat(s, "b", "a", false, 1_000);
    expect(requestDirectChat(s, "a", "b", 1_000 + ASK_AGAIN_AFTER_MS - 1)).toBe("declined-recently");
    expect(requestDirectChat(s, "a", "b", 1_000 + ASK_AGAIN_AFTER_MS)).toBe("sent");
  });

  test("leaving the space closes that person's chats and requests", () => {
    const s = space();
    requestDirectChat(s, "a", "b");
    answerDirectChat(s, "b", "a", true);
    requestDirectChat(s, "c", "a");
    forgetDirectChats(s, "a");
    expect(canDirectMessage(s, "a", "b")).toBe(false);
    expect(answerDirectChat(s, "a", "c", true)).toBe(false);
    expect(requestDirectChat(s, "a", "b")).toBe("sent");
  });
});
