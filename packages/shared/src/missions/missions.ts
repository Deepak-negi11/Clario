// Workplace Quest missions (PS7_BUILD_BRIEF.md sections 5.1 and 6). A fictional coworker at
// Larkspur Labs opens a chat; the learner writes the reply. All people and companies are made up.

export type Formality = "casual" | "professional" | "formal";

export type Mission = {
  id: string;
  title: string;
  situation: string;               // what the learner knows
  goal: string;                    // what the learner must do
  context?: string;                // extra material, e.g. raw meeting notes
  openingMessage: string | null;   // the coworker's first message (null: the learner writes first)
  previousUserMessage?: string;    // for nudges: the learner's earlier, unanswered message
  mustInclude: { label: string; ruleKeywords: string[] }[];
  coworker: { name: string; role: string; personality: string; formality: Formality };
  hiddenFacts: string[];           // the coworker shares these only when asked clearly
  goodReply: string;               // the coworker's answer when the AI is unavailable
  hints: [string, string];
  exampleReply: string;            // shown only after at least one attempt
};

export const MISSIONS: Mission[] = [
  {
    id: "ask-without-apology",
    title: "Ask Without Apology",
    situation:
      "You have been stuck for about 2 hours. After pulling the latest main branch, the staging login API returns '500: Database connection failed'. You already restarted the server and checked DB_URL in your .env.local file.",
    goal: "Ask Arjun for help clearly and confidently, without over-apologising.",
    openingMessage: "Hey! How's the login bug going?",
    mustInclude: [
      { label: "the exact error", ruleKeywords: ["500", "database connection", "connection failed", "error"] },
      { label: "what you already tried", ruleKeywords: ["tried", "checked", "restarted", "already"] },
      { label: "a specific request with a time", ruleKeywords: ["could you", "can you", "would you", "minutes", "today", "when you're free"] },
    ],
    coworker: {
      name: "Arjun Mehta",
      role: "Senior Backend Engineer",
      personality: "calm, helpful, busy; appreciates specific questions",
      formality: "casual",
    },
    hiddenFacts: [
      "The staging database password was rotated yesterday.",
      "The new credentials are in the team vault under 'staging-db'.",
      "Arjun is free for 10 minutes at 3 PM today.",
    ],
    goodReply:
      "Ah, the staging DB password was rotated yesterday. Grab the new one from the team vault under 'staging-db'. If it still fails, ping me at 3 PM and we'll look together.",
    hints: [
      "Name the exact error message so Arjun knows what is happening.",
      "Say what you already tried, then ask for something specific with a time.",
    ],
    exampleReply:
      "Hi Arjun, the staging login API is returning '500: Database connection failed' since I pulled main. I've restarted the server and checked DB_URL in .env.local, but it still fails. Could you spare 10 minutes today to take a look?",
  },
  {
    id: "ticket-triage",
    title: "Ticket Triage",
    situation: "Your manager assigned you ticket FE-142. Its full description is: 'Fix the login page.' Nothing else.",
    goal: "Ask Priya the right questions so you know exactly what to fix.",
    openingMessage: "Hey, can you pick up FE-142, fix the login page? Thanks!",
    mustInclude: [
      { label: "what exactly is broken", ruleKeywords: ["what exactly", "design", "error", "bug", "broken", "fails", "which part"] },
      { label: "which platform or browser", ruleKeywords: ["mobile", "desktop", "browser", "safari", "chrome", "android", "ios", "platform", "devices"] },
      { label: "the deadline or priority", ruleKeywords: ["deadline", "by when", "when", "priority", "release", "urgent", "ship"] },
    ],
    coworker: {
      name: "Priya Nair",
      role: "Engineering Manager",
      personality: "busy and direct; friendly when people are specific",
      formality: "professional",
    },
    hiddenFacts: [
      "The login button does nothing on mobile Safari.",
      "The page design is fine; only the button is broken.",
      "It must be fixed before Friday's release.",
      "The support team reported it.",
    ],
    goodReply:
      "Good questions. The login button does nothing on mobile Safari; the design is fine. Support reported it and it needs to ship before Friday's release.",
    hints: [
      "Ask what exactly is wrong: the design, an error, or something not working.",
      "Ask where it happens (device or browser) and by when it is needed.",
    ],
    exampleReply:
      "Hi Priya, a few quick questions on FE-142: 1) Is it a design issue or is login failing? 2) Which devices or browsers are affected? 3) When does it need to ship? I'll start as soon as I know.",
  },
  {
    id: "meeting-echo",
    title: "Meeting Echo",
    situation: "You just left the team sync. Your rough notes are below. Rahul asked someone to post the summary in the team channel.",
    context: "launch maybe fri?? (depends on testing)\nrahul: testing by thu\ndesign not final -> ask kavya\nclient logo still pending -> me to ask client\nnext sync thu 11am",
    goal: "Turn the notes into a clear summary: decisions, owners, dates and open questions.",
    openingMessage: "Can someone post the summary from today's sync?",
    mustInclude: [
      { label: "the decisions", ruleKeywords: ["decided", "decision", "launch", "target", "agreed"] },
      { label: "an owner for each action item", ruleKeywords: ["rahul", "kavya", "i will", "i'll", "owner"] },
      { label: "dates or deadlines", ruleKeywords: ["thu", "thursday", "fri", "friday", "11", "by"] },
      { label: "the open questions", ruleKeywords: ["pending", "open", "tbd", "to confirm", "question", "not final"] },
    ],
    coworker: {
      name: "Rahul Verma",
      role: "Product Manager",
      personality: "organised; likes clear owners and dates",
      formality: "professional",
    },
    hiddenFacts: ["Kavya is the designer.", "Friday launch is tentative until testing passes."],
    goodReply: "Perfect, thanks. Clear owners and dates. I'll pin this.",
    hints: [
      "Group the notes: decisions, action items, open questions.",
      "Give every action item an owner and a date.",
    ],
    exampleReply:
      "Sync summary (today)\nDecision: launch target Friday, tentative until testing passes.\nActions: Rahul to finish testing by Thursday; Kavya to finalise design; I'll ask the client about the logo.\nOpen: design not final, client logo pending.\nNext sync: Thursday 11 AM.",
  },
  {
    id: "review-ready",
    title: "Review Ready",
    situation:
      "You fixed a bug: users whose email contains capital letters could not log in. Your fix lowercases and trims the email before lookup in auth/login.ts. You added 3 unit tests.",
    goal: "Write a pull request description Sneha can review quickly.",
    openingMessage: "Send me the PR for the email login fix when it's ready, with a proper description please.",
    mustInclude: [
      { label: "what changed", ruleKeywords: ["lowercase", "trim", "changed", "login.ts", "fix"] },
      { label: "why (the bug)", ruleKeywords: ["capital", "uppercase", "couldn't", "could not", "because", "bug"] },
      { label: "how it was tested", ruleKeywords: ["test", "tested", "unit"] },
      { label: "the risk or impact", ruleKeywords: ["risk", "impact", "existing users", "migration", "affects", "no impact"] },
    ],
    coworker: {
      name: "Sneha Iyer",
      role: "Senior Engineer (reviewer)",
      personality: "thorough, kind, asks about edge cases",
      formality: "professional",
    },
    hiddenFacts: ["Sneha wants to know whether existing users with uppercase emails stored in the database are affected."],
    goodReply: "Clear description, thanks. One question: are existing users with uppercase emails already stored in the DB affected?",
    hints: [
      "Cover what changed and why (the bug).",
      "Add how you tested it and any risk for existing users.",
    ],
    exampleReply:
      "Hi Sneha, here's the PR.\nWhat: lowercase and trim the email before lookup in auth/login.ts.\nWhy: users with capital letters in their email (e.g. Name@Mail.com) could not log in.\nTested: 3 new unit tests for mixed-case and padded emails.\nRisk: existing stored emails with capitals may need a one-time migration; I can add one today if needed.",
  },
  {
    id: "gentle-nudge",
    title: "The Gentle Nudge",
    situation:
      "On Monday you asked Neha (IT) for access to the staging-01 server. It is now Thursday morning and there is no reply. You need access for a testing task due Friday. Your ticket number is IT-2291.",
    goal: "Follow up politely so you get unblocked.",
    openingMessage: null,
    previousUserMessage: "Hi Neha, could I get access to staging-01 for testing? Thanks! (Monday 10:12)",
    mustInclude: [
      { label: "a reference to your original request", ruleKeywords: ["monday", "earlier", "request", "following up", "staging-01", "it-2291"] },
      { label: "why it matters (the deadline)", ruleKeywords: ["friday", "deadline", "due", "blocked", "testing"] },
      { label: "a clear ask", ruleKeywords: ["could you", "can you", "would you", "please", "let me know"] },
    ],
    coworker: {
      name: "Neha Kapoor",
      role: "IT Support",
      personality: "overloaded but fair; responds well to clear, polite requests",
      formality: "professional",
    },
    hiddenFacts: [
      "The request was lost in the queue.",
      "Neha can grant access within 30 minutes if she has the ticket number.",
    ],
    goodReply: "Sorry, this slipped through the queue. Thanks for the ticket number, I'll grant access to staging-01 within 30 minutes.",
    hints: [
      "Mention your original request (what and when) and the ticket number.",
      "Say why it matters now and ask clearly, without blaming.",
    ],
    exampleReply:
      "Hi Neha, following up on my Monday request (IT-2291) for staging-01 access. I need it for a testing task due Friday. Could you take a look today? Thanks!",
  },
];

export function getMission(id: string): Mission | undefined {
  return MISSIONS.find((mission) => mission.id === id);
}
