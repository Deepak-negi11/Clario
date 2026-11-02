import * as z from "zod"

export const SignupSchema = z.object({
    username: z.string().trim().min(1).max(80),
    password: z.string().min(8).max(30),
    email: z.email(),
    // Privileged roles are provisioned by a trusted operator, never public signup.
    type: z.literal("user").optional().default("user"),
})
export const SigninSchema = z.object({
    email: z.email(),
    password: z.string().min(8).max(30),
})
