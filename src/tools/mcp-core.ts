/**
 * WordPress core management tools using mcp-endpoints plugin
 * Requires: mcp-endpoints WordPress plugin
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { wpGet, wpPost } from "../client.js";
import { jsonResult } from "../types.js";

export function register(server: McpServer) {
  // Get WordPress version info
  server.tool(
    "mcp_get_version",
    "Get WordPress version and update status",
    {},
    async () => {
      const result = await wpGet<{
        wordpress_version: string;
        php_version: string;
        mysql_version: string;
        update_available: boolean;
        latest_version: string;
      }>("/mcp/v1/core/version");
      return jsonResult(result);
    }
  );

  // Get system info
  server.tool(
    "mcp_get_system_info",
    "Get comprehensive system information",
    {},
    async () => {
      const result = await wpGet<{
        wordpress: Record<string, unknown>;
        server: Record<string, unknown>;
        paths: Record<string, string>;
        counts: Record<string, number>;
      }>("/mcp/v1/core/system-info");
      return jsonResult(result);
    }
  );

  // Check for updates
  server.tool(
    "mcp_check_updates",
    "Check for WordPress core, plugin, and theme updates",
    {},
    async () => {
      const result = await wpPost<{
        core: string | null;
        plugins: number;
        themes: number;
      }>("/mcp/v1/core/check-updates", {});
      return jsonResult(result);
    }
  );

  // Update WordPress core
  server.tool(
    "mcp_update_core",
    "Update WordPress to the latest version",
    {},
    async () => {
      const result = await wpPost<{ updated: boolean; version: string }>(
        "/mcp/v1/core/update",
        {}
      );
      return jsonResult(result);
    }
  );

  // Flush rewrite rules
  server.tool(
    "mcp_flush_rewrite",
    "Flush permalink rewrite rules",
    {},
    async () => {
      const result = await wpPost<{ flushed: boolean }>(
        "/mcp/v1/core/flush-rewrite",
        {}
      );
      return jsonResult(result);
    }
  );

  // Flush cache
  server.tool(
    "mcp_flush_cache",
    "Clear all caches and transients",
    {},
    async () => {
      const result = await wpPost<{ flushed: boolean }>(
        "/mcp/v1/core/flush-cache",
        {}
      );
      return jsonResult(result);
    }
  );
}
