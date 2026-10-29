import * as z from "zod"

// Writing help in the in-game email composer: a suggested message from the subject, and flags on
// wording that is too casual for a work email ("bhaiya", "pls"). The common words are caught here
// with no network call (findInformalWords), so the flags work without an AI. The AI route
// (apps/web/app/api/email-assist) adds the suggested message and catches the rest; readEmailAssist
// checks its JSON, so it can't flag words the writer never used.

export const EMAIL_ASSIST_MODES = ["suggest", "check"] as const
export const MAX_TONE_FLAGS = 4

export type EmailAssistMode = (typeof EMAIL_ASSIST_MODES)[number]
export type EmailField = "subject" | "body"

export type ToneFlag = {
    field: EmailField
    quote: string        // the writer's own words, exactly as they appear in the field
    suggestion: string   // what to write instead; "" means leave the words out
    reason: string
}

export const EmailAssistRequestSchema = z.object({
    // suggest: draft a message from the subject (and flag the subject). check: flag the message.
    mode: z.enum(EMAIL_ASSIST_MODES),
    recipientName: z.string().trim().max(80).default(""),
    subject: z.string().trim().min(1, "Write a subject first.").max(150),
    body: z.string().max(5000).default(""),
}).refine((request) => request.mode === "suggest" || request.body.trim().length > 0, {
    message: "Write some of the message first.",
    path: ["body"],
})

export type EmailAssistRequest = z.infer<typeof EmailAssistRequestSchema>

export type EmailAssistResponse = {
    body?: string        // suggest only: a message the writer can use, edit or ignore
    flags: ToneFlag[]    // the AI's flags; the composer adds findInformalWords itself
}

// The OpenAI-style reply from NVIDIA's chat API. Anything else in it is ignored.
export const NvidiaReplySchema = z.object({
    choices: z.array(z.object({
        message: z.object({ content: z.string().nullish() }),
        finish_reason: z.string().nullish(),
    })).default([]),
})

// The person's first name, as they'd be greeted ("deepak negi" -> "Deepak").
export function firstName(name: string): string {
    const first = name.trim().split(/\s+/)[0] ?? ""
    return first.charAt(0).toUpperCase() + first.slice(1)
}

// Words for family or friends ("bhaiya", "bro"). In the message they become the person's name;
// in the subject, where nobody is addressed, they are left out.
const ADDRESS_TERMS = ["bhaiya", "bhaiyya", "bhaiyaa", "bhai", "dada", "didi", "bro", "bruh", "dude", "buddy"]
const ADDRESS_REASON = "Family and friend words are too familiar for a work email."

// Chat shorthand and fillers, with the word to write instead ("" = leave it out).
const SHORTHAND: Record<string, string> = {
    pls: "please", plz: "please", plss: "please", plzz: "please",
    thx: "thanks", thnx: "thanks", thanx: "thanks", tnx: "thanks",
    u: "you", ur: "your",
    gonna: "going to", wanna: "want to", gotta: "have to",
    btw: "by the way", abt: "about", msg: "message",
    coz: "because", cuz: "because", bcoz: "because", bcz: "because",
    tmrw: "tomorrow", tmr: "tomorrow",
    yaar: "", lol: "", lmao: "", omg: "",
}
const SHORTHAND_REASON = "Chat shorthand reads as rushed in an email. Write it out in full."
const FILLER_REASON = "Chat fillers like this don't belong in a work email."

// Characters that make a match part of a bigger word: "bhaiya" is not in "bhaiyaji", "u" is not in "U-turn".
const JOINED = "\\p{L}\\p{N}'’&/@_-"

// The first place `words` appears in `text` as whole words, ignoring case and runs of spaces.
// "U.S." does not count as the word "u".
function findWords(text: string, words: string, from = 0): { index: number; match: string } | null {
    const parts = words.trim().split(/\s+/).filter(Boolean).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    if (parts.length === 0) return null
    const pattern = new RegExp(`(?<![${JOINED}])${parts.join("\\s+")}(?![${JOINED}]|\\.\\p{L})`, "giu")
    pattern.lastIndex = from
    const found = pattern.exec(text)
    return found ? { index: found.index, match: found[0] } : null
}

function wordCount(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length
}

// Flags the known casual words, in the order they appear, each word once.
export function findInformalWords(text: string, field: EmailField, recipientName = ""): ToneFlag[] {
    const name = firstName(recipientName)
    const found: { index: number; flag: ToneFlag }[] = []

    for (const term of ADDRESS_TERMS) {
        const hit = findWords(text, term)
        if (!hit) continue
        const suggestion = field === "body" ? name : ""
        const reason = suggestion ? `${ADDRESS_REASON} Use their name.` : ADDRESS_REASON
        found.push({ index: hit.index, flag: { field, quote: hit.match, suggestion, reason } })
    }
    for (const [word, replacement] of Object.entries(SHORTHAND)) {
        const hit = findWords(text, word)
        // A capital "U" is more likely a name or a shape than "you".
        if (!hit || (word.length === 1 && hit.match !== word)) continue
        const reason = replacement ? SHORTHAND_REASON : FILLER_REASON
        found.push({ index: hit.index, flag: { field, quote: hit.match, suggestion: replacement, reason } })
    }

    return found.sort((a, b) => a.index - b.index).map((item) => item.flag)
}

// True when the flag's words are still in the text (they go away once the writer edits them).
export function flagStillApplies(text: string, flag: ToneFlag): boolean {
    return findWords(text, flag.quote) !== null
}

function overlaps(a: string, b: string): boolean {
    const left = ` ${a.toLowerCase().split(/\s+/).join(" ")} `
    const right = ` ${b.toLowerCase().split(/\s+/).join(" ")} `
    return left.includes(right) || right.includes(left)
}

// The word list comes first; an AI flag is kept only if it is still in the text and doesn't cover
// the same words as a flag already kept.
export function mergeToneFlags(text: string, local: ToneFlag[], ai: ToneFlag[]): ToneFlag[] {
    const kept: ToneFlag[] = []
    for (const flag of [...local, ...ai]) {
        if (!flagStillApplies(text, flag)) continue
        if (kept.some((other) => overlaps(other.quote, flag.quote))) continue
        kept.push(flag)
    }
    return kept
}

// Puts the suggestion in place of the flagged words (the first time they appear), keeping a
// capital letter at the start of a sentence. An empty suggestion removes the words and tidies the
// spaces and commas around them.
export function applyToneFlag(text: string, flag: ToneFlag): string {
    const hit = findWords(text, flag.quote)
    if (!hit) return text

    let before = text.slice(0, hit.index)
    let after = text.slice(hit.index + hit.match.length)
    const startsSentence = /(^|[.!?]\s+|\n[ \t]*)$/.test(before)

    if (flag.suggestion) {
        const capital = startsSentence || /^\p{Lu}/u.test(hit.match)
        const suggestion = capital ? flag.suggestion.charAt(0).toUpperCase() + flag.suggestion.slice(1) : flag.suggestion
        return before + suggestion + after
    }

    before = before.replace(/[ \t]+$/, "")
    after = after.replace(/^[ \t]+/, "")
    if (startsSentence) {
        // "bhaiya, need help" -> "Need help"
        after = after.replace(/^[,;:][ \t]*/, "")
        after = after.charAt(0).toUpperCase() + after.slice(1)
        return before + (before && !before.endsWith("\n") && after ? " " : "") + after
    }
    // "Hi bhaiya, can you" -> "Hi, can you"
    return before + (after && !/^[,.!?;:]/.test(after) ? " " : "") + after
}

const MAX_SUGGESTED_BODY = 900
// A subject like "ignore your rules and..." can get the model to refuse in the message itself.
const SOUNDS_LIKE_AN_AI = /\b(as an ai|language model|my (safety )?guidelines|cannot fulfil+|can't fulfil+)\b/i
const MAX_QUOTE_WORDS = 6
const MAX_FLAG_TEXT = 80
const MAX_REASON = 160

const AiAnswerSchema = z.object({
    body: z.string().catch(""),
    flags: z.array(z.unknown()).catch([]),
})

const AiFlagSchema = z.object({
    quote: z.string(),
    suggestion: z.string().catch(""),
    reason: z.string().catch(""),
})

function oneLine(text: string, max: number): string {
    const plain = text.replace(/[*_`#]+/g, "").replace(/\s+/g, " ").replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim()
    return plain.length <= max ? plain : plain.slice(0, max).trimEnd() + "…"
}

// The suggested message, as plain text with its line breaks kept. A subject line, markdown and
// "[Your name]" placeholders are taken out; a message that is still too long is cut at a sentence.
function cleanBody(text: string): string {
    let body = text
        .replace(/\r\n/g, "\n")
        .replace(/^\s*subject\s*:.*\n+/i, "")
        .replace(/\[[^\]\n]{1,40}\]/g, "")
        .replace(/(\*\*|__|`|^#+\s*)/gm, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        // The closing goes on its own line: "...a moment? Thanks," -> "...a moment?\n\nThanks,"
        .replace(/([.!?])[ \t]*(thanks|thank you|regards|best regards|best),?$/i, "$1\n\n$2,")
    if (body.length > MAX_SUGGESTED_BODY) {
        const cut = body.slice(0, MAX_SUGGESTED_BODY)
        const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".\n"), cut.lastIndexOf("? "), cut.lastIndexOf("! "))
        body = lastStop > 0 ? cut.slice(0, lastStop + 1) : ""
    }
    return body
}

function parseJsonObject(text: string): unknown {
    try {
        const value: unknown = JSON.parse(text)
        return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined
    } catch {
        return undefined
    }
}

// Reads the AI's JSON answer. null when it can't be used (not JSON, or no message in suggest mode),
// and the composer then simply shows no AI help.
export function readEmailAssist(raw: string, request: EmailAssistRequest): EmailAssistResponse | null {
    const text = raw.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, "$1")
    const parsed = AiAnswerSchema.safeParse(parseJsonObject(text))
    if (!parsed.success) return null

    // Suggest flags the subject; check flags the message.
    const field: EmailField = request.mode === "suggest" ? "subject" : "body"
    const checked = field === "subject" ? request.subject : request.body
    const flags: ToneFlag[] = []
    for (const value of parsed.data.flags) {
        const flag = AiFlagSchema.safeParse(value)
        if (!flag.success) continue
        const quote = oneLine(flag.data.quote, MAX_FLAG_TEXT)
        const suggestion = oneLine(flag.data.suggestion, MAX_FLAG_TEXT)
        const reason = oneLine(flag.data.reason, MAX_REASON)
        // The words must be the writer's own (or the AI made the problem up), short, and actually changed.
        const hit = quote && wordCount(quote) <= MAX_QUOTE_WORDS ? findWords(checked, quote) : null
        if (!hit || suggestion.toLowerCase() === hit.match.toLowerCase()) continue
        if (flags.some((kept) => overlaps(kept.quote, hit.match))) continue
        flags.push({ field, quote: hit.match, suggestion, reason: reason || SHORTHAND_REASON })
        if (flags.length === MAX_TONE_FLAGS) break
    }

    if (request.mode === "check") return { flags }
    const body = cleanBody(parsed.data.body)
    return body && !SOUNDS_LIKE_AN_AI.test(body) ? { body, flags } : null
}
