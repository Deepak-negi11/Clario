import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { signAgentKey } from "../middleware/auth";
import {
  clearAgentActivity,
  clearCurrentSpace,
  getAgentActivities,
  setCurrentSpace,
} from "../ws/presence";
import { handleAgentActivity } from "./agent-activity";

const users = [crypto.randomUUID(), crypto.randomUUID()];
const space = `activity-test-${crypto.randomUUID()}`;
beforeAll(async () => {
  for (const user of users) await setCurrentSpace(user, space);
});
afterEach(async () => {
  for (const user of users)
    for (const agent of ["claude-code", "codex", "cursor-agent"])
      await send(user, { agent, state: "done", text: "" });
});
afterAll(async () => {
  for (const user of users) {
    await clearAgentActivity(space, user);
    await clearCurrentSpace(user);
  }
});
async function send(user: string, body: Record<string, unknown>) {
  const response = await handleAgentActivity(
    new Request("http://localhost/api/v1/agent-activity", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${signAgentKey(user)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
  expect(response.status).toBe(200);
  return response.json();
}

test("each user's activity stays on their avatar, even when a body names another user", async () => {
  expect(
    await send(users[0]!, {
      userId: users[1],
      agent: "codex",
      text: "Codex task",
      state: "cooking",
    }),
  ).toMatchObject({ delivered: true });
  expect(
    await send(users[1]!, {
      agent: "cursor-agent",
      text: "Cursor task",
      state: "cooking",
    }),
  ).toMatchObject({ delivered: true });
  const stored = await getAgentActivities(space);
  expect(stored[users[0]!]).toMatchObject({
    agent: "codex",
    text: "Codex task",
  });
  expect(stored[users[1]!]).toMatchObject({
    agent: "cursor-agent",
    text: "Cursor task",
  });
});

test("switching agents is immediate and a different agent stopping cannot clear the active one", async () => {
  const user = users[0]!;
  await send(user, { agent: "codex", text: "Codex task", state: "cooking" });
  expect(
    await send(user, {
      agent: "cursor-agent",
      text: "Cursor task",
      state: "cooking",
    }),
  ).toMatchObject({ delivered: true });
  expect(
    await send(user, { agent: "codex", text: "", state: "done" }),
  ).toMatchObject({ delivered: false, reason: "different-agent-active" });
  expect((await getAgentActivities(space))[user]?.agent).toBe("cursor-agent");
  await send(user, { agent: "cursor-agent", text: "", state: "done" });
  expect((await getAgentActivities(space))[user]).toBeUndefined();
  expect(
    await send(user, {
      agent: "cursor-agent",
      text: "Next task",
      state: "cooking",
    }),
  ).toMatchObject({ delivered: true });
});
