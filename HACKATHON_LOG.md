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
| 2026-10-28 | Practice Session: Maya, an AI mentor NPC in Clario HQ (Focus Room 2) with a pixel-art talking avatar. Text or voice questions (Web Speech API), Gemini or local Ollama answers, saved tips when no AI is available, `/practice` page, mentor test set | | `packages/shared/src/mentor/`, `apps/web/app/api/mentor/`, `apps/web/components/practice-session/`, `apps/web/lib/mentor/`, `apps/web/lib/speech/`, `apps/web/components/phaser/scenes/mentor-npc.ts`, `apps/web/app/practice/`, `apps/web/eval/`, `apps/web/scripts/eval-mentor.ts` |
| 2026-10-28 | New "Clario HQ" map (tall walls with windows, patterned floors, rugs, furniture drawn in code), Gather-style space UI (sidebar, people panel, minimap, zoom buttons, dark toolbar) and a three.js 3D view of the office | | `apps/web/lib/maps/clario-hq.ts`, `apps/web/components/phaser/scenes/clario-hq-builder.ts`, `apps/web/components/space-3d/`, `apps/web/components/game-ui/` |
| 2026-10-28 | Clario HQ redesign: about half the furniture, an open commons between Open Desks and the Lounge, a separate floor for each area, kitchen chairs that no longer look upside down, a redrawn Game Room (arcades, ping-pong, foosball, neon sign). The 3D view's capsule avatars are now Quaternius CC0 characters (two body types, skin tones, hairstyles) in generated clothes, with recorded idle, jog and sitting animations; a code-built figure is the fallback if they fail to load. Clicking your own avatar no longer opens an agent card | | `apps/web/lib/maps/clario-hq.ts`, `apps/web/components/phaser/scenes/clario-hq-builder.ts`, `apps/web/components/space-3d/`, `packages/shared/src/maps/map-templates.ts`, `apps/web/public/assets/maps/clario-hq.png`, `apps/web/public/assets/3d/quaternius/` |
| 2026-10-28 | Errands: six timed runs around Clario HQ (coffee run, stand-up sprint, chasing IT access, a vague ticket, asking for help, a ping-pong invite) that end with choosing the best of three messages to a coworker, each explained against clarity, completeness, tone or next action. XP, coins, levels and four badges, saved per account in the browser; a blue pin marks the target room in 2D and 3D. Also: Game Room recoloured to #3686FF and the Reception WELCOME rug removed | | `packages/shared/src/quests/errands.ts` (+ tests), `apps/web/hooks/use-errands.ts`, `apps/web/components/game-ui/errands.tsx`, `apps/web/components/phaser/scenes/errand-marker.ts`, `apps/web/components/game-ui/space-sidebar.tsx`, `apps/web/app/space/[spaceId]/page.tsx` |
| 2026-10-28 | Bigger Clario HQ (48 to 62 tiles wide) with a Tech Wing: Server Room, Maker Lab (3D printers, robot arm, electronics bench), Demo Stage (stage, podium, seating, opening onto the Lounge) and Hack Space (hack pods, VR station, HACK neon), drawn in 2D pixel art and in 3D. Three tech errands (server incident update, demo opening, 3D print request). Game Room fully blue (#3686FF), no confetti floor. 3D view: environment lighting, softer shadows, tuned materials and wood-grain floors | | `apps/web/lib/maps/clario-hq.ts`, `packages/shared/src/maps/map-templates.ts`, `packages/shared/src/quests/errands.ts`, `apps/web/components/phaser/scenes/clario-hq-builder.ts`, `apps/web/components/space-3d/office-scene.ts`, `apps/web/components/space-3d/office-3d.tsx` |
| 2026-10-28 | 3D view: realistic CC0 seating (Poly Haven leather sofa, wood-and-leather armchair and leather meeting chairs, Quaternius office chair), loaded alongside the Kenney models, which stay as the fallback if a file fails to load | | `apps/web/components/space-3d/office-scene.ts`, `apps/web/public/assets/3d/polyhaven/`, `apps/web/public/assets/3d/quaternius/OfficeChair.glb` |
| 2026-10-28 | 3D view only: 18 background coworkers sitting at desks, in two meetings (some talking with their hands, using the library's seated-talking clip), on the Lounge sofas, in the Kitchen, Library, Hack Space and a focus room. No name tags; each hides while a real person is on its seat | | `apps/web/components/space-3d/office-3d.tsx`, `apps/web/components/space-3d/people.ts`, `apps/web/public/assets/3d/quaternius/animations.json` |

## Third-party assets

- 3D furniture in the 3D view: [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit) by Kenney, CC0 (public domain). Licence file: `apps/web/public/assets/3d/kenney/License.txt`.
- [three.js](https://threejs.org) (MIT) renders the 3D view.
- People in the 3D view: [Universal Base Characters](https://quaternius.itch.io/universal-base-characters) (free Standard version) and four clips from the [Universal Animation Library](https://opengameart.org/content/universal-animation-library) (free Standard version), both by Quaternius, CC0 (public domain). Textures were shrunk and the clips cut out for the web; clothes are generated in code. Licence file: `apps/web/public/assets/3d/quaternius/License.txt`.
- Realistic seating in the 3D view, all CC0 (public domain): [Sofa 02](https://polyhaven.com/a/sofa_02), [Modern Arm Chair 01](https://polyhaven.com/a/modern_arm_chair_01) and [Dining Chair 02](https://polyhaven.com/a/dining_chair_02) from [Poly Haven](https://polyhaven.com/license) (1k glTF, unchanged; licence file `apps/web/public/assets/3d/polyhaven/License.txt`), and the [Office Chair](https://poly.pizza/m/UfKvrZBK6C) by Quaternius from Poly Pizza (unchanged; listed in `apps/web/public/assets/3d/quaternius/License.txt`).

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
- [ ] Optional: Practice Session, a mentor avatar answering questions by text or voice (Gemini or a local model)
