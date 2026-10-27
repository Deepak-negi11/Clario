import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import axios from "axios";
import { startServer } from "../../index";

const PORT = 4001;
const BACKEND_URL = `http://localhost:${PORT}`;

let server: ReturnType<typeof startServer>;



beforeAll(() => {
  server = startServer(PORT);
});

afterAll(() => {
  server.stop(true);
});

const client = axios.create({
  baseURL: BACKEND_URL,
  validateStatus: () => true,
});

async function post(
  path: string,
  body: unknown,
  config?: Parameters<typeof client.post>[2],
) {
  const res = await client.post(path, body, config);
  return { status: res.status, data: res.data };
}

async function get(path: string, config?: Parameters<typeof client.get>[1]) {
  const res = await client.get(path, config);
  return { status: res.status, data: res.data };
}

async function makeUser(role: "admin" | "user" = "user") {
  const username = `user-${crypto.randomUUID()}`;
  const email = `${crypto.randomUUID()}@test.com`;
  const password = "password123";

  const signup = await post("/api/v1/signup", { username, password, email, type: role });
  const signin = await post("/api/v1/signin", { email, password });

  return {
    username,
    email,
    password,
    userId: signup.data?.userId as string,
    token: signin.data?.token as string,
  };
}

function authHeader(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

describe("Authentication", () => {
  describe("signup", () => {
    test("user can sign up", async () => {
      const username = `deepak-${crypto.randomUUID()}`;



      const res = await post("/api/v1/signup", {
        username,
        password: "password123",
        email: `${crypto.randomUUID()}@test.com`,
      });
      expect(res.status).toBe(200);
      expect(res.data.userId).toBeString();
    });

    test("signup with same email twice fails", async () => {
      const body = {
        username: `deepak-${crypto.randomUUID()}`,
        password: "password123",
        email: `${crypto.randomUUID()}@test.com`,
      };
      const first = await post("/api/v1/signup", body);
      expect(first.status).toBe(200);

      const second = await post("/api/v1/signup", body);
      expect(second.status).toBe(400);
    });

    test("signup with short password fails", async () => {
      const res = await post("/api/v1/signup", {
        username: `deepak-${crypto.randomUUID()}`,
        password: "123",
        email: `${crypto.randomUUID()}@test.com`,
      });
      expect(res.status).toBe(400);
    });

    test("signup with missing username fails", async () => {
      const res = await post("/api/v1/signup", {
        password: "password123",
        email: `${crypto.randomUUID()}@test.com`,
      });
      expect(res.status).toBe(400);
    });

    test("signup with missing password fails", async () => {
      const res = await post("/api/v1/signup", {
        username: `deepak-${crypto.randomUUID()}`,
        email: `${crypto.randomUUID()}@test.com`,
      });
      expect(res.status).toBe(400);
    });

    test("signup with invalid email fails", async () => {
      const res = await post("/api/v1/signup", {
        username: `deepak-${crypto.randomUUID()}`,
        password: "password123",
        email: "not-an-email",
      });
      expect(res.status).toBe(400);
    });

    test("signup with empty body fails", async () => {
      const res = await post("/api/v1/signup", {});
      expect(res.status).toBe(400);
    });
  });

  describe("signin", () => {
    test("signin with correct credentials returns a token", async () => {
      const email = `${crypto.randomUUID()}@test.com`;
      const password = "password123";
      await post("/api/v1/signup", {
        username: `deepak-${crypto.randomUUID()}`,
        password,
        email,
      });

      const res = await post("/api/v1/signin", { email, password });
      expect(res.status).toBe(200);
      expect(res.data.token).toBeString();
    });

    test("signin with wrong password fails", async () => {
      const email = `${crypto.randomUUID()}@test.com`;
      await post("/api/v1/signup", {
        username: `deepak-${crypto.randomUUID()}`,
        password: "password123",
        email,
      });

      const res = await post("/api/v1/signin", { email, password: "wrongpassword" });
      expect(res.status).toBe(403);
    });

    test("signin with non-existent user fails", async () => {
      const res = await post("/api/v1/signin", {
        email: `${crypto.randomUUID()}@test.com`,
        password: "password123",
      });
      expect(res.status).toBe(403);
    });

    test("signin with missing password fails", async () => {
      const res = await post("/api/v1/signin", {
        email: `${crypto.randomUUID()}@test.com`,
      });
      expect(res.status).toBe(400);
    });

    test("signin with missing email fails", async () => {
      const res = await post("/api/v1/signin", { password: "password123" });
      expect(res.status).toBe(400);
    });
  });
});

describe("User metadata endpoints", () => {
  let token = "";
  let avatarId = "";

  beforeAll(async () => {
    const user = await makeUser("admin");
    token = user.token;

    const avatarRes = await post(
      "/api/v1/admin/avatar",
      {
        imageUrl: "https://example.com/avatar.png",
        name: "Timmy",
      },
      authHeader(token),
    );
    avatarId = avatarRes.data?.avatarId;
  });

  test("cannot update avatar with a wrong avatar id", async () => {
    const res = await post(
      "/api/v1/user/metadata",
      { avatarId: "non-existent-id" },
      authHeader(token),
    );
    expect(res.status).toBe(400);
  });

  test("can update avatar with the right avatar id", async () => {
    const res = await post("/api/v1/user/metadata", { avatarId }, authHeader(token));
    expect(res.status).toBe(200);
  });

  test("cannot update metadata without an auth header", async () => {
    const res = await post("/api/v1/user/metadata", { avatarId });
    expect(res.status).toBe(403);
  });

  test("cannot update metadata with a malformed token", async () => {
    const res = await post(
      "/api/v1/user/metadata",
      { avatarId },
      { headers: { Authorization: "Bearer garbage.token.here" } },
    );
    expect(res.status).toBe(403);
  });
});

describe("User avatar information", () => {
  let userId = "";
  let token = "";

  beforeAll(async () => {
    const user = await makeUser("admin");
    userId = user.userId;
    token = user.token;

    const avatarRes = await post(
      "/api/v1/admin/avatar",
      {
        imageUrl: "https://example.com/avatar.png",
        name: "Timmy",
      },
      authHeader(token),
    );
    const avatarId = avatarRes.data?.avatarId;
    await post("/api/v1/user/metadata", { avatarId }, authHeader(token));
  });

  test("gets back avatar information for a user", async () => {
    const res = await get(`/api/v1/user/metadata/bulk?ids=[${userId}]`);
    expect(res.data.avatars.length).toBe(1);
    expect(res.data.avatars[0].userId).toBe(userId);
  });

  test("available avatars lists the created avatar", async () => {
    const res = await get("/api/v1/avatars");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.avatars)).toBe(true);
    expect(res.data.avatars.length).toBeGreaterThan(0);
  });
});

describe("Admin endpoints", () => {
  let adminToken = "";
  let userToken = "";

  beforeAll(async () => {
    adminToken = (await makeUser("admin")).token;
    userToken = (await makeUser("user")).token;
  });

  test("admin can create an element", async () => {
    const res = await post(
      "/api/v1/admin/element",
      { imageUrl: "https://example.com/chair.png", width: 1, height: 1, static: true },
      authHeader(adminToken),
    );
    expect(res.status).toBe(200);
    expect(res.data.id).toBeString();
  });

  test("admin can create an avatar", async () => {
    const res = await post(
      "/api/v1/admin/avatar",
      { imageUrl: "https://example.com/cat.png", name: "Whiskers" },
      authHeader(adminToken),
    );
    expect(res.status).toBe(200);
    expect(res.data.avatarId).toBeString();
  });

  test("admin can create a map", async () => {
    const res = await post(
      "/api/v1/admin/map",
      {
        thumbnail: "https://example.com/thumb.png",
        dimensions: "100x200",
        name: "Interview Room",
        defaultElements: [],
      },
      authHeader(adminToken),
    );
    expect(res.status).toBe(200);
    expect(res.data.id).toBeString();
  });

  test("a normal user cannot create an element", async () => {
    const res = await post(
      "/api/v1/admin/element",
      { imageUrl: "https://example.com/chair.png", width: 1, height: 1, static: true },
      authHeader(userToken),
    );
    expect(res.status).toBe(403);
  });

  test("admin endpoints reject requests with no token", async () => {
    const res = await post("/api/v1/admin/avatar", {
      imageUrl: "https://example.com/cat.png",
      name: "NoAuth",
    });
    expect(res.status).toBe(403);
  });
});

describe("Space dashboard", () => {
  let token = "";
  let mapId = "";

  beforeAll(async () => {
    const admin = await makeUser("admin");
    token = admin.token;

    const mapRes = await post(
      "/api/v1/admin/map",
      {
        thumbnail: "https://example.com/thumb.png",
        dimensions: "100x200",
        name: "Default Map",
        defaultElements: [],
      },
      authHeader(token),
    );
    mapId = mapRes.data?.id;
  });

  test("can create a space from a map", async () => {
    const res = await post(
      "/api/v1/space",
      { name: "Test Space", dimensions: "100x200", mapId },
      authHeader(token),
    );
    expect(res.status).toBe(200);
    expect(res.data.spaceId).toBeString();
  });

  test("can create a space without a mapId (empty space)", async () => {
    const res = await post(
      "/api/v1/space",
      { name: "Empty Space", dimensions: "100x200" },
      authHeader(token),
    );
    expect(res.status).toBe(200);
    expect(res.data.spaceId).toBeString();
  });

  test("creates a coworking campus with template dimensions and metadata", async () => {
    const created = await post(
      "/api/v1/space",
      {
        name: "Campus Space",
        dimensions: "1x1",
        mapTemplate: "coworking-campus",
      },
      authHeader(token),
    );
    expect(created.status).toBe(200);

    const details = await get(`/api/v1/space/${created.data.spaceId}`, authHeader(token));
    expect(details.status).toBe(200);
    expect(details.data.dimensions).toBe("52x38");
    expect(details.data.mapTemplate).toBe("coworking-campus");
    expect(details.data.thumbnail).toBe("/assets/maps/coworking-campus.png");
  });

  test("rejects an unknown map template", async () => {
    const res = await post(
      "/api/v1/space",
      { name: "Bad Template", dimensions: "44x34", mapTemplate: "moon-base" },
      authHeader(token),
    );
    expect(res.status).toBe(400);
  });

  test("cannot create a space without dimensions", async () => {
    const res = await post(
      "/api/v1/space",
      { name: "Bad Space" },
      authHeader(token),
    );
    expect(res.status).toBe(400);
  });

  test("cannot create a space without a token", async () => {
    const res = await post("/api/v1/space", {
      name: "No Auth Space",
      dimensions: "100x200",
    });
    expect(res.status).toBe(403);
  });

  test("can list my existing spaces", async () => {
    await post(
      "/api/v1/space",
      { name: "Listed Space", dimensions: "100x200" },
      authHeader(token),
    );
    const res = await get("/api/v1/space/all", authHeader(token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.spaces)).toBe(true);
    expect(res.data.spaces.length).toBeGreaterThan(0);
    expect(res.data.spaces[0].mapTemplate).toBeString();
  });

  test("can delete a space", async () => {
    const created = await post(
      "/api/v1/space",
      { name: "Doomed Space", dimensions: "100x200" },
      authHeader(token),
    );
    const spaceId = created.data.spaceId;

    const res = await client.delete(`/api/v1/space/${spaceId}`, authHeader(token));
    expect(res.status).toBe(200);
  });

  test("cannot delete a space that does not exist", async () => {
    const res = await client.delete(
      `/api/v1/space/${crypto.randomUUID()}`,
      authHeader(token),
    );
    expect(res.status).toBe(400);
  });
});

describe("Arena (space elements)", () => {
  let token = "";
  let spaceId = "";
  let elementId = "";

  beforeAll(async () => {
    const admin = await makeUser("admin");
    token = admin.token;

    const elementRes = await post(
      "/api/v1/admin/element",
      { imageUrl: "https://example.com/chair.png", width: 1, height: 1, static: true },
      authHeader(token),
    );
    elementId = elementRes.data?.id;

    const spaceRes = await post(
      "/api/v1/space",
      { name: "Arena Space", dimensions: "100x200" },
      authHeader(token),
    );
    spaceId = spaceRes.data?.spaceId;
  });

  test("can get a space with its elements", async () => {
    const res = await get(`/api/v1/space/${spaceId}`, authHeader(token));
    expect(res.status).toBe(200);
    expect(res.data.dimensions).toBeString();
    expect(Array.isArray(res.data.elements)).toBe(true);
  });

  test("can add an element to a space", async () => {
    const res = await post(
      "/api/v1/space/element",
      { elementId, spaceId, x: 50, y: 20 },
      authHeader(token),
    );
    expect(res.status).toBe(200);
  });

  test("cannot add an element outside space bounds", async () => {
    const res = await post(
      "/api/v1/space/element",
      { elementId, spaceId, x: 999999, y: 999999 },
      authHeader(token),
    );
    expect(res.status).toBe(400);
  });

  test("can see all available elements", async () => {
    const res = await get("/api/v1/elements");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.elements)).toBe(true);
  });
});
