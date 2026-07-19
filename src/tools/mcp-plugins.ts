/**
 * Extended plugin tools using cvrt-mcp-endpoints plugin
 * Requires: cvrt-mcp-endpoints WordPress plugin
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { jsonResult } from "../types.js";

export function register(server: McpServer) {
  // Search WordPress.org plugins
  server.tool(
    "mcp_search_plugins",
    "Search WordPress.org plugin repository",
    {
      site: z.string().describe("Site id (see list_sites)"),
      search: z.string().describe("Search query"),
      per_page: z.number().optional().default(10).describe("Results per page"),
    },
    async ({ site, search, per_page }) => {
      const wp = forSite(site);
      const result = await wp.get<{ total: number; plugins: unknown[] }>(
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
      site: z.string().describe("Site id (see list_sites)"),
      slug: z.string().describe("Plugin slug from WordPress.org"),
      activate: z.boolean().optional().default(false).describe("Activate after install"),
    },
    async ({ site, slug, activate }) => {
      const wp = forSite(site);
      const result = await wp.post<{ installed: boolean; activated: boolean; plugin: string }>(
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
      site: z.string().describe("Site id (see list_sites)"),
      plugin: z.string().describe("Plugin file path (e.g., akismet/akismet.php)"),
    },
    async ({ site, plugin }) => {
      const wp = forSite(site);
      const result = await wp.post<{ updated: boolean; plugin: string }>(
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
    {
      site: z.string().describe("Site id (see list_sites)"),
    },
    async ({ site }) => {
      const wp = forSite(site);
      const result = await wp.post<{ updated: string[]; failed: string[] }>(
        "/mcp/v1/plugins/update-all",
        {}
      );
      return jsonResult(result);
    }
  );

  // Install plugin from ZIP URL
  server.tool(
    "mcp_install_plugin_zip",
    "Install a plugin from a ZIP URL (GitHub releases, custom sources)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      url: z.string().describe("URL to plugin ZIP file"),
      activate: z.boolean().optional().default(false).describe("Activate after install"),
      overwrite: z.boolean().optional().default(true).describe("Overwrite if plugin already exists"),
    },
    async ({ site, url, activate, overwrite }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        installed: boolean;
        activated: boolean;
        plugin: string;
        name: string;
        version: string;
        source: string;
      }>("/mcp/v1/plugins/install-zip", { url, activate, overwrite });
      return jsonResult(result);
    }
  );
}
