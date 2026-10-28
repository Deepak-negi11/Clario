// Saved tips: what Maya answers with when no AI is available (no key, AI down, rate limit).
// Same idea as the rules engine for grading: the feature keeps working without AI.
// Answers are plain text because they are read aloud.

export type SavedTip = {
    id: string
    topic: string
    keywords: string[]
    answer: string
}

export const SAVED_TIPS: SavedTip[] = [
    {
        id: "ask-for-help",
        topic: "asking for help",
        keywords: ["ask for help", "asking for help", "need help", "stuck", "blocked", "unblock", "senior", "bug", "error", "help from"],
        answer: "When you ask for help, give three things: the exact error, what you already tried, and a specific request with a time. For example: the build fails with a timeout, I cleared the cache and retried, could you look at it with me for 10 minutes today? One clear message saves your teammate a round of questions.",
    },
    {
        id: "too-many-sorrys",
        topic: "saying sorry less",
        keywords: ["sorry", "apologise", "apologize", "apology", "apologising", "apologizing", "disturb", "bother", "bothering"],
        answer: "One sorry is enough, and often none is needed. Swap 'sorry to disturb you' for a thank you, like 'thanks for taking a look'. Sounding confident is a way of respecting the other person's time.",
    },
    {
        id: "vague-task",
        topic: "clarifying a vague task",
        keywords: ["vague", "unclear", "ticket", "requirement", "requirements", "clarify", "clarification", "assigned", "what to do", "not clear"],
        answer: "When a task is vague, ask a few short questions: what exactly is wrong, where it happens, and by when it is needed. Show you looked first, for example 'the page looks fine on desktop, is the problem on mobile?'. Then say when you will start.",
    },
    {
        id: "follow-up",
        topic: "following up",
        keywords: ["follow up", "following up", "followup", "no reply", "no response", "not replied", "remind", "reminder", "nudge", "ignored", "waiting for"],
        answer: "To follow up, mention your original request and when you sent it, say why it matters now, and make one clear ask. For example: following up on my Monday request for server access, I need it for testing due Friday, could you check today? Keep it friendly and do not blame.",
    },
    {
        id: "meeting-summary",
        topic: "meeting summaries",
        keywords: ["meeting", "summary", "summarise", "summarize", "notes", "minutes", "sync", "recap", "action items"],
        answer: "A good meeting summary has four parts: the decisions, action items with an owner and a date, open questions, and the next meeting time. Send it within an hour while people still remember. Short lines are easier to scan than paragraphs.",
    },
    {
        id: "pull-request",
        topic: "pull request descriptions",
        keywords: ["pull request", "pr", "code review", "reviewer", "review", "merge", "commit"],
        answer: "A pull request description should say what changed, why, how you tested it, and any risk. Start with the why in one sentence, then the details. Reviewers move faster when they do not have to guess.",
    },
    {
        id: "standup",
        topic: "standup updates",
        keywords: ["standup", "stand up", "stand-up", "daily", "scrum", "status update", "status"],
        answer: "A standup update has three parts: what you did yesterday, what you will do today, and anything blocking you. Keep it under 30 seconds, and name the blocker and who can help. Details can wait for a chat after the meeting.",
    },
    {
        id: "dont-know",
        topic: "saying I don't know",
        keywords: ["don't know", "dont know", "do not know", "not sure", "no idea", "unsure", "can't answer", "cannot answer"],
        answer: "It is fine to say you do not know yet. Say what you will do and when, for example: I am not sure, let me check the logs and get back to you by 3 PM. That builds more trust than guessing.",
    },
    {
        id: "more-time",
        topic: "asking for more time",
        keywords: ["deadline", "extension", "more time", "delay", "late", "behind", "miss", "postpone"],
        answer: "Ask for more time as early as you can, not on the due date. Say where you are, what is left, and a new date you can keep, for example: the API part is done, the tests need one more day, can I deliver on Thursday instead of Wednesday? If it helps, offer a smaller part earlier.",
    },
    {
        id: "feedback",
        topic: "taking feedback",
        keywords: ["feedback", "criticism", "criticised", "criticized", "comments", "defensive", "disagree"],
        answer: "When you get feedback, thank the person, ask about anything unclear, and say what you will change. If you disagree, give your reason once, with facts, and ask what they think. Feedback on your work is not feedback on you.",
    },
    {
        id: "tone",
        topic: "tone and formality",
        keywords: ["tone", "formal", "informal", "casual", "rude", "professional", "manager", "boss", "sound", "polite"],
        answer: "Match the other person's style: short and friendly in chat, a little more formal with a manager you do not know well. Greet them, put the main point in the first line, and end with a clear next step. Avoid all capitals and lots of exclamation marks.",
    },
]

export const OFFLINE_REPLY =
    "I can't reach the AI right now, so I'm answering from saved tips, and I don't have one for that question. " +
    "Ask me about " + SAVED_TIPS.map((tip) => tip.topic).join(", ") + "."

function normalise(text: string): string {
    return " " + text.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9']+/g, " ").trim() + " "
}

// The tip whose keywords best match the question. Longer keywords count more, because
// "pull request" says more than "review". Ties go to the earlier tip. No match -> null.
export function matchSavedTip(question: string): SavedTip | null {
    const text = normalise(question)
    let best: SavedTip | null = null
    let bestScore = 0
    for (const tip of SAVED_TIPS) {
        let score = 0
        for (const keyword of tip.keywords) {
            const needle = normalise(keyword)
            if (text.includes(needle)) score += needle.trim().split(" ").length
        }
        if (score > bestScore) {
            best = tip
            bestScore = score
        }
    }
    return best
}

export function savedTipReply(question: string): string {
    return matchSavedTip(question)?.answer ?? OFFLINE_REPLY
}
