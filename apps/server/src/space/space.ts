import prisma from "@repo/db";
import { getChatRoom, getChatRoomAtPosition } from "@repo/shared";
import { getUserPosition } from "../ws/presence";
import {
  DEFAULT_MAP_TEMPLATE,
  getMapTemplate,
  isMapTemplateId,
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
  const { name, dimensions, mapId, mapTemplate } = body ?? {};
  const normalizedName = name?.trim();

  if (!normalizedName || !dimensions) {
    return jsonMessage("name and dimensions are required");
  }

  if (mapTemplate !== undefined && !isMapTemplateId(mapTemplate)) {
    return jsonMessage("Invalid map template");
  }

  const templateId = mapTemplate ?? DEFAULT_MAP_TEMPLATE;
  const template = getMapTemplate(templateId);
  const requestedSize = parseDimensions(dimensions);
  if (!requestedSize) {
    return jsonMessage("Invalid dimension");
  }

  if (!mapId) {
    const space = await prisma.space.create({
      data: {
        name: normalizedName,
        width: mapTemplate ? template.dimensions.width : requestedSize.width,
        height: mapTemplate ? template.dimensions.height : requestedSize.height,
        creatorId: auth.userId,
        mapTemplate: templateId,
        thumbnail: mapTemplate ? template.thumbnail : null,
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
      width: map.width,
      height: map.height,
      creatorId: auth.userId,
      mapId: map.id,
      mapTemplate: templateId,
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
      ? getChatRoomAtPosition(space.mapTemplate, position)
      : null;
    if (!currentRoom || currentRoom.id !== requestedRoomId) {
      return jsonMessage("Enter this room to view its chat", 403);
    }
    const room = getChatRoom(space.mapTemplate, currentRoom.id);
    roomId = currentRoom.id;
    roomName = room?.name;
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
