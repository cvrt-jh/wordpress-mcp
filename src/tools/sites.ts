/**
 * The list_sites tool. Returns the configured site ids (and urls) so the caller
 * knows which value to pass as the mandatory `site` argument on every other
 * tool. Never returns credentials.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listSites } from "../sites.js";
import { jsonResult } from "../types.js";

export function register(server: McpServer) {
  server.tool(
    "list_sites",
    "List the WordPress sites this server can manage. Every other tool requires a `site` argument set to one of these ids.",
    {},
    async () => jsonResult({ sites: listSites() }),
  );
}
