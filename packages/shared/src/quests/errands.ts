import { z } from "zod";

// Errands: short runs around Clario HQ that end with choosing the best of three messages to a
// coworker. Each choice is explained against one of the four feedback categories used across
// Workplace Quest (clarity, completeness, tone, next action). This file is plain data and rules;
// the web app keeps the progress and draws the map markers.
// Coworkers are the fictional Larkspur Labs team from PS7_BUILD_BRIEF.md.

export type ErrandSkill = "Clarity" | "Completeness" | "Tone" | "Next action";

export type Errand = {
  id: string;
  title: string;
  blurb: string;
  // Rooms to reach in order, by chat room id on the clario-hq map.
  steps: { room: string; label: string }[];
  message: {
    to: string;
    prompt: string;
    skill: ErrandSkill;
    options: { text: string; best: boolean; why: string }[];
  };
  // Reach the last room within this time for the speed bonus.
  parSeconds: number;
};

export const ERRANDS: Errand[] = [
  {
    id: "small-change",
    title: "Small change?",
    blurb: "Rahul asks for a \"small change\": add a phone number to the signup API. Read the code first, then talk to him.",
    steps: [
      { room: "hq-desks", label: "Read the signup code at Open Desks" },
      { room: "hq-meeting-2", label: "Find Rahul in Meeting Room 2" },
    ],
    message: {
      to: "Rahul (Product Manager)",
      prompt: "The change also needs a database column and a mobile app update. What do you tell Rahul?",
      skill: "Next action",
      options: [
        { text: "Sure, done by tonight!", best: false, why: "You promised before you knew the scope. The database and app changes make tonight impossible." },
        {
          text: "Hi Rahul, the phone field needs a database change and a mobile app update, not just the API. Should I do all three, or only the API for now? All three would take until Thursday.",
          best: true,
          why: "Says what the \"small\" change really touches, asks one clear question and gives a date you can keep.",
        },
        { text: "This isn't a small change at all, you should have checked.", best: false, why: "Blames Rahul for something he couldn't know, and still doesn't say what the work involves." },
      ],
    },
    parSeconds: 30,
  },
  {
    id: "standup-sprint",
    title: "Stand-up sprint",
    blurb: "Stand-up starts in a minute and your notes are still on your desk.",
    steps: [
      { room: "hq-desks", label: "Grab your notes at Open Desks" },
      { room: "hq-meeting-1", label: "Get to stand-up in Meeting Room 1" },
    ],
    message: {
      to: "the team",
      prompt: "It's your turn at stand-up. Which update do you give?",
      skill: "Completeness",
      options: [
        { text: "Same as yesterday, still working on stuff.", best: false, why: "Nobody learns what you did, what's next or whether you're blocked." },
        {
          text: "I had loads of meetings, the build was slow, and I think the API changed but I'm not sure…",
          best: false,
          why: "Lots of detail but no clear status, and the possible blocker is buried.",
        },
        {
          text: "Yesterday: fixed the login redirect. Today: the mobile Safari bug, FE-142. Blocker: I need staging access from IT.",
          best: true,
          why: "Done, next and blocked, in one breath. The team can act on the blocker right away.",
        },
      ],
    },
    parSeconds: 30,
  },
  {
    id: "chase-access",
    title: "Chase your access",
    blurb: "You asked IT for staging access on Monday and heard nothing. Neha is covering the front desk.",
    steps: [
      { room: "hq-desks", label: "Look up your ticket number at Open Desks" },
      { room: "hq-reception", label: "Find Neha at Reception" },
    ],
    message: {
      to: "Neha (IT)",
      prompt: "Neha is busy but looks up. How do you follow up?",
      skill: "Clarity",
      options: [
        {
          text: "Hi Neha, following up on my Monday request IT-2291 for staging-01 access. I need it for a test due Friday. Could you look today?",
          best: true,
          why: "Names the request, the ticket and the deadline, so Neha can find it and act in one go.",
        },
        { text: "Hey, any update??", best: false, why: "Neha handles dozens of requests. Which one do you mean?" },
        { text: "Why is IT always so slow? I asked days ago.", best: false, why: "Blaming puts her on the defensive and still doesn't say what you need." },
      ],
    },
    parSeconds: 30,
  },
  {
    id: "vague-ticket",
    title: "The vague ticket",
    blurb: "FE-142 just says \"login broken on mobile\". Check the spec, then ask Arjun.",
    steps: [
      { room: "hq-library", label: "Check the design spec in the Library" },
      { room: "hq-focus-1", label: "Find Arjun in Focus Room 1" },
    ],
    message: {
      to: "Arjun",
      prompt: "The spec doesn't explain it. What do you ask Arjun?",
      skill: "Clarity",
      options: [
        { text: "I don't get the ticket.", best: false, why: "Arjun can't tell which part is unclear, so he has to guess what to explain." },
        { text: "No worries, I'll figure it out myself!", best: false, why: "Guessing a vague ticket often means fixing the wrong thing and redoing it." },
        {
          text: "Hi Arjun, on FE-142: is login failing, or is it a design issue? Which browsers? And when does it need to ship?",
          best: true,
          why: "Three specific questions that turn a vague ticket into one you can finish.",
        },
      ],
    },
    parSeconds: 30,
  },
  {
    id: "ask-for-help",
    title: "Stuck? Ask well",
    blurb: "You've been stuck on a bug for an hour. Sneha, the senior dev, is on a break in the Lounge.",
    steps: [{ room: "hq-lounge", label: "Catch Sneha in the Lounge" }],
    message: {
      to: "Sneha",
      prompt: "How do you ask Sneha for help?",
      skill: "Tone",
      options: [
        { text: "Sorry to bother you, I'm really sorry, I know you're busy, sorry…", best: false, why: "All apology, no problem. Sneha still doesn't know what you're stuck on." },
        {
          text: "Hi Sneha, I'm stuck on the email-case bug: lowercasing works at signup but not at login. I tried two fixes. Could you spare 10 minutes today?",
          best: true,
          why: "Confident and polite, with the problem, what you tried and a small, timed ask.",
        },
        { text: "Can you fix my bug?", best: false, why: "It hands over the work without any context, and you learn nothing." },
      ],
    },
    parSeconds: 25,
  },
  {
    id: "on-leave",
    title: "He's on leave",
    blurb: "Kabir wrote the payment retry code and is on leave until Monday. A double-charge bug in it must be fixed today.",
    steps: [
      { room: "hq-library", label: "Read Kabir's design notes in the Library" },
      { room: "hq-hack", label: "Find Arjun in the Hack Space" },
    ],
    message: {
      to: "Arjun (Senior Backend Engineer)",
      prompt: "Kabir's notes don't say why payment retries stop after 3 tries. What do you ask Arjun?",
      skill: "Completeness",
      options: [
        { text: "Can you explain the whole payment code to me?", best: false, why: "Far too broad: Arjun can't tell which part you're stuck on, so it costs him an hour." },
        {
          text: "Hi Arjun, I'm fixing the double-charge bug in Kabir's payment retry code while he's away. His notes don't say why retries stop at 3. Is that limit from the bank's API, or safe to change? I want to ship the fix today.",
          best: true,
          why: "Context, the exact gap, a question Arjun can answer quickly, and the deadline.",
        },
        { text: "I'll just wait for Kabir to come back on Monday.", best: false, why: "Users keep getting double-charged, and nobody knows the fix is stuck." },
      ],
    },
    parSeconds: 30,
  },
  // Tech Wing errands
  {
    id: "server-down",
    title: "Server's down!",
    blurb: "Alarms in the Server Room: login is failing for everyone. Check the racks, then tell the team.",
    steps: [{ room: "hq-server", label: "Check the racks in the Server Room" }],
    message: {
      to: "#incidents",
      prompt: "You found it: rack 3's disk is full. What do you post?",
      skill: "Clarity",
      options: [
        { text: "SERVER BROKEN!!! HELP", best: false, why: "Panic spreads fast. Nobody knows what's broken, who is affected or who's on it." },
        {
          text: "Incident: login has been down for all users since 14:05. Cause: full disk on rack 3. Arjun and I are on it; next update at 14:30.",
          best: true,
          why: "What, since when, who is affected, the cause, who owns it and when the next update comes.",
        },
        { text: "Something's up with a server, not sure what. Will check later.", best: false, why: "No impact and no owner, and \"later\" leaves everyone guessing during an outage." },
      ],
    },
    parSeconds: 25,
  },
  {
    id: "review-comments",
    title: "Review comments",
    blurb: "Sneha reviewed your pull request. One comment asks you to split a function you think is fine as it is.",
    steps: [{ room: "hq-desks", label: "Open the review at Open Desks" }],
    message: {
      to: "Sneha (reviewer)",
      prompt: "She suggests splitting validateUser() into three functions. You think that would repeat a database query. How do you reply?",
      skill: "Tone",
      options: [
        { text: "No, my way is better.", best: false, why: "A flat no with no reason turns a review into an argument." },
        { text: "Ok, will change.", best: false, why: "You change code you think is worse, and the team never hears your reason." },
        {
          text: "Thanks, Sneha! I kept it as one function because all three checks share one user lookup, and splitting it would repeat that query. Would a comment explaining this work, or do you still prefer the split?",
          best: true,
          why: "Thanks her, gives one concrete reason and offers a way forward instead of a fight.",
        },
      ],
    },
    parSeconds: 20,
  },
  {
    id: "estimate",
    title: "How long will it take?",
    blurb: "Priya is planning the sprint and needs a date for the CSV export feature. Check the ticket, then answer her.",
    steps: [
      { room: "hq-library", label: "Check the export ticket in the Library" },
      { room: "hq-meeting-1", label: "Find Priya in Meeting Room 1" },
    ],
    message: {
      to: "Priya (Engineering Manager)",
      prompt: "It takes 3 days if the old reports API works as documented, 5 if it needs fixing. What do you tell Priya?",
      skill: "Next action",
      options: [
        { text: "Should be quick, maybe tomorrow?", best: false, why: "A guess that sounds like a promise. If the reports API needs fixing, the sprint plan is wrong." },
        { text: "I can't know until I start.", best: false, why: "Honest, but Priya has nothing to plan with and no idea when you will know." },
        {
          text: "3 days if the old reports API works as documented, 5 if it needs fixing. I'll test it this afternoon and confirm by 11 tomorrow.",
          best: true,
          why: "A range, the one thing it depends on, and when the date becomes firm.",
        },
      ],
    },
    parSeconds: 30,
  },
];

export function getErrand(id: string) {
  return ERRANDS.find((errand) => errand.id === id) ?? null;
}

// --- A run: one attempt at an errand, from accepting it to sending the message --------------

export type ErrandRun = {
  errandId: string;
  // Index of the next room to reach; equals steps.length once every room is reached.
  step: number;
  startedAt: number;
  arrivedAt: number | null;
  // Options tried that weren't the best one.
  wrongPicks: number[];
};

export function startRun(errand: Errand, now: number, currentRoom: string | null): ErrandRun {
  return enterRoom({ errandId: errand.id, step: 0, startedAt: now, arrivedAt: null, wrongPicks: [] }, errand, currentRoom, now);
}

// Moves the run on when you walk into the room it is waiting for.
export function enterRoom(run: ErrandRun, errand: Errand, room: string | null, now: number): ErrandRun {
  if (run.arrivedAt !== null || errand.steps[run.step]?.room !== room) return run;
  const step = run.step + 1;
  return { ...run, step, arrivedAt: step >= errand.steps.length ? now : null };
}

export function runSeconds(run: ErrandRun, now: number) {
  return Math.max(0, ((run.arrivedAt ?? now) - run.startedAt) / 1000);
}

// --- Rewards, badges and levels -------------------------------------------------------------

export const ERRAND_REWARD = { xp: 40, coins: 10, fastXp: 20, fastCoins: 5, firstTryXp: 20, firstTryCoins: 5 };
export const XP_PER_LEVEL = 100;

export type ErrandReward = { xp: number; coins: number; fast: boolean; firstTry: boolean; repeat: boolean };

// Full reward the first time; replays earn half, so the list can't be farmed.
export function errandReward(errand: Errand, seconds: number, wrongPicks: number, repeat: boolean): ErrandReward {
  const fast = seconds <= errand.parSeconds;
  const firstTry = wrongPicks === 0;
  const R = ERRAND_REWARD;
  let xp = R.xp + (fast ? R.fastXp : 0) + (firstTry ? R.firstTryXp : 0);
  let coins = R.coins + (fast ? R.fastCoins : 0) + (firstTry ? R.firstTryCoins : 0);
  if (repeat) {
    xp = Math.round(xp / 2);
    coins = Math.round(coins / 2);
  }
  return { xp, coins, fast, firstTry, repeat };
}

export const errandProgressSchema = z.object({
  xp: z.number().int().min(0),
  coins: z.number().int().min(0),
  done: z.record(z.string(), z.object({
    runs: z.number().int().min(1),
    bestSeconds: z.number().min(0),
    firstTry: z.boolean(),
    fast: z.boolean(),
  })),
  visited: z.array(z.string()),
  badges: z.array(z.string()),
});
export type ErrandProgress = z.infer<typeof errandProgressSchema>;

export const EMPTY_ERRAND_PROGRESS: ErrandProgress = { xp: 0, coins: 0, done: {}, visited: [], badges: [] };

// Saved progress comes from browser storage, so anything that doesn't fit starts fresh.
export function parseErrandProgress(raw: unknown): ErrandProgress {
  const parsed = errandProgressSchema.safeParse(raw);
  return parsed.success ? parsed.data : EMPTY_ERRAND_PROGRESS;
}

export type ErrandBadge = { id: string; title: string; description: string };
export const ERRAND_BADGES: ErrandBadge[] = [
  { id: "speedy-runner", title: "Speedy Runner", description: "Finish an errand under its target time." },
  { id: "right-words", title: "Right Words", description: "Pick the best message first time on 3 errands." },
  { id: "office-explorer", title: "Office Explorer", description: "Walk into every room in Clario HQ." },
  { id: "errand-pro", title: "Errand Pro", description: "Finish every errand." },
];

export function earnedBadges(progress: ErrandProgress, roomIds: string[]): string[] {
  const done = Object.values(progress.done);
  const earned: string[] = [];
  if (done.some((entry) => entry.fast)) earned.push("speedy-runner");
  if (done.filter((entry) => entry.firstTry).length >= 3) earned.push("right-words");
  if (roomIds.length > 0 && roomIds.every((room) => progress.visited.includes(room))) earned.push("office-explorer");
  if (ERRANDS.every((errand) => progress.done[errand.id])) earned.push("errand-pro");
  return earned;
}

// Adds any badges the progress now earns; returns the new ones so the app can celebrate them.
function withBadges(progress: ErrandProgress, roomIds: string[]) {
  const newBadges = earnedBadges(progress, roomIds).filter((badge) => !progress.badges.includes(badge));
  return { progress: newBadges.length ? { ...progress, badges: [...progress.badges, ...newBadges] } : progress, newBadges };
}

export function visitRoom(progress: ErrandProgress, room: string, roomIds: string[]) {
  if (progress.visited.includes(room)) return { progress, newBadges: [] as string[] };
  return withBadges({ ...progress, visited: [...progress.visited, room] }, roomIds);
}

export function completeErrand(progress: ErrandProgress, errand: Errand, seconds: number, wrongPicks: number, roomIds: string[]) {
  const before = progress.done[errand.id];
  const reward = errandReward(errand, seconds, wrongPicks, !!before);
  const entry = {
    runs: (before?.runs ?? 0) + 1,
    bestSeconds: before ? Math.min(before.bestSeconds, seconds) : seconds,
    firstTry: (before?.firstTry ?? false) || reward.firstTry,
    fast: (before?.fast ?? false) || reward.fast,
  };
  const next = { ...progress, xp: progress.xp + reward.xp, coins: progress.coins + reward.coins, done: { ...progress.done, [errand.id]: entry } };
  return { ...withBadges(next, roomIds), reward, levelUp: levelFor(next.xp).level > levelFor(progress.xp).level };
}

export function levelFor(xp: number) {
  return { level: Math.floor(xp / XP_PER_LEVEL) + 1, into: xp % XP_PER_LEVEL, needed: XP_PER_LEVEL };
}
