import prisma from "@repo/db";
import { getUserPosition } from "../ws/presence";
import { loadSpaceMap, mapRoomAt } from "../ws/space-layout";
import {
  CUSTOM_MAP_TEMPLATE,
  createStarterMap,
  DEFAULT_MAP_TEMPLATE,
  generateTeamOffice,
  getMapTemplate,
  isMapTemplateId,
  TEAM_OFFICE_THUMBNAIL,
  TEAM_SIZE_RANGE,
  type MapTemplateId,
} from "@repo/shared";
import { requireAuth } from "../middleware/auth";
import { formatDimensions, parseDimensions } from "../utils/dimensions";
import { jsonMessage } from "../utils/http";



type CreateSpaceBody = {
  name?: string;
  dimensions?: string;
  mapId?: string;
  mapTemplate?: MapTemplateId;
  // With "custom-office": lay the office out for this many people instead of the empty plot.
  teamSize?: unknown;
};

type AddElementBody = {
  elementId?: string;
  spaceId?: string;
  x?: unknown;
  y?: unknown;
};


export async function handleCreateSpace(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const body = (await req.json().catch(() => null)) as CreateSpaceBody | null;
  const { name, dimensions, mapId, mapTemplate, teamSize } = body ?? {};
  const normalizedName = name?.trim();

  if (!normalizedName || !dimensions) {
    return jsonMessage("name and dimensions are required");
  }

  if (mapTemplate !== undefined && !isMapTemplateId(mapTemplate)) {
    return jsonMessage("Invalid map template");
  }

  if (teamSize !== undefined && (typeof teamSize !== "number" || !Number.isInteger(teamSize)
    || teamSize < TEAM_SIZE_RANGE.min || teamSize > TEAM_SIZE_RANGE.max)) {
    return jsonMessage(`teamSize must be a whole number from ${TEAM_SIZE_RANGE.min} to ${TEAM_SIZE_RANGE.max}`);
  }

  const templateId = mapTemplate ?? DEFAULT_MAP_TEMPLATE;
  const template = getMapTemplate(templateId);
  const requestedSize = parseDimensions(dimensions);
  if (!requestedSize) {
    return jsonMessage("Invalid dimension");
  }

  // A "custom-office" space starts from the starter plot, or from an office laid out for the
  // team when a team size is given. Its size follows its layout.
  const teamOffice = templateId === CUSTOM_MAP_TEMPLATE && typeof teamSize === "number";
  const layout = templateId !== CUSTOM_MAP_TEMPLATE ? null : teamOffice ? generateTeamOffice(teamSize) : createStarterMap();

  if (!mapId) {
    const space = await prisma.space.create({
      data: {
        name: normalizedName,
        width: layout ? layout.cols : mapTemplate ? template.dimensions.width : requestedSize.width,
        height: layout ? layout.rows : mapTemplate ? template.dimensions.height : requestedSize.height,
        creatorId: auth.userId,
        mapTemplate: templateId,
        thumbnail: teamOffice ? TEAM_OFFICE_THUMBNAIL : mapTemplate ? template.thumbnail : null,
        ...(layout ? { layout } : {}),
      },
    });

    return Response.json({ spaceId: space.id });
  }

  const map = await prisma.map.findUnique({
    where: { id: mapId },
    include: { mapElements: true },
  });

  if (!map) {
    return jsonMessage("Map not found");
  }








  const defaultElements = map.mapElements
    .filter((element) => element.elementId && element.x !== null && element.y !== null)
    .map((element) => ({
      elementId: element.elementId!,
      x: element.x!,
      y: element.y!,
    }));

  const space = await prisma.space.create({
    data: {
      name: normalizedName,
      width: layout ? layout.cols : map.width,
      height: layout ? layout.rows : map.height,
      creatorId: auth.userId,
      mapId: map.id,
      mapTemplate: templateId,
      ...(layout ? { layout } : {}),
      elements: {
        create: defaultElements,
      },
    },
  });

  return Response.json({ spaceId: space.id });
}


export async function handleDeleteSpace(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const spaceId = new URL(req.url).pathname.split("/").pop() ?? "";
  const space = await prisma.space.findUnique({
    where: { id: spaceId },
  });

  if (!space) {
    return jsonMessage("Space not found");
  }

  if (space.creatorId !== auth.userId) {
    return jsonMessage("Not your space", 403);
  }

  await prisma.space.delete({ where: { id: spaceId } });
  return Response.json({ message: "Space deleted" });
}

export async function handleListSpaces(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const spaces = await prisma.space.findMany({
    where: { creatorId: auth.userId },
  });

  return Response.json({
    spaces: spaces.map((space) => ({
      id: space.id,
      name: space.name,
      dimensions: formatDimensions(space),
      thumbnail: space.thumbnail,
      mapTemplate: space.mapTemplate,
    })),
  });
}

export async function handleGetSpace(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const spaceId = new URL(req.url).pathname.split("/").pop() ?? "";
  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    include: { elements: { include: { element: true } } },
  });

  if (!space) {
    return jsonMessage("Space not found");
  }

  return Response.json({
    name: space.name,
    dimensions: formatDimensions(space),
    mapTemplate: space.mapTemplate,
    thumbnail: space.thumbnail,
    elements: space.elements.map((spaceElement) => ({
      id: spaceElement.id,
      element: {
        id: spaceElement.element.id,
        imageUrl: spaceElement.element.imageUrl,
        width: spaceElement.element.width,
        height: spaceElement.element.height,
        static: spaceElement.element.static,
      },
      x: spaceElement.x,
      y: spaceElement.y,
    })),
  });
}

export async function handleAddElement(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const body = (await req.json().catch(() => null)) as AddElementBody | null;
  const { elementId, spaceId, x, y } = body ?? {};

  if (!elementId || !spaceId || typeof x !== "number" || typeof y !== "number") {
    return jsonMessage("Invalid request");
  }

  const space = await prisma.space.findUnique({ where: { id: spaceId } });
  if (!space) {
    return jsonMessage("Space not found");
  }

  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    return jsonMessage("Coordinates must be integers");
  }

  if (x < 0 || y < 0 || x >= space.width || y >= space.height) {
    return jsonMessage("Out of bounds");
  }

  if (space.creatorId !== auth.userId) {
    return jsonMessage("Not your space", 403);
  }

  const element = await prisma.elements.findUnique({ where: { id: elementId } });
  if (!element) {
    return jsonMessage("Element not found");
  }

  if (x + element.width > space.width || y + element.height > space.height) {
    return jsonMessage("Element does not fit in space");
  }

  await prisma.spaceElements.create({
    data: { elementId, spaceId, x, y },
  });

  return Response.json({ message: "Element added" });
}

export async function handleListElements(_req: Request): Promise<Response> {
  const elements = await prisma.elements.findMany();

  return Response.json({
    elements: elements.map((element) => ({
      id: element.id,
      imageUrl: element.imageUrl,
      width: element.width,
      height: element.height,
      static: element.static,
    })),
  });
}



export async function handleGetMessages(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;



  const parts = new URL(req.url).pathname.split("/");
  const spaceId = parts[parts.length - 2] ?? "";

  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    select: { id: true, mapTemplate: true },
  });
  if (!space) {
    return jsonMessage("Space not found");
  }

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") === "room" ? "room" : "general";
  const requestedRoomId = url.searchParams.get("roomId");
  let roomId: string | null = null;
  let roomName: string | undefined;

  if (scope === "room") {
    const position = await getUserPosition(spaceId, auth.userId);
    const currentRoom = position
      ? mapRoomAt(await loadSpaceMap(spaceId, space.mapTemplate, { remember: false }), position)
      : null;
    if (!currentRoom || currentRoom.id !== requestedRoomId) {
      return jsonMessage("Enter this room to view its chat", 403);
    }
    roomId = currentRoom.id;
    roomName = currentRoom.name;
  }

  const rows = await prisma.chatMessage.findMany({
    where: {
      spaceId,
      scope: scope === "room" ? "Room" : "General",
      roomId,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const messages = rows
    .reverse()
    .map((message) => ({
      id: message.id,
      userId: message.userId,
      text: message.text,
      at: message.createdAt.getTime(),
      scope,
      roomId: message.roomId ?? undefined,
      roomName,
    }));

  return Response.json({ messages });
}
