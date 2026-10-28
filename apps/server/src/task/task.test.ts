import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import axios from "axios";
import prisma from "@repo/db";
import { startServer } from "../../index";
import { removeUser, setUserOnline } from "../ws/presence";
import { MAX_DESCRIPTION_LENGTH, MAX_SUBJECT_LENGTH, levelRefusal, parseTaskInput, parseTaskStatus } from "./task";

describe("parseTaskInput", () => {
  test("accepts a task and trims it", () => {
    expect(parseTaskInput({ assigneeId: " u1 ", subject: "  Fix  login\npage ", description: " Steps:\r\n1. Open it " })).toEqual({
      assigneeId: "u1",
      subject: "Fix login page",
      description: "Steps:\n1. Open it",
    });
  });

  test("description is optional", () => {
    expect(parseTaskInput({ assigneeId: "u1", subject: "Write the release notes" })).toEqual({
      assigneeId: "u1",
      subject: "Write the release notes",
      description: "",
    });
  });

  test("rejects missing, empty and oversized fields", () => {
    expect(parseTaskInput(null)).toBeString();
    expect(parseTaskInput({ subject: "x" })).toBeString();
    expect(parseTaskInput({ assigneeId: "u1", subject: "x", description: 5 })).toBeString();
    expect(parseTaskInput({ assigneeId: " ", subject: "x" })).toBe("Choose who the task is for");
    expect(parseTaskInput({ assigneeId: "u1", subject: "  " })).toBe("Subject can't be empty");
    expect(parseTaskInput({ assigneeId: "u1", subject: "x".repeat(MAX_SUBJECT_LENGTH + 1) })).toBeString();
    expect(parseTaskInput({ assigneeId: "u1", subject: "x", description: "y".repeat(MAX_DESCRIPTION_LENGTH + 1) })).toBeString();
  });
});

describe("parseTaskStatus", () => {
  test("accepts only the three statuses", () => {
    expect(parseTaskStatus({ status: "in-progress" })).toBe("in-progress");
    expect(parseTaskStatus({ status: "done" })).toBe("done");
    expect(parseTaskStatus({ status: "Done" })).toBeNull();
    expect(parseTaskStatus({})).toBeNull();
    expect(parseTaskStatus(null)).toBeNull();
  });
});

describe("levelRefusal", () => {
  test("explains each refusal and allows strictly downward", () => {
    expect(levelRefusal("senior", "junior")).toBeNull();
    expect(levelRefusal(null, "junior")).toBe("Pick your work level before assigning tasks.");
    expect(levelRefusal("senior", null)).toBe("That person hasn't picked a work level yet.");
    expect(levelRefusal("senior", "senior")).toContain("below that level");
    expect(levelRefusal("junior", "lead")).toContain("You're Junior");
  });
});

describe("Task routes", () => {
  const PORT = 4020;
  let server: ReturnType<typeof startServer>;
  const client = axios.create({ baseURL: `http://localhost:${PORT}`, validateStatus: () => true });
  const userIds: string[] = [];
  let spaceId = "";

  async function makeUser(level?: string) {
    const email = `task-test-${crypto.randomUUID()}@test.com`;
    const password = "password123";
    const signup = await client.post("/api/v1/signup", { username: `task-${crypto.randomUUID().slice(0, 8)}`, password, email, type: "user" });
    const signin = await client.post("/api/v1/signin", { email, password });
    userIds.push(signup.data.userId);
    const auth = { headers: { Authorization: `Bearer ${signin.data.token}` } };
    if (level) expect((await client.post("/api/v1/user/profile", { level }, auth)).status).toBe(200);
    return { userId: signup.data.userId as string, auth };
  }

  // The space owner is a Fresher, to prove owning the space gives no extra power.
  let owner: Awaited<ReturnType<typeof makeUser>>;
  let senior: Awaited<ReturnType<typeof makeUser>>;
  let junior: Awaited<ReturnType<typeof makeUser>>;
  let peer: Awaited<ReturnType<typeof makeUser>>;
  let unset: Awaited<ReturnType<typeof makeUser>>;

  beforeAll(async () => {
    server = startServer(PORT);
    owner = await makeUser("fresher");
    senior = await makeUser("senior");
    junior = await makeUser("junior");
    peer = await makeUser("senior");
    unset = await makeUser();
    const space = await client.post("/api/v1/space", { name: "Task test", dimensions: "20x20" }, owner.auth);
    spaceId = space.data.spaceId;
  });

  afterAll(async () => {
    for (const userId of userIds) await removeUser(spaceId, userId);
    await prisma.space.deleteMany({ where: { id: spaceId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    server.stop(true);
  });

  const tasksPath = () => `/api/v1/space/${spaceId}/tasks`;

  test("needs a valid token", async () => {
    expect((await client.get(tasksPath())).status).toBe(403);
    expect((await client.post(tasksPath(), { assigneeId: "x", subject: "x" })).status).toBe(403);
  });

  test("the profile saves a level, returns it, and rejects unknown ones", async () => {
    const me = await client.get("/api/v1/user/profile", senior.auth);
    expect(me.status).toBe(200);
    expect(me.data).toMatchObject({ userId: senior.userId, level: "senior" });
    expect((await client.get("/api/v1/user/profile", unset.auth)).data.level).toBeNull();

    expect((await client.post("/api/v1/user/profile", { level: "Senior" }, unset.auth)).status).toBe(400);
    expect((await client.post("/api/v1/user/profile", { level: null }, senior.auth)).status).toBe(400);

    const bulk = await client.get(`/api/v1/user/metadata/bulk?ids=${JSON.stringify([senior.userId, unset.userId])}`);
    const levels = Object.fromEntries(bulk.data.avatars.map((user: { userId: string; level: string | null }) => [user.userId, user.level]));
    expect(levels).toEqual({ [senior.userId]: "senior", [unset.userId]: null });
  });

  test("a senior assigns to a junior in the space now, and the junior sees it", async () => {
    const draft = { assigneeId: junior.userId, subject: "Fix the login page", description: "It 500s on submit." };

    expect((await client.post(tasksPath(), draft, senior.auth)).status).toBe(404);
    expect((await client.post(tasksPath(), { ...draft, assigneeId: senior.userId }, senior.auth)).status).toBe(400);

    await setUserOnline(spaceId, junior.userId, { x: 1, y: 1 });
    const created = await client.post(tasksPath(), draft, senior.auth);
    expect(created.status).toBe(201);
    expect(created.data.task).toMatchObject({ subject: draft.subject, description: draft.description, status: "todo", assigneeId: junior.userId });

    const juniorView = await client.get(tasksPath(), junior.auth);
    expect(juniorView.data).toMatchObject({ level: "junior", canAssign: true });
    expect(juniorView.data.received.map((task: { subject: string }) => task.subject)).toEqual([draft.subject]);
  });

  test("the server refuses upward, same-level and unknown-level assignments", async () => {
    for (const user of [senior, owner, peer, unset]) await setUserOnline(spaceId, user.userId, { x: 2, y: 2 });
    const draft = (assigneeId: string) => ({ assigneeId, subject: "Review my PR" });

    const upward = await client.post(tasksPath(), draft(senior.userId), junior.auth);
    expect(upward.status).toBe(403);
    expect(upward.data.message).toContain("You're Junior");
    expect((await client.post(tasksPath(), draft(peer.userId), senior.auth)).status).toBe(403);
    expect((await client.post(tasksPath(), draft(junior.userId), unset.auth)).status).toBe(403);
    expect((await client.post(tasksPath(), draft(unset.userId), senior.auth)).status).toBe(403);
    // Owning the space doesn't skip the rule: the owner is a Fresher.
    expect((await client.post(tasksPath(), draft(junior.userId), owner.auth)).status).toBe(403);
    // The lead's level comes from the database, not from anything the request says.
    expect((await client.post(tasksPath(), { ...draft(senior.userId), level: "lead" }, junior.auth)).status).toBe(403);

    expect((await client.get(tasksPath(), senior.auth)).data.received).toHaveLength(0);
  });

  test("each person sees only their own tasks, both received and given", async () => {
    const juniorView = await client.get(tasksPath(), junior.auth);
    expect(juniorView.data.received).toHaveLength(1);
    expect(juniorView.data.given).toHaveLength(0);

    const seniorView = await client.get(tasksPath(), senior.auth);
    expect(seniorView.data).toMatchObject({ level: "senior", canAssign: true });
    expect(seniorView.data.given).toHaveLength(1);

    const ownerView = await client.get(tasksPath(), owner.auth);
    expect(ownerView.data).toMatchObject({ level: "fresher", canAssign: false, received: [], given: [] });

    expect((await client.get(tasksPath(), unset.auth)).data).toMatchObject({ level: null, canAssign: false });
  });

  test("only the assignee moves the status; only the assigner removes it", async () => {
    const taskId = (await client.get(tasksPath(), junior.auth)).data.received[0].id as string;
    const statusPath = `${tasksPath()}/${taskId}/status`;

    expect((await client.post(statusPath, { status: "done" }, senior.auth)).status).toBe(403);
    expect((await client.post(statusPath, { status: "finished" }, junior.auth)).status).toBe(400);
    const moved = await client.post(statusPath, { status: "in-progress" }, junior.auth);
    expect(moved.status).toBe(200);
    expect(moved.data.task.status).toBe("in-progress");

    expect((await client.delete(`${tasksPath()}/${taskId}`, junior.auth)).status).toBe(403);
    expect((await client.delete(`${tasksPath()}/${taskId}`, senior.auth)).status).toBe(200);
    expect((await client.get(tasksPath(), junior.auth)).data.received).toHaveLength(0);
    expect((await client.post(statusPath, { status: "done" }, junior.auth)).status).toBe(404);
  });
});
