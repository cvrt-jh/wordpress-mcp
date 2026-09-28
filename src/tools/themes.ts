import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { jsonResult } from "../types.js";
import { slimTheme } from "../slim.js";

export function register(server: McpServer) {
  // List themes
  server.tool(
    "wp_list_themes",
    "List all installed themes",
    {
      site: z.string().describe("Site id (see list_sites)"),
      status: z.enum(["active", "inactive"]).optional().describe("Filter by status"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const themes = await wp.get<unknown[]>("/wp/v2/themes", params as Record<string, string | number>);
      return jsonResult(themes.map(slimTheme));
    }
  );

  // Get current theme
  server.tool(
    "wp_get_active_theme",
    "Get the currently active theme",
    { site: z.string().describe("Site id (see list_sites)") },
    async ({ site }) => {
      const wp = forSite(site);
      const themes = await wp.get<unknown[]>("/wp/v2/themes", { status: "active" });
      if (themes.length === 0) {
        return jsonResult({ error: "No active theme found" });
      }
      return jsonResult(slimTheme(themes[0]));
    }
  );

  // Get theme by stylesheet
  server.tool(
    "wp_get_theme",
    "Get theme details by stylesheet name",
    {
      site: z.string().describe("Site id (see list_sites)"),
      stylesheet: z.string().describe("Theme stylesheet (folder name)"),
    },
    async ({ site, stylesheet }) => {
      const wp = forSite(site);
      const theme = await wp.get<Record<string, unknown>>(`/wp/v2/themes/${stylesheet}`);
      return jsonResult(slimTheme(theme));
    }
  );

  // Activate theme
  server.tool(
    "wp_activate_theme",
    "Activate a theme (switch themes)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      stylesheet: z.string().describe("Theme stylesheet (folder name) to activate"),
    },
    async ({ site, stylesheet }) => {
      const wp = forSite(site);
      // Switch through cvrt-mcp-endpoints. /wp/v2/settings has no `stylesheet`
      // field: WordPress ignored it, the theme never switched, and this tool
      // still answered "activated" (boardcouture.shop, 2026-09-28).
      const result = await wp.post<{ stylesheet: string; active: boolean; changed: boolean }>(
        "/mcp/v1/themes/activate",
        { stylesheet }
      );
      if (!result.active) {
        return {
          ...jsonResult({ ...result, error: `Theme "${stylesheet}" is not active after switching` }),
          isError: true,
        };
      }
      return jsonResult(result);
    }
  );
}
