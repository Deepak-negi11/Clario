import * as z from "zod"
import { toPlainText } from "./plain-text"

// The coaching step between the learner and the AI: with every answer, Maya also checks the
// learner's own English and gives hints instead of the corrected words. The AI answers in JSON
// (COACHED_REPLY_JSON_SCHEMA); readCoachedReply checks it, so a careless answer can't flag
// words the learner never wrote or hand over a correction they did not ask for.

export const LANGUAGE_ISSUE_KINDS = ["grammar", "word choice", "clarity", "tone"] as const
export const MAX_LANGUAGE_ISSUES = 3

export type LanguageIssueKind = (typeof LANGUAGE_ISSUE_KINDS)[number]

export type LanguageIssue = {
    quote: string   // the learner's own words, as they wrote them
    kind: LanguageIssueKind
    hint: string    // points at the problem without giving the corrected words
    fix: string     // the corrected words; the panel shows them only when the learner asks
}

export type LanguageFeedback = {
    issues: LanguageIssue[]   // empty when the message reads well
    tip: string               // one way to improve, or ""
    askedForAnswer: boolean   // the learner asked outright for the full answer or correction
}

// Sent to Gemini (responseJsonSchema) and Ollama (format). askedForAnswer comes first so the
// model decides whether to coach or answer before it writes anything else.
export const COACHED_REPLY_JSON_SCHEMA = {
    type: "object",
    properties: {
        askedForAnswer: {
            type: "boolean",
            description: "True only if the learner explicitly asked for the full answer, the corrected sentence or a complete example.",
        },
        issues: {
            type: "array",
            maxItems: MAX_LANGUAGE_ISSUES,
            description: "Real mistakes in the learner's own English in their latest message. Empty if it reads well.",
            items: {
                type: "object",
                properties: {
                    quote: { type: "string", description: "The learner's words that contain the mistake, copied exactly." },
                    kind: { type: "string", enum: [...LANGUAGE_ISSUE_KINDS] },
                    hint: { type: "string", description: "A nudge that helps the learner find the fix. Never contains the corrected words." },
                    fix: { type: "string", description: "The quote rewritten correctly, in full. Shown only if the learner asks." },
                },
                required: ["quote", "kind", "hint", "fix"],
            },
        },
        tip: { type: "string", description: "One short tip about the learner's English in this message, or an empty string." },
        reply: { type: "string", description: "What Maya says to the learner. Plain text, read aloud." },
    },
    required: ["askedForAnswer", "issues", "tip", "reply"],
}

const CoachedReplySchema = z.object({
    reply: z.string(),
    askedForAnswer: z.boolean().catch(false),
    issues: z.array(z.unknown()).catch([]),
    tip: z.string().catch(""),
})

const IssueSchema = z.object({
    quote: z.string(),
    kind: z.enum(LANGUAGE_ISSUE_KINDS).catch("clarity"),
    hint: z.string(),
    fix: z.string(),
})

// Used when the AI's hint gives the fix away, so the learner still has to find it.
const GENERIC_HINT: Record<LanguageIssueKind, string> = {
    grammar: "Something in the grammar here is off. Read it aloud slowly and check the verb and the word order.",
    "word choice": "One word here doesn't fit a work message. Is there a simpler, more common word?",
    clarity: "This part could confuse the reader. How could you say it more directly?",
    tone: "This part may not sound the way you mean it. How would it feel to read it?",
}

const MAX_QUOTE = 160
const MAX_HINT = 240
const MAX_FIX = 200
const MAX_TIP = 240

// Lower-case words only, so "I am," and "i am" compare equal. Apostrophes count only inside a
// word ("don't"), so a hint that quotes 'by Friday' still matches by friday.
function words(text: string): string[] {
    return text.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9']+/g, " ").split(" ")
        .map((word) => word.replace(/^'+|'+$/g, ""))
        .filter(Boolean)
}

function containsRun(haystack: string[], needle: string[]): boolean {
    return needle.length > 0 && ` ${haystack.join(" ")} `.includes(` ${needle.join(" ")} `)
}

function clip(text: string, max: number): string {
    const plain = toPlainText(text).replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim()
    if (plain.length <= max) return plain
    const cut = plain.slice(0, max)
    return cut.slice(0, Math.max(cut.lastIndexOf(" "), 1)).trimEnd() + "…"
}

// Words that turn up in almost any hint ("check the verb"), so finding one says nothing.
const HINT_WORDS = new Set(["a", "an", "the", "to", "of", "in", "on", "for", "and", "or", "is", "are", "it", "this", "that", "you", "your"])

// Quotes and tips are shown back to the learner, so any that hold personal details (a phone
// number, an email, a password) are dropped: Maya must never repeat them (brief section 16.7).
function looksPrivate(text: string): boolean {
    return /\d[\d\s-]{4,}\d|@|\bpass(?:word|code)\b/i.test(text)
}

function pairs(list: string[]): string[] {
    return list.slice(1).map((word, i) => `${list[i]} ${word}`)
}

// A hint (or tip) gives the fix away when it contains the whole fix, a word the fix brings in
// ("try 'by' instead of 'till'"), or a word pair the fix creates ("say 'how can I'"). Naming
// the learner's own words ("where does 'can' go?") is still a hint. Works however many places
// the fix changes.
export function givesAwayFix(hint: string, quote: string, fix: string): boolean {
    const hintWords = words(hint)
    const quoteWords = words(quote)
    const fixWords = words(fix)
    if (fixWords.length >= 2 && containsRun(hintWords, fixWords)) return true

    const newWords = fixWords.filter((word) => !quoteWords.includes(word) && !HINT_WORDS.has(word))
    if (newWords.some((word) => hintWords.includes(word))) return true

    const quotePairs = new Set(pairs(quoteWords))
    const hintPairs = new Set(pairs(hintWords))
    return pairs(fixWords).some((pair) => {
        const [first = "", second = ""] = pair.split(" ")
        return !quotePairs.has(pair) && hintPairs.has(pair) && !(HINT_WORDS.has(first) && HINT_WORDS.has(second))
    })
}

function readIssue(value: unknown, message: string[], inputMode: "text" | "voice", askedForAnswer: boolean): LanguageIssue | null {
    const parsed = IssueSchema.safeParse(value)
    if (!parsed.success) return null
    const quote = clip(parsed.data.quote, MAX_QUOTE)
    const fix = clip(parsed.data.fix, MAX_FIX)
    let hint = clip(parsed.data.hint, MAX_HINT)
    const quoteWords = words(quote)
    const fixWords = words(fix)

    // The quote must be the learner's own words, or the AI invented the mistake.
    if (!containsRun(message, quoteWords) || !hint || !fix) return null
    if (looksPrivate(quote) || looksPrivate(fix)) return null
    // Speech recognition decides capitals and punctuation, so they are not the learner's mistakes.
    const sameWords = quoteWords.join(" ") === fixWords.join(" ")
    if (sameWords && (inputMode === "voice" || quote === fix)) return null

    if (!askedForAnswer && givesAwayFix(hint, quote, fix)) hint = GENERIC_HINT[parsed.data.kind]
    return { quote, kind: parsed.data.kind, hint, fix }
}

function parseJsonObject(text: string): unknown {
    try {
        const value: unknown = JSON.parse(text)
        return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined
    } catch {
        return undefined
    }
}

// Reads the AI's answer. reply is "" when it can't be used, and the route then answers from a
// saved tip. A model that ignored the JSON format still gets its plain-text reply through,
// without language feedback.
export function readCoachedReply(
    raw: string,
    learnerMessage: string,
    inputMode: "text" | "voice" = "text",
): { reply: string; language?: LanguageFeedback } {
    const text = raw.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, "$1")
    const json = parseJsonObject(text)
    // Half-written JSON (cut off by the token limit) must not be read aloud.
    if (json === undefined) return { reply: text.startsWith("{") ? "" : toPlainText(text) }

    const parsed = CoachedReplySchema.safeParse(json)
    if (!parsed.success) return { reply: "" }
    const { askedForAnswer } = parsed.data

    const message = words(learnerMessage)
    const issues: LanguageIssue[] = []
    for (const value of parsed.data.issues) {
        const issue = readIssue(value, message, inputMode, askedForAnswer)
        const repeated = issues.some((kept) => words(kept.quote).join(" ") === words(issue?.quote ?? "").join(" "))
        if (issue && !repeated) issues.push(issue)
        if (issues.length === MAX_LANGUAGE_ISSUES) break
    }

    // The tip is optional, so one that names a fix is dropped rather than rewritten.
    const tip = clip(parsed.data.tip, MAX_TIP)
    const tipGivesAway = !askedForAnswer && issues.some((issue) => givesAwayFix(tip, issue.quote, issue.fix))

    return {
        reply: toPlainText(parsed.data.reply),
        language: { issues, tip: tipGivesAway || looksPrivate(tip) ? "" : tip, askedForAnswer },
    }
}
