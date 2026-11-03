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
  handleGetProfile,
} from "./src/user/user";
import { handleGetFreeAi, handleUseFreeAi } from "./src/user/free-ai";
import {
  handleCreateSpace,
  handleDeleteSpace,
  handleListSpaces,
  handleGetSpace,
  handleAddElement,
  handleListElements,
  handleGetMessages,
} from "./src/space/space";
import { handleGetLayout, handleSaveLayout } from "./src/space/layout";
import { handleGetProject, handleSaveProject } from "./src/space/project";
import {
  makeSocketData,
  onMessage,
  onClose,
  startPresenceRenewal,
  stopPresenceRenewal,
} from "./src/ws/ws-handler";
import type { SocketData } from "./src/ws/room-manager";
import { stopAllRoomEventSubscriptions } from "./src/ws/pubsub";
import { handleAgentActivity } from "./src/agent/agent-activity";
import { handleAgentKeyStatus, handleCreateAgentKey } from "./src/agent/agent-key";
import { allowedOrigin, jwtSecret, requestBudget } from "./src/utils/security";
import type { Server } from "bun";
import { handleSendEmail } from "./src/email/email";
import {
  handleListTasks,
  handleCreateTask,
  handleUpdateTaskStatus,
  handleDeleteTask,
} from "./src/task/task";

let activeServers = 0;



type RouteHandler = (req: Request) => Response | Promise<Response>;



function getCorsHeaders(origin: string | null) {
  return {
    ...(allowedOrigin(origin) && origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
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
  jwtSecret(); // Enforced for every entry point, including direct imports of startServer.
  activeServers += 1;
  startPresenceRenewal();
  const authBudget = requestBudget(60, 60_000);
  const limitedAuth = (handler: RouteHandler) => {
    const run = withCors(handler);
    return async (req: Request, instance: Server<SocketData>) => {
      // Forwarded headers are caller-controlled unless an operator explicitly trusts a proxy.
      const ip = process.env.TRUST_PROXY === "true"
        ? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || instance.requestIP(req)?.address || "unknown"
        : instance.requestIP(req)?.address || "unknown";
      const retry = authBudget(`${new URL(req.url).pathname}:${ip}`);
      if (retry) return withCorsResponse(Response.json({ message: "Too many attempts. Try again shortly." },
        { status: 429, headers: { "Retry-After": String(retry) } }), req.headers.get("origin"));
      return run(req);
    };
  };

  const server = Bun.serve({
    port,
    maxRequestBodySize: 1024 * 1024,
    error() {
      return Response.json({ message: "Something went wrong. Try again." }, { status: 500, headers: { "X-Content-Type-Options": "nosniff" } });
    },
    routes: {

      "/health": { GET: () => Response.json({ status: "ok" }) },


      "/api/v1/signup": { POST: limitedAuth(handleSignup), OPTIONS: handleCorsPreflight },
      "/api/v1/signin": { POST: limitedAuth(handleSignin), OPTIONS: handleCorsPreflight },


      "/api/v1/user/metadata": {
        POST: withCors(handleUpdateMetadata),
        OPTIONS: handleCorsPreflight,
      },
      "/api/v1/user/profile": {
        GET: withCors(handleGetProfile),
        POST: withCors(handleUpdateProfile),
        OPTIONS: handleCorsPreflight,
      },
      "/api/v1/user/free-ai": {
        GET: withCors(handleGetFreeAi),
        POST: withCors(handleUseFreeAi),
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
      "/api/v1/space/:spaceId/layout": {
        GET: withCors(handleGetLayout),
        PUT: withCors(handleSaveLayout),
        OPTIONS: handleCorsPreflight,
      },
      "/api/v1/space/:spaceId/project": {
        GET: withCors(handleGetProject),
        PUT: withCors(handleSaveProject),
        OPTIONS: handleCorsPreflight,
      },
      "/api/v1/space/:spaceId/messages": {
        GET: withCors(handleGetMessages),
        OPTIONS: handleCorsPreflight,
      },
      "/api/v1/space/:spaceId/tasks": {
        GET: withCors(handleListTasks),
        POST: withCors(handleCreateTask),
        OPTIONS: handleCorsPreflight,
      },
      "/api/v1/space/:spaceId/tasks/:taskId": {
        DELETE: withCors(handleDeleteTask),
        OPTIONS: handleCorsPreflight,
      },
      "/api/v1/space/:spaceId/tasks/:taskId/status": {
        POST: withCors(handleUpdateTaskStatus),
        OPTIONS: handleCorsPreflight,
      },
      "/api/v1/space/:spaceId/email": {
        POST: withCors(handleSendEmail),
        OPTIONS: handleCorsPreflight,
      },
      "/api/v1/elements": { GET: withCors(handleListElements), OPTIONS: handleCorsPreflight },

      "/api/v1/agent-activity": {
        POST: withCors(handleAgentActivity),
        OPTIONS: handleCorsPreflight,
      },
      "/api/v1/agent-key": {
        GET: withCors(handleAgentKeyStatus),
        POST: withCors(handleCreateAgentKey),
        OPTIONS: handleCorsPreflight,
      },
    },
    fetch(req, server) {

      if (new URL(req.url).pathname === "/ws") {
        const origin = req.headers.get("origin");
        if (origin && !allowedOrigin(origin)) return new Response("Origin not allowed", { status: 403 });
        const ok = server.upgrade(req, { data: makeSocketData() });
        if (ok) return;
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return withCorsResponse(new Response("Not Found", { status: 404 }), req.headers.get("origin"));
    },
    websocket: {
      maxPayloadLength: 64 * 1024,
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
        stopPresenceRenewal();
        void stopAllRoomEventSubscriptions();
      }
    }

    return stopServer(closeActiveConnections);
  }) as typeof server.stop;

  return server;
}
