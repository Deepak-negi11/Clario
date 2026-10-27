# Graphite 26 hackathon log (PS 7: Workplace Quest)

## Starting point (before the event)

This repository starts from our earlier open-source project
[Viora](https://github.com/Deepak-negi11/Viora), copied at commit `23e17d2` on 2026-10-27.

What already existed in that base:

- Next.js + React web app with a Phaser 2D office (movement, maps, furniture, camera)
- Bun server with REST API, JWT auth and WebSocket realtime movement, chat and reactions
- Proximity video, audio and screen share (WebRTC)
- Redis presence and pub/sub, PostgreSQL with Prisma
- Claude Code agent-activity hook and pixel-art generation tools

Not copied: Kubernetes manifests, the Azure deploy workflow and the Dockerfiles.

## Built during the hackathon

Add a row for every piece of work done at the event.

| Date and time | What was built | Who | Files / PR |
|---|---|---|---|
| | | | |

## Planned PS 7 work

- [ ] Mission content and Zod schema (5 core missions)
- [ ] Rules engine fallback grader with unit tests
- [ ] Practice panel: draft, Check, 4 category scores with tips, revise, Send
- [ ] Classic mode (mission list, no gamification) and saved progress
- [ ] AI coach and AI coworker with timeouts and fallbacks
- [ ] NPC coworkers in the office, press E to start a mission
- [ ] Highlights, attempt diff, hint ladder
- [ ] Start/end skill check and progress page
- [ ] Grader evaluation set and results
- [ ] Optional: turn-based voice with the Web Speech API
