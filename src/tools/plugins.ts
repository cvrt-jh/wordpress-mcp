import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { jsonResult } from "../types.js";
import { slimPlugin } from "../slim.js";

/**
 * Encode plugin slug for WP REST API URL path.
 * The WP REST API route regex `[^.\/]+(?:\/[^.\/]+)?` rejects dots,
 * so the .php extension must be stripped (e.g., "akismet/akismet.php" → "akismet/akismet").
 * Each segment is then URI-encoded separately, preserving the slash.
 */
function encodePluginSlug(plugin: string): string {
  return plugin.replace(/\.php$/, "").split("/").map(encodeURIComponent).join("/");
}

export function register(server: McpServer) {
  // List plugins
  server.tool(
    "wp_list_plugins",
    "List all installed plugins",
    {
      site: z.string().describe("Site id (see list_sites)"),
      status: z.enum(["active", "inactive"]).optional().describe("Filter by status"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const plugins = await wp.get<unknown[]>("/wp/v2/plugins", params as Record<string, string | number>);
      return jsonResult(plugins.map(slimPlugin));
    }
  );

  // Get plugin info
  server.tool(
    "wp_get_plugin",
    "Get plugin details by slug",
    {
      site: z.string().describe("Site id (see list_sites)"),
      plugin: z.string().describe("Plugin identifier (e.g., 'akismet/akismet.php')"),
    },
    async ({ site, plugin }) => {
      const wp = forSite(site);
      const pluginData = await wp.get<Record<string, unknown>>(`/wp/v2/plugins/${encodePluginSlug(plugin)}`);
      return jsonResult(slimPlugin(pluginData));
    }
  );

  // Activate plugin
  server.tool(
    "wp_activate_plugin",
    "Activate an installed plugin (via cvrt-mcp-endpoints, avoids the often-blocked core route)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      plugin: z.string().describe("Plugin file path, e.g. akismet/akismet.php"),
    },
    async ({ site, plugin }) => {
      const wp = forSite(site);
      const result = await wp.post<{ plugin: string; active: boolean; changed: boolean }>(
        "/mcp/v1/plugins/activate",
        { plugin },
      );
      return jsonResult(result);
    },
  );

  // Deactivate plugin
  server.tool(
    "wp_deactivate_plugin",
    "Deactivate an installed plugin (via cvrt-mcp-endpoints)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      plugin: z.string().describe("Plugin file path, e.g. akismet/akismet.php"),
    },
    async ({ site, plugin }) => {
      const wp = forSite(site);
      const result = await wp.post<{ plugin: string; active: boolean; changed: boolean }>(
        "/mcp/v1/plugins/deactivate",
        { plugin },
      );
      return jsonResult(result);
    },
  );

  // Delete plugin
  server.tool(
    "wp_delete_plugin",
    "Delete an installed plugin (via cvrt-mcp-endpoints; deactivates first)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      plugin: z.string().describe("Plugin file path, e.g. akismet/akismet.php"),
    },
    async ({ site, plugin }) => {
      const wp = forSite(site);
      const result = await wp.post<{ plugin: string; deleted: boolean }>(
        "/mcp/v1/plugins/delete",
        { plugin },
      );
      return jsonResult(result);
    },
  );
}
