import { handleSignup } from "./src/auth/signup";
import { handleSignin } from "./src/auth/signin";
import {
  handleCreateElement,
  handleCreateAvatar,
  handleCreateMap,
} from "./src/admin/admin";
import {
  handleUpdateMetadata,
  handleBulkMetadata,
  handleGetAvatars,
  handleUpdateProfile,
} from "./src/user/user";
import {
  handleCreateSpace,
  handleDeleteSpace,
  handleListSpaces,
  handleGetSpace,
  handleAddElement,
  handleListElements,
  handleGetMessages,
} from "./src/space/space";
import { makeSocketData, onMessage, onClose } from "./src/ws/ws-handler";
import type { SocketData } from "./src/ws/room-manager";
import { stopAllRoomEventSubscriptions } from "./src/ws/pubsub";
import { handleAgentActivity } from "./src/agent/agent-activity";

let activeServers = 0;



type RouteHandler = (req: Request) => Response | Promise<Response>;



function getCorsHeaders(origin: string | null) {
  const configuredOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const fallbackOrigin = configuredOrigins[0] ?? "http://localhost:3000";
  const isLocalDevelopmentOrigin = origin && /^https?:\/\/localhost(:\d+)?$/.test(origin);
  const activeOrigin = origin && (isLocalDevelopmentOrigin || configuredOrigins.includes(origin))
    ? origin
    : fallbackOrigin;

  return {
    "Access-Control-Allow-Origin": activeOrigin,
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Vary": "Origin",
  };
}

function withCorsResponse(response: Response, origin: string | null) {
  const headers = new Headers(response.headers);

  for (const [key, value] of Object.entries(getCorsHeaders(origin))) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function handleCorsPreflight(req: Request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(req.headers.get("origin")),
  });
}

function withCors(handler: RouteHandler) {
  return async (req: Request) => withCorsResponse(await handler(req), req.headers.get("origin"));
}

export function startServer(port: number) {
  activeServers += 1;

  const server = Bun.serve({
    port,
    routes: {

      "/health": { GET: () => Response.json({ status: "ok" }) },


      "/api/v1/signup": { POST: withCors(handleSignup), OPTIONS: handleCorsPreflight },
      "/api/v1/signin": { POST: withCors(handleSignin), OPTIONS: handleCorsPreflight },


      "/api/v1/user/metadata": {
        POST: withCors(handleUpdateMetadata),
        OPTIONS: handleCorsPreflight,
      },
      "/api/v1/user/profile": {
        POST: withCors(handleUpdateProfile),
        OPTIONS: handleCorsPreflight,
      },
      "/api/v1/user/metadata/bulk": {
        GET: withCors(handleBulkMetadata),
        OPTIONS: handleCorsPreflight,
      },
      "/api/v1/avatars": { GET: withCors(handleGetAvatars), OPTIONS: handleCorsPreflight },


      "/api/v1/admin/element": {
        POST: withCors(handleCreateElement),
        OPTIONS: handleCorsPreflight,
      },
      "/api/v1/admin/avatar": {
        POST: withCors(handleCreateAvatar),
        OPTIONS: handleCorsPreflight,
      },
      "/api/v1/admin/map": { POST: withCors(handleCreateMap), OPTIONS: handleCorsPreflight },


      "/api/v1/space": { POST: withCors(handleCreateSpace), OPTIONS: handleCorsPreflight },
      "/api/v1/space/all": { GET: withCors(handleListSpaces), OPTIONS: handleCorsPreflight },
      "/api/v1/space/element": {
        POST: withCors(handleAddElement),
        OPTIONS: handleCorsPreflight,
      },
      "/api/v1/space/:spaceId": {
        GET: withCors(handleGetSpace),
        DELETE: withCors(handleDeleteSpace),
        OPTIONS: handleCorsPreflight,
      },
      "/api/v1/space/:spaceId/messages": {
        GET: withCors(handleGetMessages),
        OPTIONS: handleCorsPreflight,
      },
      "/api/v1/elements": { GET: withCors(handleListElements), OPTIONS: handleCorsPreflight },

      "/api/v1/agent-activity": {
        POST: withCors(handleAgentActivity),
        OPTIONS: handleCorsPreflight,
      },
    },
    fetch(req, server) {

      if (new URL(req.url).pathname === "/ws") {
        const ok = server.upgrade(req, { data: makeSocketData() });
        if (ok) return;
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return withCorsResponse(new Response("Not Found", { status: 404 }), req.headers.get("origin"));
    },
    websocket: {
      message: onMessage,
      close: onClose,
    },
  });

  const stopServer = server.stop.bind(server);
  let stopped = false;

  server.stop = ((closeActiveConnections?: boolean) => {
    if (!stopped) {
      stopped = true;
      activeServers -= 1;

      if (activeServers === 0) {
        void stopAllRoomEventSubscriptions();
      }
    }

    return stopServer(closeActiveConnections);
  }) as typeof server.stop;

  return server;
}
