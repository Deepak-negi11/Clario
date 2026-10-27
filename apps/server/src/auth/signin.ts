import prisma from "@repo/db";
import { SigninSchema } from "@repo/shared";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";

export async function handleSignin(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);

  const parsed = SigninSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ message: "Invalid request" }, { status: 400 });
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return Response.json({ message: "Invalid credentials" }, { status: 403 });
  }

  const valid = await Bun.password.verify(password, user.password);
  if (!valid) {
    return Response.json({ message: "Invalid credentials" }, { status: 403 });
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });

  return Response.json({ token });
}
