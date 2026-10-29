import prisma from "@repo/db";
import {
  CUSTOM_MAP_TEMPLATE,
  customRoomAt,
  getChatRoomAtPosition,
  getMapTemplate,
  parseCustomMap,
  type ChatRoomZone,
  type CustomMap,
} from "@repo/shared";

// What the server needs to know about a space's map: its template, plus the saved layout when
// the template is "custom-office". Every other template has layout null and behaves as before.
export type SpaceMap = {
  mapTemplate: string | null | undefined;
  layout: CustomMap | null;
};

type Position = { x: number; y: number };

// Parsed layouts of custom-office spaces that have people on this server. Filled when someone
// joins, replaced when the owner saves, dropped when the last person leaves (forgetSpaceLayout).
const layouts = new Map<string, CustomMap | null>();
const loading = new Map<string, Promise<CustomMap | null>>();

export function isCustomMapTemplate(mapTemplate: unknown) {
  return mapTemplate === CUSTOM_MAP_TEMPLATE;
}

async function readLayout(spaceId: string) {
  const space = await prisma.space.findUnique({ where: { id: spaceId }, select: { layout: true } });
  return parseCustomMap(space?.layout);
}

// `remember: false` is for HTTP routes: they use the cached copy if there is one but don't add
// one, since the person asking may not be in the space on this server.
async function loadLayout(spaceId: string, remember: boolean): Promise<CustomMap | null> {
  if (layouts.has(spaceId)) return layouts.get(spaceId) ?? null;
  if (!remember) return readLayout(spaceId);

  let pending = loading.get(spaceId);
  if (!pending) {
    pending = readLayout(spaceId)
      .then((layout) => {
        // A save that landed while this read was in flight wins over what the read saw.
        if (!layouts.has(spaceId)) layouts.set(spaceId, layout);
        return layouts.get(spaceId) ?? null;
      })
      .finally(() => loading.delete(spaceId));
    loading.set(spaceId, pending);
  }
  return pending;
}

export async function loadSpaceMap(
  spaceId: string,
  mapTemplate: string | null | undefined,
  options: { remember?: boolean } = {},
): Promise<SpaceMap> {
  if (!isCustomMapTemplate(mapTemplate)) return { mapTemplate, layout: null };
  return { mapTemplate, layout: await loadLayout(spaceId, options.remember ?? true) };
}

// For code that can't wait (the pub/sub listener). Without a cached layout nobody from that
// space is on this server, so there is nobody to filter anyway.
export function cachedSpaceMap(spaceId: string, mapTemplate: string | null | undefined): SpaceMap {
  return { mapTemplate, layout: isCustomMapTemplate(mapTemplate) ? layouts.get(spaceId) ?? null : null };
}

// The owner saved a new layout (here or on another server). Only spaces this server is already
// tracking are updated; anyone joining later reads the saved layout from the database.
export function layoutSaved(spaceId: string, layout: CustomMap) {
  if (layouts.has(spaceId) || loading.has(spaceId)) layouts.set(spaceId, layout);
}

export function forgetSpaceLayout(spaceId: string) {
  layouts.delete(spaceId);
}

export function mapSpawn(map: SpaceMap): Position {
  return map.layout?.spawn ?? getMapTemplate(map.mapTemplate).spawn;
}

export function mapSize(map: SpaceMap): { width: number; height: number } {
  return map.layout
    ? { width: map.layout.cols, height: map.layout.rows }
    : getMapTemplate(map.mapTemplate).dimensions;
}

export function isInsideMap(map: SpaceMap, position: Position) {
  const { width, height } = mapSize(map);
  return position.x >= 0 && position.y >= 0 && position.x < width && position.y < height;
}

// The chat room someone standing at `position` is in. A custom-office space with no saved
// layout falls through to the template, which has no rooms.
export function mapRoomAt(map: SpaceMap, position: Position): ChatRoomZone | null {
  return map.layout ? customRoomAt(map.layout, position) : getChatRoomAtPosition(map.mapTemplate, position);
}
