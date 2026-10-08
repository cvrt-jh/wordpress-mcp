/**
 * Database management tools using cvrt-mcp-endpoints plugin
 * Requires: cvrt-mcp-endpoints WordPress plugin
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { defined, jsonResult } from "../types.js";

export function register(server: McpServer) {
  // Get database tables
  server.tool(
    "mcp_get_tables",
    "List the site's database tables (current table prefix only) with data/index size in MB and approximate row count, largest first",
    {
      site: z.string().describe("Site id (see list_sites)"),
    },
    async ({ site }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        // MySQL values arrive as numeric strings (wpdb does not cast).
        tables: Array<{ name: string; data_mb: string; index_mb: string; row_count: string }>;
        total_size_mb: number;
      }>("/mcp/v1/db/tables");
      return jsonResult(result);
    }
  );

  // Search and replace
  server.tool(
    "mcp_search_replace",
    "Search and replace a string in every text column of the site's tables (current table prefix only). Plain SQL REPLACE: it is NOT serialization-safe, so a replacement of different length corrupts serialized PHP values (options, postmeta, widgets). Both strings pass through sanitize_text_field on the server (tags and line breaks are stripped). total_changes and tables count matching rows per column, not occurrences.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      search: z.string().describe("String to search for"),
      replace: z.string().describe("Replacement string"),
      tables: z
        .array(z.string())
        .optional()
        .describe("Full table names to limit the run to (must start with the table prefix; empty or omitted = all prefixed tables)"),
      dry_run: z.boolean().optional().default(true).describe("Only count matches without writing (default true)"),
    },
    async ({ site, search, replace, tables, dry_run }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        dry_run: boolean;
        search: string;
        replace: string;
        total_changes: number;
        tables: Record<string, number>;
      }>("/mcp/v1/db/search-replace", defined({ search, replace, tables, dry_run }));
      return jsonResult(result);
    }
  );

  // Optimize tables
  server.tool(
    "mcp_optimize_tables",
    "Run OPTIMIZE TABLE on every table with the site's table prefix",
    {
      site: z.string().describe("Site id (see list_sites)"),
    },
    async ({ site }) => {
      const wp = forSite(site);
      const result = await wp.post<{ optimized: string[]; count: number }>(
        "/mcp/v1/db/optimize",
        {}
      );
      return jsonResult(result);
    }
  );

  // Clean revisions
  server.tool(
    "mcp_clean_revisions",
    "Delete old post revisions, keeping the newest `keep` per post",
    {
      site: z.string().describe("Site id (see list_sites)"),
      keep: z.number().int().min(0).optional().default(5).describe("Newest revisions to keep per post (default 5; 0 deletes all)"),
    },
    async ({ site, keep }) => {
      const wp = forSite(site);
      const result = await wp.post<{ deleted: number; kept_per_post: number }>(
        "/mcp/v1/db/clean-revisions",
        { keep }
      );
      return jsonResult(result);
    }
  );

  // Clean comments
  server.tool(
    "mcp_clean_comments",
    "Permanently delete all spam and trashed comments",
    {
      site: z.string().describe("Site id (see list_sites)"),
    },
    async ({ site }) => {
      const wp = forSite(site);
      const result = await wp.post<{ spam_deleted: number; trash_deleted: number }>(
        "/mcp/v1/db/clean-comments",
        {}
      );
      return jsonResult(result);
    }
  );
}
