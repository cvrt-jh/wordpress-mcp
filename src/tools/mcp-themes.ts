/**
 * Extended theme tools using mcp-endpoints plugin
 * Requires: mcp-endpoints WordPress plugin
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wpGet, wpPost, wpDelete } from "../client.js";
import { jsonResult } from "../types.js";

export function register(server: McpServer) {
  // Search WordPress.org themes
  server.tool(
    "mcp_search_themes",
    "Search WordPress.org theme repository",
    {
      search: z.string().describe("Search query"),
      per_page: z.number().optional().default(10).describe("Results per page"),
    },
    async ({ search, per_page }) => {
      const result = await wpGet<{ total: number; themes: unknown[] }>(
        "/mcp/v1/themes/search",
        { search, per_page }
      );
      return jsonResult(result);
    }
  );

  // Install theme from WordPress.org
  server.tool(
    "mcp_install_theme",
    "Install a theme from WordPress.org by slug",
    {
      slug: z.string().describe("Theme slug from WordPress.org"),
      activate: z.boolean().optional().default(false).describe("Activate after install"),
    },
    async ({ slug, activate }) => {
      const result = await wpPost<{ installed: boolean; activated: boolean; stylesheet: string }>(
        "/mcp/v1/themes/install",
        { slug, activate }
      );
      return jsonResult(result);
    }
  );

  // Update single theme
  server.tool(
    "mcp_update_theme",
    "Update a single theme to latest version",
    {
      stylesheet: z.string().describe("Theme folder name"),
    },
    async ({ stylesheet }) => {
      const result = await wpPost<{ updated: boolean; stylesheet: string }>(
        "/mcp/v1/themes/update",
        { stylesheet }
      );
      return jsonResult(result);
    }
  );

  // Update all themes
  server.tool(
    "mcp_update_all_themes",
    "Update all themes with available updates",
    {},
    async () => {
      const result = await wpPost<{ updated: string[]; failed: string[] }>(
        "/mcp/v1/themes/update-all",
        {}
      );
      return jsonResult(result);
    }
  );

  // Delete theme
  server.tool(
    "mcp_delete_theme",
    "Delete an inactive theme",
    {
      stylesheet: z.string().describe("Theme folder name"),
    },
    async ({ stylesheet }) => {
      const result = await wpDelete<{ deleted: boolean; stylesheet: string }>(
        "/mcp/v1/themes/delete",
        { stylesheet }
      );
      return jsonResult(result);
    }
  );
}
