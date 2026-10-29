import prisma from "@repo/db";
import { customMapSchema, parseCustomMap, type ServerMessage } from "@repo/shared";
import { requireAuth } from "../middleware/auth";
import { jsonMessage } from "../utils/http";
import { publishRoomEvent } from "../ws/pubsub";
import { broadcast } from "../ws/room-manager";
import { isCustomMapTemplate, layoutSaved } from "../ws/space-layout";

// The biggest layout the schema allows (80x60 tiles, 1500 items, 40 rooms) is about 150 KB of
// JSON; this leaves room for whitespace without letting anyone stream megabytes at us.
export const MAX_LAYOUT_BODY_BYTES = 256 * 1024;

// /api/v1/space/:spaceId/layout
function spaceIdFrom(req: Request) {
  return new URL(req.url).pathname.split("/")[4] ?? "";
}

type BodyResult = { ok: true; value: unknown } | { ok: false; status: number; message: string };

// Reads at most maxBytes, so a body without (or lying about) Content-Length is still capped.
async function readJsonBody(req: Request, maxBytes: number): Promise<BodyResult> {
  const tooLarge = { ok: false, status: 413, message: `Layout is too large (max ${maxBytes / 1024} KB)` } as const;
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return tooLarge;
  if (!req.body) return { ok: false, status: 400, message: "layout is required" };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return tooLarge;
    }
    chunks.push(value);
  }

  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(Buffer.concat(chunks))) };
  } catch {
    return { ok: false, status: 400, message: "Invalid JSON" };
  }
}

function canEditLayout(space: { creatorId: string; mapTemplate: string }, userId: string) {
  return space.creatorId === userId && isCustomMapTemplate(space.mapTemplate);
}

// GET /api/v1/space/:spaceId/layout -> { layout: CustomMap | null, canEdit: boolean }
export async function handleGetLayout(req: Request): Promise<Response> {
  const auth = requireAuth(req);
  if (auth instanceof Response) return auth;

  const space = await prisma.space.findUnique({
    where: { id: spaceIdFrom(req) },
    select: { creatorId: true, mapTemplate: true, layout: true },
  });
  if (!space) return jsonMessage("Space not found", 404);

  return Response.json({
    layout: parseCustomMap(space.layout),
    canEdit: canEditLayout(space, auth.userId),
  });
}

// PUT /api/v1/space/:spaceId/layout, body { layout } -> { ok: true }
export async function handleSaveLayout(req: Request): Promise<Response> {
  const auth = requireAuth(req);
  if (auth instanceof Response) return auth;

  const spaceId = spaceIdFrom(req);
  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    select: { creatorId: true, mapTemplate: true },
  });
  if (!space) return jsonMessage("Space not found", 404);
  if (space.creatorId !== auth.userId) return jsonMessage("Only the space's owner can change its layout", 403);
  if (!isCustomMapTemplate(space.mapTemplate)) return jsonMessage("Only custom-office spaces have an editable layout");

  const body = await readJsonBody(req, MAX_LAYOUT_BODY_BYTES);
  if (!body.ok) return jsonMessage(body.message, body.status);

  const raw = body.value && typeof body.value === "object" ? (body.value as { layout?: unknown }).layout : undefined;
  const parsed = customMapSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((issue) => (issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message));
    return Response.json({ message: `Invalid layout: ${issues.join("; ")}`, issues }, { status: 400 });
  }

  // Unknown keys are already stripped by the schema, so this is exactly what was validated.
  const layout = parsed.data;
  const saved = await prisma.space.updateMany({
    where: { id: spaceId, creatorId: auth.userId },
    data: { layout, width: layout.cols, height: layout.rows },
  });
  if (saved.count === 0) return jsonMessage("Space not found", 404);

  layoutSaved(spaceId, layout);
  const message: ServerMessage = { type: "layout-updated", payload: { layout } };
  broadcast(spaceId, "", message);
  try {
    await publishRoomEvent(spaceId, "", message);
  } catch (error) {
    // The layout is saved and people on this server have it; others get it when they reload.
    console.error(`[layout] could not tell other servers about space ${spaceId}:`, error);
  }

  return Response.json({ ok: true });
}
