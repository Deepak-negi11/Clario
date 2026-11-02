import prisma from "@repo/db";
import { SignupSchema } from "@repo/shared";

export async function handleSignup(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);

  const parsed = SignupSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ message: "Invalid request" }, { status: 400 });
  }

  const { username, email, password } = parsed.data;

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


      role: "User",
    },
  }).catch((error: unknown) => {
    // Two requests can pass the existence check before either inserts its row.
    if ((error as { code?: string })?.code === "P2002") return null;
    throw error;
  });
  if (!user) return Response.json({ message: "User already exists" }, { status: 400 });

  return Response.json({ userId: user.id });
}
