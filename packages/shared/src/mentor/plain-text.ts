// Maya's replies are read aloud, so they must be plain text. Models still slip into
// markdown now and then; this removes it instead of reading "asterisk asterisk" aloud.

const MAX_REPLY_CHARS = 700

export function toPlainText(reply: string): string {
    let text = reply
        .replace(/<think>[\s\S]*?<\/think>/gi, " ")   // reasoning blocks from some local models
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")      // [label](url) -> label
        .replace(/^\s{0,3}#{1,6}\s+/gm, "")           // headings
        .replace(/^\s*(?:[-*+•]|\d+[.)])\s+/gm, "")   // list markers
        .replace(/(\*\*|__|\*|`|~~)/g, "")
        .replace(/\s+/g, " ")
        .trim()

    if (text.length > MAX_REPLY_CHARS) {
        const cut = text.slice(0, MAX_REPLY_CHARS)
        const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "))
        text = lastStop > 0 ? cut.slice(0, lastStop + 1) : cut.trimEnd() + "…"
    }
    return text
}

// Split into sentences so long replies can be spoken one sentence at a time.
export function splitSentences(text: string): string[] {
    return text.split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter(Boolean)
}
