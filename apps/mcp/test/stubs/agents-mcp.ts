export function createMcpHandler(): () => Promise<Response> {
  return async () =>
    new Response("The HTTP MCP adapter is covered by a local workerd smoke test.", {
      status: 501,
    });
}
