# Agent companions

The cards, setup choices and Phaser map share the local SVG artwork in
`apps/web/public/assets/agents`. Three.js uses small native meshes for the same
three identities, with the transparent Codex pet on a camera-facing mesh. Missing legacy identities still mean Claude Code; unrecognized
identities use a neutral coding-agent badge. Incoming activity cannot choose an
arbitrary image URL.

- Claude: original Clawd-inspired terracotta companion, with short staggered legs,
  narrow eyes, subtle depth and a quiet working animation.
- Codex: the blue robot pet from the user's supplied screenshot, isolated and
  reconstructed on transparency using the built-in imagegen tool. This is a
  reference-based generated asset, not a claim of an official mascot download.
  The full image is `output/imagegen/codex-pet.png`; the web asset is
  `apps/web/public/assets/agents/codex-pet.png`. The prompt is saved beside the
  full image as `codex-pet-prompt.txt`.
- Cursor: the unmodified official 2.5D cube inside an original floating treatment.
  The 3D companion extrudes the same official SVG facets, including the white arrow
  and dark triangular surfaces.

Rebuild the eight idle/working SVG files from the repository root:

```sh
bun tools/agent-art/build.mjs
bun test apps/web/lib/agents/identity.test.ts
```

The SVG animation and map hover respect the system's reduced-motion preference.
Idle cards describe standby; map companions appear only for active work. Clicking an emblem plays a local wave, lift or left-to-right swing; hover responds to the pointer.
Keyboard focus and Enter/Space work on the card emblem. Clicking a map companion
also opens its owner's activity card. These reactions send no messages and start no tasks.
Switching
providers during a task replaces the companion and disposes the old 3D model.

## References and attribution

Cursor cube: [Cursor brand assets](https://cursor.com/brand), downloaded from its
linked brand archive, `General Logos/Cube/SVG/CUBE_25D.svg`. The original is retained
as `cursor-mark.svg` and embedded without external requests in the generated SVGs.
The Cursor mark belongs to Anysphere.

Other identity references: [Claude Code](https://code.claude.com/docs/en/overview)
and [OpenAI Codex](https://openai.com/codex/). The Clawd and Cursor companion treatments do not imply
endorsement by these providers.
