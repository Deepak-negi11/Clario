# Office seating artwork

The four source sheets were created with the built-in `image_gen` tool. Exact prompts are
saved in `prompts.json`. They provide front, rear and side views of contemporary sofas,
armchairs, oak café chairs, mesh task chairs, upholstered meeting chairs and auditorium seats.

Run `node tools/furniture-art/build-atlas.mjs` from the repository root to rebuild the 21-view
transparent atlas in `apps/web/public/assets/custom/seating-v2/`. This crops the largest
connected sprite in each source cell and downsamples with premultiplied alpha. Sources stay
outside the public directory; the browser downloads only the small atlas and its frame data.

`apps/web/components/phaser/scenes/seating-art.ts` registers the existing texture keys, tints
neutral upholstery to the map's fabric selection, and preserves wood and metal. Rear sofas
and armchairs split at world row 16 to keep seated avatars between the seat and backrest.
Map item positions, collision footprints and seating coordinates are unchanged.

## Office props

`props-prompts.json` records the built-in `image_gen` prompts for the vending machine,
walnut/silver bookshelves and bicycle views. Their source sheets are in `source/` alongside
the seating. Run `node tools/furniture-art/build-props-atlas.mjs` to rebuild the nine-view
atlas in `apps/web/public/assets/custom/office-props-v2/`. The bicycle sheet devotes its left
half to the wide side profile, with the front and rear views in the right half.

`office-props-art.ts` installs the original texture keys at their original sizes. Orange and
teal bicycles share the same geometry, with only painted frame pixels recolored. Parked and
ridden bicycles use the same sprites; the fixed rack preview uses the same hub coordinates
as the interactive rack. The can drop is aligned and scaled to the new machine's pickup tray,
with the original offset and scale retained when the generated atlas is unavailable.
