# Workplace Quest — team and pitch notes (Graphite 26, PS 7)

For the team, not for the coding agent. The build spec is in `PS7_BUILD_BRIEF.md`.

---

## 1. Before anything: reuse of earlier code

- If you build on any project that existed before the hackathon (for example Viora), **ask the organizers first** whether that is allowed.
- If allowed: say it openly in the pitch and show a clear "built during the hackathon" list.
- If not allowed: start a fresh repo at the event and follow `PS7_BUILD_BRIEF.md`. You keep your knowledge; you just write new code.
- Git history shows commit dates, so hiding reuse is likely to be found and can lead to disqualification.

---

## 2. The idea in one line

A practice app where new employees write workplace messages to fictional coworkers, get four explained scores with tips, revise, and see themselves improve. It works as a walkable 2D office or as a plain, accessible mission list.

---

## 3. Round 1 pitch (5 minutes, problem first)

| Time | Part | Content |
|---|---|---|
| 0:00–0:45 | Story | "Week 1 of an internship. Stuck on a bug for 2 hours. You type 'sorry sorry sir can u help', delete it, and wait another hour." |
| 0:45–1:30 | Evidence | Your own survey numbers (section 4). A weak vs strong message for the same situation (both synthetic). |
| 1:30–2:30 | Solution | Walk to coworker → write → 4 scores + tips → revise → coworker replies. |
| 2:30–3:30 | Why it is better | Section 5. Talk about value, not screens. |
| 3:30–4:15 | Hardest part | Fair, consistent AI grading and how you measured it (section 7). |
| 4:15–5:00 | Tech and team | One architecture diagram, who did what. |

Never present a statistic you did not collect. If you have no survey data, say "from our own internship experience and conversations with seniors".

---

## 4. Evidence: quick survey (20–30 people: seniors with internships, recent grads)

1. Have you ever delayed sending a work message because you were not sure how to write it? (Never / Sometimes / Often)
2. Which messages felt hardest? (asking for help / unclear tasks / follow-ups / meeting summaries / PR descriptions)
3. Did you ever ask a friend "is this message okay?" before sending? (Yes / No)
4. Did college ever teach you how to write these? (Yes / No)
5. Would you practice with a tool like this? (1–5)

Also talk to 3–5 people and note 1–2 quotes, with their permission.
In the pitch: "We surveyed [N] students and recent interns; [X] said they delayed messages because they were unsure how to write them." Use your real N and X.

---

## 5. What makes us different

1. Explainable feedback: four scores, each tip quotes the user's own words, problem phrases highlighted (the booklet forbids a single opaque score).
2. Revise loop with visible improvement: word diff and score changes between attempts.
3. Coworkers react like real people: clear message → helpful answer; vague message → follow-up question (hidden facts are shared only when asked clearly).
4. Hybrid grading: AI coach plus a deterministic rules engine, so feedback never fails.
5. Measured, not assumed: start/end skill check per user, and an evaluation set for the grader.
6. Classic mode doubles as the accessible version (keyboard and screen reader).
7. Spatial context in office mode: who you walk up to sets the expected tone.

Do not lead with "AI-powered" or "metaverse"; every team says that.

---

## 6. Existing products and the gap

| Product type | Good at | Missing for our users |
|---|---|---|
| AI assistants (ChatGPT etc.) | Writing the message for you | You do not learn to write it yourself; no scenarios or progress |
| Grammar/tone tools (Grammarly-type) | Fixing real messages | No safe practice before the real situation |
| Online soft-skills courses | Theory | Passive; no practice with feedback |
| Duolingo | Gamified practice | Languages, not workplace situations |
| Gather Town | Virtual office with real people | No learning or feedback |

Gap: nobody gives new employees a safe place to practice real workplace messages with explained feedback and a revise loop.
Check each product's current features yourself before the pitch.

---

## 7. Hardest part and how we solve it

**Fair, consistent AI grading**
- Score anchors (0–3, 4–6, 7–8, 9–10) and a must-include list per mission.
- JSON output validated with Zod; rules fallback.
- 20+ labelled test drafts, each graded twice: report % within the expected range and the consistency. Include prompt-injection and Hinglish drafts.
- Pitch line: "On our test set, the coach matched our expected range in __ of __ category scores." Fill in real numbers.

**Phaser and React working together**
- A small event bridge; game keyboard paused while the panel is open.

**Scope in limited time**
- Classic mode + rules first (a complete PS 7 without AI), then AI, then the office, then voice.

---

## 8. Tech stack: one-line reasons (for the slide)

| Layer | Tech | Reason |
|---|---|---|
| Game world | Phaser | GPU canvas at 60 fps, physics, input |
| UI | React | Declarative state → UI; one panel reused by both modes |
| App + server | Next.js | Route Handlers keep the AI key on the server; Phaser loads only on the office page |
| Types | TypeScript | Catch mistakes while coding |
| Validation | Zod | Validate user input and AI output at runtime |
| Data | PostgreSQL + Prisma | Relational progress data, typed queries |
| Grading | Gemini + rules engine | No training needed; JSON output; deterministic fallback |
| Voice (optional) | Browser Web Speech API | Free, turn-based speech in and out |

Rendering: landing page static (SSG), progress page dynamic (SSR), office page client-only (CSR).

Answer to "why not simpler?": the simplest stack that still keeps the key secure, the game smooth, and feedback reliable.

---

## 9. Voice (only if everything else is done)

- Turn-based with the browser Web Speech API: the user speaks → text (editable) → same grading and coworker reply → coworker reply spoken aloud with a talking animation. Free.
- Use it for spoken situations (standup), not for PR descriptions.
- Demo in Chrome with a headset mic; halls are noisy. Keep a backup video.
- Real-time voice (Gemini Live API + AudioWorklet) is future work: more natural, but hard and limited on the free tier.
- Practice Session (brief section 16): Maya, a mentor avatar in her own room, answers "how do I…?" questions by text or voice. Same Web Speech API, mic off while she talks, saved tips when the AI is offline, optional local model (Ollama) for an offline laptop demo. Build it only after missions, office and voice work.

---

## 10. Team roles (4 people; merge for smaller teams)

First, agree on the Mission and Feedback contracts in the build brief (section 5), so everyone can work in parallel.

| Role | Owns | Done when |
|---|---|---|
| AI / feedback | Prompts, rules engine, eval set | Endpoint returns valid feedback; eval numbers recorded |
| Game | Phaser office, NPCs, bridge, input pause | Walking to an NPC opens the panel; typing never moves the player |
| Frontend | Practice panel, classic mode, progress, accessibility | Every mission completes in classic mode |
| Backend + content + pitch | Database, APIs, mission writing, survey, slides | Progress saves; missions are realistic; pitch rehearsed |

Writing good missions is real work. Weak missions make a weak product.

---

## 11. Judge questions to prepare

| Question | Answer direction |
|---|---|
| Why does this problem matter, and how do you know? | Survey numbers + quotes (real ones) |
| Why not just use ChatGPT or Grammarly? | They write or fix for you; we teach you to write it yourself, with scenarios and explained feedback |
| How do you know users improve? | Start/end skill check per user; scores across attempts |
| How do you know the AI grades fairly? | Eval set results, consistency check, rules cross-check |
| What if the AI fails? | Rules engine and seeded replies; the source is labelled |
| Is the 2D office just decoration? | It sets context (who you talk to changes tone); classic mode exists for anyone who prefers no game |
| Is it accessible? | Classic mode is keyboard and screen-reader friendly |
| What data do you store? | Guest session, attempts, scores; all content synthetic; nothing is sent anywhere real |
| What did you build during the hackathon? | Show the hackathon log |
| Isn't the mentor just ChatGPT inside your app? | It only covers workplace communication, refuses to write mission replies (gives a checklist instead), answers from saved tips when the AI is down, and its behaviour is checked with an eval set |

---

## 12. Edge cases to mention confidently

AI timeout or bad output → rules; prompt injection test; very short or long drafts rejected; Hinglish handled by grading meaning; rate limits; refresh keeps progress; typing does not move the player; unsupported browsers fall back to text.

---

## 13. Demo script (5 minutes)

1. Problem story (30 s).
2. Office: walk to Priya, press E (30 s).
3. Weak draft "ok sorry what do u mean" → low scores, highlighted phrases, tips (1 min).
4. Revise → diff and higher scores → Send → Priya shares the real details (1 min).
5. Mission complete, tick on the NPC, XP (30 s).
6. Switch to classic mode: same missions, no game (30 s).
7. Progress page: skill check before → after (30 s).
8. Honesty: fallback, eval results, limits (30 s).

Prepare demo data in advance and test on the venue Wi-Fi and on a phone hotspot.

---

## 14. Diagrams to draw (Excalidraw)

1. User flow: entry (office or classic) → practice panel → feedback → revise loop or send → coworker reply → complete → progress saved.
2. Server flow on Check/Send: validate → load mission → AI coach (valid JSON?) → yes: AI scores / no: rules → save attempt → return.
Use one colour for browser parts and another for server parts.

---

## 15. Ask the mentor

1. Can we build on our own earlier project? (Ask this first.)
2. What would make you reject this idea?
3. Is the 2D office adding value, or should we focus only on feedback?
4. How would you measure whether users improve?
5. Which of our differences is strongest and which is weakest?
6. Is our evidence for the problem convincing?

Write down the answers and change the plan based on them.
