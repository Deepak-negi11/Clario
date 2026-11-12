import prisma from "@repo/db";
import { DEFAULT_MAP_TEMPLATE, getMapTemplate } from "@repo/shared";
import { requireAuth } from "../middleware/auth";

// GET /api/v1/demo-space: the shared demo room, for a guest who joined from the sign-in or sign-up
// page rather than a space's link, so they have somewhere to try Clario. Any signed-in user may
// ask. DEMO_SPACE_ID picks an existing space; otherwise the server makes one the first time, owned
// by a demo account nobody can sign in to.

const DEMO_OWNER_EMAIL = "demo-room@clario.invalid";
const DEMO_NAME = "Clario demo room";

let creating: Promise<string> | null = null;

async function demoSpaceId(): Promise<string> {
  const configured = process.env.DEMO_SPACE_ID?.trim();
  if (configured) return configured;

  const owner = await prisma.user.upsert({
    where: { email: DEMO_OWNER_EMAIL },
    update: {},
    create: { username: "Clario", email: DEMO_OWNER_EMAIL, password: await Bun.password.hash(crypto.randomUUID()), role: "User" },
  });
  const existing = await prisma.space.findFirst({ where: { creatorId: owner.id }, orderBy: { id: "asc" }, select: { id: true } });
  if (existing) return existing.id;

  const template = getMapTemplate(DEFAULT_MAP_TEMPLATE);
  const space = await prisma.space.create({
    data: {
      name: DEMO_NAME,
      width: template.dimensions.width,
      height: template.dimensions.height,
      creatorId: owner.id,
      mapTemplate: DEFAULT_MAP_TEMPLATE,
      thumbnail: template.thumbnail,
    },
  });
  return space.id;
}

export async function handleDemoSpace(req: Request): Promise<Response> {
  const auth = requireAuth(req);
  if (auth instanceof Response) return auth;
  // One at a time, so two first visitors don't make two demo rooms.
  creating ??= demoSpaceId().finally(() => {
    creating = null;
  });
  return Response.json({ spaceId: await creating });
}
