export const MAP_TEMPLATE_IDS = ["classic-office", "coworking-campus", "clario-hq"] as const;

export type MapTemplateId = (typeof MAP_TEMPLATE_IDS)[number];

export type ChatRoomZone = {
  id: string;
  name: string;
  bounds: { x: number; y: number; width: number; height: number };
  // Optional tile for the room's name sign; otherwise the map finds a clear spot.
  sign?: { x: number; y: number };
};

export type MapTemplateDefinition = {
  id: MapTemplateId;
  name: string;
  description: string;
  dimensions: { width: number; height: number };
  spawn: { x: number; y: number };
  thumbnail: string;
  chatRooms: ChatRoomZone[];
};

export const DEFAULT_MAP_TEMPLATE: MapTemplateId = "classic-office";

export const MAP_TEMPLATES: Record<MapTemplateId, MapTemplateDefinition> = {
  "classic-office": {
    id: "classic-office",
    name: "Classic Office",
    description: "Private offices, meeting rooms, a lounge, café, and game corner.",
    dimensions: { width: 44, height: 34 },
    spawn: { x: 19, y: 27 },
    thumbnail: "/assets/maps/classic-office-v2.png",
    chatRooms: [
      { id: "atlas-room", name: "Office 1", bounds: { x: 4, y: 3, width: 6, height: 6 } },
      { id: "cedar-room", name: "Office 2", bounds: { x: 4, y: 10, width: 6, height: 6 } },
      { id: "harbor-room", name: "Office 3", bounds: { x: 4, y: 17, width: 6, height: 6 } },
      { id: "orbit-room", name: "Office 6", bounds: { x: 34, y: 3, width: 6, height: 6 } },
      { id: "nova-room", name: "Office 7", bounds: { x: 34, y: 10, width: 6, height: 6 } },
      { id: "willow-room", name: "Office 8", bounds: { x: 34, y: 17, width: 6, height: 6 } },
      { id: "canvas-studio", name: "Office 4", bounds: { x: 12, y: 3, width: 7, height: 6 } },
      { id: "pixel-lab", name: "Office 5", bounds: { x: 24, y: 3, width: 7, height: 6 } },
      { id: "coffee-nook", name: "Coffee Corner", bounds: { x: 20, y: 3, width: 3, height: 6 } },
      { id: "summit-room", name: "Meeting Room", bounds: { x: 13, y: 12, width: 7, height: 7 } },
      { id: "commons", name: "Lounge", bounds: { x: 22, y: 11, width: 10, height: 8 } },
      { id: "workshop", name: "Work Area", bounds: { x: 12, y: 21, width: 10, height: 6 } },
      { id: "hearth-kitchen", name: "Kitchen", bounds: { x: 4, y: 24, width: 6, height: 5 } },
      { id: "arcade", name: "Game Room", bounds: { x: 34, y: 24, width: 6, height: 5 }, sign: { x: 34, y: 26 } },
    ],
  },
  "coworking-campus": {
    id: "coworking-campus",
    name: "Coworking Campus",
    description: "Team desk pods, colorful lounges, meeting rooms, café, and pond courtyard.",
    dimensions: { width: 52, height: 38 },
    spawn: { x: 25, y: 33 },
    thumbnail: "/assets/maps/coworking-campus-v2.png",
    chatRooms: [
      { id: "sequoia-suite", name: "Conference Room", bounds: { x: 4, y: 9, width: 11, height: 8 } },
      { id: "aurora-suite", name: "Meeting Room", bounds: { x: 37, y: 9, width: 11, height: 8 } },
      { id: "lantern-cafe", name: "Café", bounds: { x: 16, y: 9, width: 20, height: 8 }, sign: { x: 21, y: 9 } },
      { id: "foundry", name: "Work Area 1", bounds: { x: 4, y: 18, width: 16, height: 10 } },
      { id: "garden-lounge", name: "Lounge", bounds: { x: 21, y: 18, width: 10, height: 10 } },
      { id: "lookout", name: "Work Area 2", bounds: { x: 32, y: 18, width: 16, height: 10 } },
      { id: "maple-cafe", name: "Kitchen", bounds: { x: 4, y: 29, width: 13, height: 5 } },
      { id: "pond-pavilion", name: "Reception", bounds: { x: 18, y: 29, width: 16, height: 5 } },
      { id: "sunrise-cafe", name: "Game Room", bounds: { x: 35, y: 29, width: 13, height: 5 } },
    ],
  },
  "clario-hq": {
    id: "clario-hq",
    name: "Clario HQ",
    description: "A full office with meeting rooms, desks, a kitchen, library, game room, a tech wing with a server room, maker lab, demo stage and hack space, and a 3D view.",
    dimensions: { width: 62, height: 36 },
    spawn: { x: 23, y: 29 },
    thumbnail: "/assets/maps/clario-hq.png",
    chatRooms: [
      { id: "hq-meeting-1", name: "Meeting Room 1", bounds: { x: 3, y: 4, width: 11, height: 8 } },
      { id: "hq-focus-1", name: "Focus Room 1", bounds: { x: 15, y: 4, width: 6, height: 8 } },
      { id: "hq-focus-2", name: "Focus Room 2", bounds: { x: 22, y: 4, width: 6, height: 8 } },
      { id: "hq-meeting-2", name: "Meeting Room 2", bounds: { x: 29, y: 4, width: 8, height: 8 } },
      { id: "hq-kitchen", name: "Kitchen", bounds: { x: 38, y: 4, width: 7, height: 8 } },
      // The open commons between these two (x 20-27) belongs to no room, like the corridors.
      { id: "hq-desks", name: "Open Desks", bounds: { x: 3, y: 15, width: 17, height: 8 } },
      { id: "hq-lounge", name: "Lounge", bounds: { x: 28, y: 15, width: 17, height: 8 } },
      { id: "hq-library", name: "Library", bounds: { x: 3, y: 26, width: 12, height: 6 } },
      { id: "hq-reception", name: "Reception", bounds: { x: 16, y: 25, width: 16, height: 7 } },
      { id: "hq-game-room", name: "Game Room", bounds: { x: 33, y: 26, width: 12, height: 6 }, sign: { x: 36, y: 31 } },
      // Tech Wing
      { id: "hq-server", name: "Server Room", bounds: { x: 46, y: 4, width: 6, height: 8 } },
      { id: "hq-maker", name: "Maker Lab", bounds: { x: 53, y: 4, width: 6, height: 8 } },
      { id: "hq-demo", name: "Demo Stage", bounds: { x: 46, y: 15, width: 13, height: 8 } },
      { id: "hq-hack", name: "Hack Space", bounds: { x: 46, y: 26, width: 13, height: 6 } },
    ],
  },
};

export function isMapTemplateId(value: unknown): value is MapTemplateId {
  return typeof value === "string" && MAP_TEMPLATE_IDS.includes(value as MapTemplateId);
}

export function getMapTemplate(value: unknown): MapTemplateDefinition {
  return MAP_TEMPLATES[isMapTemplateId(value) ? value : DEFAULT_MAP_TEMPLATE];
}

export function getChatRoomAtPosition(
  templateId: unknown,
  position: { x: number; y: number },
): ChatRoomZone | null {
  const template = getMapTemplate(templateId);
  return template.chatRooms.find(({ bounds }) => (
    position.x >= bounds.x
    && position.y >= bounds.y
    && position.x < bounds.x + bounds.width
    && position.y < bounds.y + bounds.height
  )) ?? null;
}

export function getChatRoom(templateId: unknown, roomId: string): ChatRoomZone | null {
  return getMapTemplate(templateId).chatRooms.find((room) => room.id === roomId) ?? null;
}
