/**
 * Extended plugin tools using cvrt-mcp-endpoints plugin
 * Requires: cvrt-mcp-endpoints WordPress plugin
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { defined, jsonResult } from "../types.js";

/** Rethrow an error with every occurrence of `secret` replaced, so a token never reaches a result. */
function redact(err: unknown, secret: string | undefined): Error {
  const message = err instanceof Error ? err.message : String(err);
  if (!secret) return err instanceof Error ? err : new Error(message);
  return new Error(message.split(secret).join("[redacted]"));
}

export function register(server: McpServer) {
  // Search WordPress.org plugins
  server.tool(
    "mcp_search_plugins",
    "Search the WordPress.org plugin repository. Returns { total, plugins: [{ name, slug, version, author, rating, active_installs, description }] }.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      search: z.string().describe("Search query"),
      per_page: z.number().int().positive().optional().default(10).describe("Results per page (default 10)"),
    },
    async ({ site, search, per_page }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        total: number;
        plugins: Array<{
          name: string;
          slug: string;
          version: string;
          author: string;
          rating: number;
          active_installs: number;
          description: string;
        }>;
      }>("/mcp/v1/plugins/search", { search, per_page });
      return jsonResult(result);
    }
  );

  // Install plugin from WordPress.org
  server.tool(
    "mcp_install_plugin",
    "Install a plugin from WordPress.org by slug. If activation fails the plugin stays installed and activation_error says why.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      slug: z.string().describe("Plugin slug from WordPress.org"),
      activate: z.boolean().optional().default(false).describe("Activate after install (default false)"),
    },
    async ({ site, slug, activate }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        installed: boolean;
        activated: boolean;
        plugin: string;
        name?: string;
        version?: string;
        activation_error?: string;
      }>("/mcp/v1/plugins/install", { slug, activate });
      return jsonResult(result);
    }
  );

  // Update single plugin
  server.tool(
    "mcp_update_plugin",
    "Update a single plugin to the latest version. A plugin that was active before is reactivated after the file swap (reactivated / reactivate_error report it). cvrt-mcp-endpoints itself is refused (409): update it via mcp_install_plugin_zip or wp-admin.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      plugin: z.string().describe("Plugin file path (e.g., akismet/akismet.php)"),
    },
    async ({ site, plugin }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        updated: boolean;
        plugin: string;
        was_active: boolean;
        active: boolean;
        reactivated: boolean;
        reactivate_error?: string;
      }>("/mcp/v1/plugins/update", { plugin });
      return jsonResult(result);
    }
  );

  // Update all plugins
  server.tool(
    "mcp_update_all_plugins",
    "Update all plugins with available updates. cvrt-mcp-endpoints itself is never bulk-updated and is listed under skipped.",
    {
      site: z.string().describe("Site id (see list_sites)"),
    },
    async ({ site }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        updated: string[];
        failed?: string[];
        skipped?: string[];
        message?: string;
      }>("/mcp/v1/plugins/update-all", {});
      return jsonResult(result);
    }
  );

  // Install plugin from ZIP URL
  server.tool(
    "mcp_install_plugin_zip",
    "Install a plugin from a ZIP URL (GitHub releases, custom sources). The URL must end in .zip or be a github.com / api.github.com release asset URL (private repo assets supported with a token).",
    {
      site: z.string().describe("Site id (see list_sites)"),
      url: z.string().describe("URL to the plugin ZIP, or a github.com/api.github.com release asset URL"),
      activate: z.boolean().optional().default(false).describe("Activate after install (default false)"),
      overwrite: z
        .boolean()
        .optional()
        .default(true)
        .describe("Deactivate and replace the plugin folder if it already exists (default true)"),
      token: z
        .string()
        .optional()
        .describe(
          "Write-only GitHub token for a PRIVATE release asset. Sent only to github.com/api.github.com, never echoed. Omit to use the site's mcpe_github_token option / GITHUB_UPDATER_TOKEN constant."
        ),
    },
    async ({ site, url, activate, overwrite, token }) => {
      const wp = forSite(site);
      const secret = token && token.trim() !== "" ? token : undefined;
      try {
        const result = await wp.post<{
          installed: boolean;
          activated: boolean;
          plugin: string;
          name?: string;
          version?: string;
          source?: string;
          activation_error?: string;
        }>("/mcp/v1/plugins/install-zip", defined({ url, activate, overwrite, token: secret }));
        return jsonResult(result);
      } catch (err) {
        throw redact(err, secret);
      }
    }
  );
}
