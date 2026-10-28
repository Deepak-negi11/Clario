import * as z from "zod"

export const SignupSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(8).max(30),
    email: z.email(),
    type: z.enum(["admin", "user"]).optional().default("user"),
})
export const SigninSchema = z.object({
    email: z.email(),
    password: z.string().min(8).max(30),
})