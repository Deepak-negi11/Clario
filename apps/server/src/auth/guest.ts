import prisma from "@repo/db";
import { GuestSchema } from "@repo/shared";
import jwt from "jsonwebtoken";
import { jwtSecret } from "../utils/security";

const JWT_SECRET = jwtSecret();

// POST /api/v1/guest: someone opened a space's link and joins without an account. They get a
// guest user (a name, no email or password anyone knows) and a login token, so the space, chat,
// movement and calls work as for everyone else. Guests can't create spaces, use the site's AI,
// get an agent key or send email; those endpoints check isGuest. Rate limited with sign-in.
export async function handleGuest(req: Request): Promise<Response> {
  const parsed = GuestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "Enter a name to show others." }, { status: 400 });

  const user = await prisma.user.create({
    data: {
      username: parsed.data.username,
      // Unique and unreachable (.invalid can't be a real address); nobody can sign in with it.
      email: `guest-${crypto.randomUUID()}@guest.clario.invalid`,
      password: await Bun.password.hash(crypto.randomUUID()),
      role: "Guest",
    },
  });
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
  return Response.json({ token, userId: user.id });
}

/** Whether this user joined as a guest. */
export async function isGuest(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return user?.role === "Guest";
}

export function guestRefusal(what: string): Response {
  return Response.json({ message: `Create a free account to ${what}.`, guest: true }, { status: 403 });
}
