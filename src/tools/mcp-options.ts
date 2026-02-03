/**
 * WordPress options management tools using mcp-endpoints plugin
 * Requires: mcp-endpoints WordPress plugin
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wpGet, wpPost, wpDelete } from "../client.js";
import { jsonResult } from "../types.js";

export function register(server: McpServer) {
  // List options
  server.tool(
    "mcp_list_options",
    "List WordPress options with optional prefix filter",
    {
      prefix: z.string().optional().describe("Filter by option name prefix"),
      per_page: z.number().optional().default(50).describe("Results per page"),
    },
    async ({ prefix, per_page }) => {
      const params: Record<string, string | number> = { per_page };
      if (prefix) params.prefix = prefix;
      const result = await wpGet<{
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
      key: z.string().describe("Option name"),
    },
    async ({ key }) => {
      const result = await wpGet<{ key: string; value: unknown }>(
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
      key: z.string().describe("Option name"),
      value: z.unknown().describe("Option value (any type)"),
      autoload: z.boolean().optional().default(true).describe("Load on every page"),
    },
    async ({ key, value, autoload }) => {
      const result = await wpPost<{ key: string; value: unknown; created: boolean }>(
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
      key: z.string().describe("Option name"),
    },
    async ({ key }) => {
      const result = await wpDelete<{ deleted: boolean; key: string }>(
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
      keys: z.array(z.string()).describe("Array of option names"),
    },
    async ({ keys }) => {
      const result = await wpPost<{ options: Record<string, unknown> }>(
        "/mcp/v1/options-bulk",
        { keys }
      );
      return jsonResult(result);
    }
  );
}
