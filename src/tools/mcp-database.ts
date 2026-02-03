/**
 * Database management tools using mcp-endpoints plugin
 * Requires: mcp-endpoints WordPress plugin
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wpGet, wpPost } from "../client.js";
import { jsonResult } from "../types.js";

export function register(server: McpServer) {
  // Get database tables
  server.tool(
    "mcp_get_tables",
    "List all database tables with sizes",
    {},
    async () => {
      const result = await wpGet<{
        tables: Array<{ name: string; data_mb: number; index_mb: number; rows: number }>;
        total_size_mb: number;
      }>("/mcp/v1/db/tables");
      return jsonResult(result);
    }
  );

  // Search and replace
  server.tool(
    "mcp_search_replace",
    "Search and replace strings in database (serialization-safe)",
    {
      search: z.string().describe("String to search for"),
      replace: z.string().describe("Replacement string"),
      tables: z.array(z.string()).optional().describe("Specific tables (empty = all)"),
      dry_run: z.boolean().optional().default(true).describe("Preview without applying"),
    },
    async ({ search, replace, tables, dry_run }) => {
      const result = await wpPost<{
        dry_run: boolean;
        search: string;
        replace: string;
        total_changes: number;
        tables: Record<string, number>;
      }>("/mcp/v1/db/search-replace", { search, replace, tables, dry_run });
      return jsonResult(result);
    }
  );

  // Optimize tables
  server.tool(
    "mcp_optimize_tables",
    "Optimize all database tables",
    {},
    async () => {
      const result = await wpPost<{ optimized: string[]; count: number }>(
        "/mcp/v1/db/optimize",
        {}
      );
      return jsonResult(result);
    }
  );

  // Clean revisions
  server.tool(
    "mcp_clean_revisions",
    "Delete old post revisions",
    {
      keep: z.number().optional().default(5).describe("Revisions to keep per post"),
    },
    async ({ keep }) => {
      const result = await wpPost<{ deleted: number; kept_per_post: number }>(
        "/mcp/v1/db/clean-revisions",
        { keep }
      );
      return jsonResult(result);
    }
  );

  // Clean comments
  server.tool(
    "mcp_clean_comments",
    "Delete spam and trashed comments",
    {},
    async () => {
      const result = await wpPost<{ spam_deleted: number; trash_deleted: number }>(
        "/mcp/v1/db/clean-comments",
        {}
      );
      return jsonResult(result);
    }
  );
}
