import { createMcpHandler } from "agents/mcp";

import {
  authorizeRequest,
  type McpAuthBindings,
} from "./auth";
import {
  createServer,
  type McpCoreBinding,
} from "./server";

export { authorizeRequest, isAllowlistedAgentIp } from "./auth";
export { createServer, type McpCoreBinding } from "./server";

export type Bindings = Omit<Cloudflare.Env, "CORE"> & McpAuthBindings & {
  CORE: McpCoreBinding;
};

function errorResponse(
  code: string,
  message: string,
  status: number,
): Response {
  return Response.json(
    {
      error: {
        code,
        message,
      },
    },
    {
      status,
      headers: {
        "cache-control": "private, no-store",
      },
    },
  );
}

export async function handleRequest(
  request: Request,
  env: Bindings,
  ctx?: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== "/mcp") {
    return errorResponse("NOT_FOUND", "未找到该 MCP 端点。", 404);
  }

  const authorization = await authorizeRequest(request, env);
  if (!authorization.authorized) {
    return errorResponse(
      authorization.code,
      authorization.message,
      403,
    );
  }
  if (!ctx) {
    return errorResponse(
      "EXECUTION_CONTEXT_MISSING",
      "Worker execution context 不可用。",
      500,
    );
  }

  const server = createServer(env.CORE);
  const response = await createMcpHandler(server, {
    route: "/mcp",
    authContext: {
      props: {
        authorizationMethod: authorization.method,
      },
    },
  })(request, env, ctx);

  const headers = new Headers(response.headers);
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  fetch(
    request: Request,
    env: Bindings,
    ctx: ExecutionContext,
  ): Promise<Response> {
    return handleRequest(request, env, ctx);
  },
} satisfies ExportedHandler<Bindings>;
