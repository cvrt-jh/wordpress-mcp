/**
 * WordPress options management tools using cvrt-mcp-endpoints plugin
 * Requires: cvrt-mcp-endpoints WordPress plugin
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { jsonResult } from "../types.js";

export function register(server: McpServer) {
  // List options
  server.tool(
    "mcp_list_options",
    "List WordPress options with optional prefix filter",
    {
      site: z.string().describe("Site id (see list_sites)"),
      prefix: z.string().optional().describe("Filter by option name prefix"),
      per_page: z.number().optional().default(50).describe("Results per page"),
    },
    async ({ site, prefix, per_page }) => {
      const wp = forSite(site);
      const params: Record<string, string | number> = { per_page };
      if (prefix) params.prefix = prefix;
      const result = await wp.get<{
        options: Array<{ key: string; value: unknown; autoload: boolean }>;
        count: number;
      }>("/mcp/v1/options", params);
      return jsonResult(result);
    }
  );

  // Get option
  server.tool(
    "mcp_get_option",
    "Get a single option value",
    {
      site: z.string().describe("Site id (see list_sites)"),
      key: z.string().describe("Option name"),
    },
    async ({ site, key }) => {
      const wp = forSite(site);
      const result = await wp.get<{ key: string; value: unknown }>(
        `/mcp/v1/options/${encodeURIComponent(key)}`
      );
      return jsonResult(result);
    }
  );

  // Set option
  server.tool(
    "mcp_set_option",
    "Create or update an option",
    {
      site: z.string().describe("Site id (see list_sites)"),
      key: z.string().describe("Option name"),
      value: z.unknown().describe("Option value (any type)"),
      autoload: z.boolean().optional().default(true).describe("Load on every page"),
    },
    async ({ site, key, value, autoload }) => {
      const wp = forSite(site);
      const result = await wp.post<{ key: string; value: unknown; created: boolean }>(
        `/mcp/v1/options/${encodeURIComponent(key)}`,
        { value, autoload }
      );
      return jsonResult(result);
    }
  );

  // Delete option
  server.tool(
    "mcp_delete_option",
    "Delete an option",
    {
      site: z.string().describe("Site id (see list_sites)"),
      key: z.string().describe("Option name"),
    },
    async ({ site, key }) => {
      const wp = forSite(site);
      const result = await wp.delete<{ deleted: boolean; key: string }>(
        `/mcp/v1/options/${encodeURIComponent(key)}`
      );
      return jsonResult(result);
    }
  );

  // Bulk get options
  server.tool(
    "mcp_bulk_get_options",
    "Get multiple options at once",
    {
      site: z.string().describe("Site id (see list_sites)"),
      keys: z.array(z.string()).describe("Array of option names"),
    },
    async ({ site, keys }) => {
      const wp = forSite(site);
      const result = await wp.post<{ options: Record<string, unknown> }>(
        "/mcp/v1/options-bulk",
        { keys }
      );
      return jsonResult(result);
    }
  );
}
