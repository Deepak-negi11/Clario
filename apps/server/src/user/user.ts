import prisma from "@repo/db";
import { AvatarLookSchema, parseAvatarLook, parseWorkLevel } from "@repo/shared";
import { requireAuth } from "../middleware/auth";
import { fromDbWorkLevel, toDbWorkLevel } from "./work-level";

export async function handleUpdateMetadata(req: Request): Promise<Response> {
  const auth = requireAuth(req);
  if (auth instanceof Response) return auth;

  const body = (await req.json().catch(() => null)) as { avatarId?: string } | null;


  const avatarId: string | undefined = body?.avatarId

  if (!avatarId) {
    return Response.json({ message: "avatarId is required" }, { status: 400 });
  }
  const avatarExists = await prisma.avatar.findUnique({ where: { id: avatarId } });
  if (!avatarExists) {
    return Response.json({ message: "Avatar not found" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: auth.userId },
    data: { avatarId },
  });

  return Response.json({ message: "Metadata updated" });
}



export async function handleBulkMetadata(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const idsParam = url.searchParams.get("ids") ?? "[]";

  let parsedIds: unknown;
  try {
    parsedIds = JSON.parse(idsParam);
  } catch (error) {

    parsedIds = idsParam.replace(/^\[/, "").replace(/\]$/, "").split(",");
  }

  if (!Array.isArray(parsedIds) || !parsedIds.every((id) => typeof id === "string")) {
    return Response.json({ message: "ids must be an array of strings" }, { status: 400 });
  }
  const userIds = [...new Set(parsedIds.map((id) => id.trim()).filter(Boolean))].slice(0, 100);

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    include: { avatar: true },
  });

  const avatars = users.map((user) => ({
    userId: user.id,
    imageUrl: user.avatar?.imageUrl ?? null,
    username: user.username,
    look: parseAvatarLook(user.avatarLook),
    level: fromDbWorkLevel(user.level),
  }));

  return Response.json({ avatars });
}

export async function handleGetAvatars(_req: Request): Promise<Response> {
  const avatars = await prisma.avatar.findMany();

  return Response.json({
    avatars: avatars.map((avatar) => ({
      id: avatar.id,
      imageUrl: avatar.imageUrl,
      name: avatar.name,
    })),
  });
}

export async function handleUpdateProfile(req: Request): Promise<Response> {
  const auth = requireAuth(req);
  if (auth instanceof Response) return auth;

  const body = (await req.json().catch(() => null)) as { username?: string; email?: string; avatarLook?: unknown; level?: unknown } | null;
  const username = body?.username;
  const email = body?.email;


  const data: { username?: string; email?: string; avatarLook?: string | null; level?: ReturnType<typeof toDbWorkLevel> } = {};
  if (username && username.trim().length > 0) data.username = username.trim();
  if (email && email.trim().length > 0) data.email = email.trim();
  // `null` resets to the default character; anything else must be a valid look.
  if (body && typeof body === "object" && "avatarLook" in body) {
    if (body.avatarLook === null) {
      data.avatarLook = null;
    } else {
      const look = AvatarLookSchema.safeParse(body.avatarLook);
      if (!look.success) return Response.json({ message: "Invalid avatar look" }, { status: 400 });
      data.avatarLook = JSON.stringify(look.data);
    }
  }
  // A level can be changed but not cleared: tasks depend on everyone having one.
  if (body && typeof body === "object" && "level" in body) {
    const level = parseWorkLevel(body.level);
    if (!level) return Response.json({ message: "Invalid work level" }, { status: 400 });
    data.level = toDbWorkLevel(level);
  }


  if (Object.keys(data).length === 0) {
    return Response.json({ message: "Nothing to update" }, { status: 400 });
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: auth.userId },
      data,
    });
    return Response.json({
      message: "Profile updated successfully",
      username: updatedUser.username,
      email: updatedUser.email,
      avatarLook: parseAvatarLook(updatedUser.avatarLook),
      level: fromDbWorkLevel(updatedUser.level),
    });
  } catch {
    return Response.json({ message: "Failed to update profile or email already in use" }, { status: 400 });
  }
}

// The signed-in user's own profile, so the join screen can start from what they saved last time.
export async function handleGetProfile(req: Request): Promise<Response> {
  const auth = requireAuth(req);
  if (auth instanceof Response) return auth;

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { id: true, username: true, email: true, avatarLook: true, level: true },
  });
  if (!user) return Response.json({ message: "User not found" }, { status: 404 });

  return Response.json({
    userId: user.id,
    username: user.username,
    email: user.email,
    avatarLook: parseAvatarLook(user.avatarLook),
    level: fromDbWorkLevel(user.level),
  });
}
