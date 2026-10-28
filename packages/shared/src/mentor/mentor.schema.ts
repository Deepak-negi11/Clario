import * as z from "zod"
import type { LanguageFeedback } from "./coaching"

// Practice Session: the learner asks Maya, the AI mentor, a question (PS7_BUILD_BRIEF.md section 16).

// Only the most recent turns go to the AI; older ones are dropped, not rejected.
export const MENTOR_HISTORY_LIMIT = 8

export const MentorMessageSchema = z.object({
    role: z.enum(["user", "mentor"]),
    text: z.string().trim().min(1).max(1500),
})

export const MentorRequestSchema = z.object({
    message: z.string().trim()
        .min(1, "Type or say a question first.")
        .max(600, "Keep your question under 600 characters."),
    history: z.array(MentorMessageSchema).max(40).default([])
        .transform((turns) => turns.slice(-MENTOR_HISTORY_LIMIT)),
    inputMode: z.enum(["text", "voice"]).default("text"),
})

export type MentorMessage = z.infer<typeof MentorMessageSchema>
export type MentorRequest = z.infer<typeof MentorRequestSchema>
export type MentorSource = "gemini" | "local" | "saved-tips"

export type MentorResponse = {
    reply: string
    source: MentorSource
    // Why the answer came from saved tips (no key, AI down, rate limit). Absent for AI answers.
    notice?: string
    // Feedback on the learner's own English (coaching.ts). Absent for saved tips and when
    // the AI's answer wasn't valid JSON.
    language?: LanguageFeedback
}

// What we read back from the AI providers. Anything else in their responses is ignored.
export const GeminiReplySchema = z.object({
    candidates: z.array(z.object({
        content: z.object({
            parts: z.array(z.object({
                text: z.string().optional(),
                thought: z.boolean().optional(),
            })).default([]),
        }).optional(),
        finishReason: z.string().optional(),
    })).default([]),
})

export const OllamaReplySchema = z.object({
    message: z.object({ content: z.string() }),
})
