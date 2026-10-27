import prisma from "@repo/db";
import { SignupSchema } from "@repo/shared";

export async function handleSignup(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);

  const parsed = SignupSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ message: "Invalid request" }, { status: 400 });
  }

  const { username, email, password, type } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return Response.json({ message: "User already exists" }, { status: 400 });
  }

  const passwordHash = await Bun.password.hash(password);

  const user = await prisma.user.create({
    data: {
      username,
      email,
      password: passwordHash,


      role: type === "admin" ? "Admin" : "User",
    },
  });

  return Response.json({ userId: user.id });
}
