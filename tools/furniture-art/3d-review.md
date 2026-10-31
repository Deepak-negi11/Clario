# Office furniture in WebGL

The 3D furniture now follows the generated 2D seating designs in `source/`, using actual
rounded meshes rather than image billboards. The shared factory is
`apps/web/components/space-3d/seating.ts`.

Changes across the office:

- Auditorium: rounded upholstered backs and cushions, dark armrests, cup holders and fixed steel bases.
- Café and kitchen: oak frames, upholstered back pads and seats, tapered legs.
- Meeting rooms: curved upholstered shells in each room's fabric color, slender metal legs.
- Workstations: ergonomic mesh task chairs, lumbar support, casters and five-star bases; swivels remain independent.
- Lounges and reception: coordinated sofas, loveseats and armchairs with loose cushions, soft track arms and walnut feet.
- Beanbags: wider seat depressions, a settled base, subtle stitching and millimetre-scale fabric bump shading.
- Library and storage: matching walnut/silver bookcases with individual spines, stacks, plants and storage boxes.
- Corridor: silver vending cabinet, dark recessed display and blue header matching the generated asset.

Classic Office and Coworking Campus can now open the 3D view as well as Clario HQ and saved
team/custom offices. `template-office-3d.ts` takes wall tiles and floor regions from the live
2D scene and combines them with the existing item and room catalogs, including the older
lounges and campus pond seats. It does not change the saved map or server data.

Repeated static seating is instanced per geometry and material. Task chairs remain separate
for their swivel animation. Cached seating resources survive custom-layout rebuilds.
The WebGL renderer requests antialiasing and the high-performance GPU, caps pixel density,
uses 2048/4096 shadow maps according to view size, and reports a readable error if WebGL
cannot start.

Validation:

| Layout | Sections rendered and visually reviewed |
| --- | ---: |
| Clario HQ | 19 |
| Classic Office | 14 |
| Coworking Campus | 9 |
| Generated team office (25 people) | 9 |

All section views were rendered with the production scene builders in a temporary WebGL
review page. Contact sheets and selected full-size views are saved with this chat's visual
artifacts. The temporary review page is removed after verification.

Tests cover live wall/floor preservation, room and spawn data, lounge/pond seat positions,
instanced chair transforms, and keeping animated task chairs independent.
