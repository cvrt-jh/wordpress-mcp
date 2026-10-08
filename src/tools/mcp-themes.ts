/**
 * Extended theme tools using cvrt-mcp-endpoints plugin
 * Requires: cvrt-mcp-endpoints WordPress plugin
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { jsonResult } from "../types.js";

export function register(server: McpServer) {
  // Search WordPress.org themes
  server.tool(
    "mcp_search_themes",
    "Search the WordPress.org theme repository. Returns { total, themes: [{ name, slug, version, author, rating, description }] }.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      search: z.string().describe("Search query"),
      per_page: z.number().int().positive().optional().default(10).describe("Results per page (default 10)"),
    },
    async ({ site, search, per_page }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        total: number;
        themes: Array<{
          name: string;
          slug: string;
          version: string;
          author: string;
          rating: number;
          description: string;
        }>;
      }>("/mcp/v1/themes/search", { search, per_page });
      return jsonResult(result);
    }
  );

  // Install theme from WordPress.org
  server.tool(
    "mcp_install_theme",
    "Install a theme from WordPress.org by slug",
    {
      site: z.string().describe("Site id (see list_sites)"),
      slug: z.string().describe("Theme slug from WordPress.org"),
      activate: z.boolean().optional().default(false).describe("Switch to the theme after install (default false)"),
    },
    async ({ site, slug, activate }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        installed: boolean;
        activated: boolean;
        stylesheet: string;
        name: string;
        version: string;
      }>("/mcp/v1/themes/install", { slug, activate });
      return jsonResult(result);
    }
  );

  // Update single theme
  server.tool(
    "mcp_update_theme",
    "Update a single theme to latest version",
    {
      site: z.string().describe("Site id (see list_sites)"),
      stylesheet: z.string().describe("Theme stylesheet (folder name)"),
    },
    async ({ site, stylesheet }) => {
      const wp = forSite(site);
      const result = await wp.post<{ updated: boolean; stylesheet: string }>(
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
    {
      site: z.string().describe("Site id (see list_sites)"),
    },
    async ({ site }) => {
      const wp = forSite(site);
      const result = await wp.post<{ updated: string[]; failed?: string[]; message?: string }>(
        "/mcp/v1/themes/update-all",
        {}
      );
      return jsonResult(result);
    }
  );

  // Delete theme
  server.tool(
    "mcp_delete_theme",
    "Delete an inactive theme (the active theme is refused)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      stylesheet: z.string().describe("Theme stylesheet (folder name)"),
    },
    async ({ site, stylesheet }) => {
      const wp = forSite(site);
      const result = await wp.delete<{ deleted: boolean; stylesheet: string }>(
        "/mcp/v1/themes/delete",
        { stylesheet }
      );
      return jsonResult(result);
    }
  );

  // Install theme from ZIP URL
  server.tool(
    "mcp_install_theme_zip",
    "Install a theme from a public ZIP URL (must end in .zip). Unlike mcp_install_plugin_zip there is no GitHub token support: private release assets cannot be installed this way.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      url: z.string().describe("URL to the theme ZIP file (must end in .zip)"),
      activate: z.boolean().optional().default(false).describe("Switch to the theme after install (default false)"),
      overwrite: z
        .boolean()
        .optional()
        .default(true)
        .describe("Replace the theme folder if it already exists (default true; the active theme is never overwritten)"),
    },
    async ({ site, url, activate, overwrite }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        installed: boolean;
        activated: boolean;
        stylesheet: string;
        name: string;
        version: string;
        source: string;
      }>("/mcp/v1/themes/install-zip", { url, activate, overwrite });
      return jsonResult(result);
    }
  );
}
