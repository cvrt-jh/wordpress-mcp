import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wpGet, wpPost, wpPut, wpDelete } from "../client.js";
import { jsonResult } from "../types.js";
import { slimPlugin } from "../slim.js";

export function register(server: McpServer) {
  // List plugins
  server.tool(
    "wp_list_plugins",
    "List all installed plugins",
    {
      status: z.enum(["active", "inactive"]).optional().describe("Filter by status"),
    },
    async (params) => {
      const plugins = await wpGet<unknown[]>("/wp/v2/plugins", params as Record<string, string | number>);
      return jsonResult(plugins.map(slimPlugin));
    }
  );

  // Get plugin info
  server.tool(
    "wp_get_plugin",
    "Get plugin details by slug",
    {
      plugin: z.string().describe("Plugin identifier (e.g., 'akismet/akismet.php')"),
    },
    async ({ plugin }) => {
      const pluginData = await wpGet<Record<string, unknown>>(`/wp/v2/plugins/${encodeURIComponent(plugin)}`);
      return jsonResult(slimPlugin(pluginData));
    }
  );

  // Activate plugin
  server.tool(
    "wp_activate_plugin",
    "Activate a plugin",
    {
      plugin: z.string().describe("Plugin identifier (e.g., 'akismet/akismet.php')"),
    },
    async ({ plugin }) => {
      const pluginData = await wpPut<Record<string, unknown>>(
        `/wp/v2/plugins/${encodeURIComponent(plugin)}`,
        { status: "active" }
      );
      return jsonResult(slimPlugin(pluginData));
    }
  );

  // Deactivate plugin
  server.tool(
    "wp_deactivate_plugin",
    "Deactivate a plugin",
    {
      plugin: z.string().describe("Plugin identifier (e.g., 'akismet/akismet.php')"),
    },
    async ({ plugin }) => {
      const pluginData = await wpPut<Record<string, unknown>>(
        `/wp/v2/plugins/${encodeURIComponent(plugin)}`,
        { status: "inactive" }
      );
      return jsonResult(slimPlugin(pluginData));
    }
  );

  // Delete plugin
  server.tool(
    "wp_delete_plugin",
    "Delete/uninstall a plugin (must be deactivated first)",
    {
      plugin: z.string().describe("Plugin identifier (e.g., 'akismet/akismet.php')"),
    },
    async ({ plugin }) => {
      await wpDelete<Record<string, unknown>>(`/wp/v2/plugins/${encodeURIComponent(plugin)}`);
      return jsonResult({ deleted: true, plugin });
    }
  );
}
