/**
 * Extended plugin tools using mcp-endpoints plugin
 * Requires: mcp-endpoints WordPress plugin
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wpGet, wpPost } from "../client.js";
import { jsonResult } from "../types.js";

export function register(server: McpServer) {
  // Search WordPress.org plugins
  server.tool(
    "mcp_search_plugins",
    "Search WordPress.org plugin repository",
    {
      search: z.string().describe("Search query"),
      per_page: z.number().optional().default(10).describe("Results per page"),
    },
    async ({ search, per_page }) => {
      const result = await wpGet<{ total: number; plugins: unknown[] }>(
        "/mcp/v1/plugins/search",
        { search, per_page }
      );
      return jsonResult(result);
    }
  );

  // Install plugin from WordPress.org
  server.tool(
    "mcp_install_plugin",
    "Install a plugin from WordPress.org by slug",
    {
      slug: z.string().describe("Plugin slug from WordPress.org"),
      activate: z.boolean().optional().default(false).describe("Activate after install"),
    },
    async ({ slug, activate }) => {
      const result = await wpPost<{ installed: boolean; activated: boolean; plugin: string }>(
        "/mcp/v1/plugins/install",
        { slug, activate }
      );
      return jsonResult(result);
    }
  );

  // Update single plugin
  server.tool(
    "mcp_update_plugin",
    "Update a single plugin to latest version",
    {
      plugin: z.string().describe("Plugin file path (e.g., akismet/akismet.php)"),
    },
    async ({ plugin }) => {
      const result = await wpPost<{ updated: boolean; plugin: string }>(
        "/mcp/v1/plugins/update",
        { plugin }
      );
      return jsonResult(result);
    }
  );

  // Update all plugins
  server.tool(
    "mcp_update_all_plugins",
    "Update all plugins with available updates",
    {},
    async () => {
      const result = await wpPost<{ updated: string[]; failed: string[] }>(
        "/mcp/v1/plugins/update-all",
        {}
      );
      return jsonResult(result);
    }
  );
}
