/**
 * Taxonomy management tools using cvrt-mcp-endpoints plugin
 * Requires: cvrt-mcp-endpoints WordPress plugin
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { jsonResult } from "../types.js";

export function register(server: McpServer) {
  // List all taxonomies
  server.tool(
    "mcp_list_taxonomies",
    "List all registered taxonomies",
    {
      site: z.string().describe("Site id (see list_sites)"),
    },
    async ({ site }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        taxonomies: unknown[];
        count: number;
      }>("/mcp/v1/taxonomies");
      return jsonResult(result);
    }
  );

  // Get single taxonomy
  server.tool(
    "mcp_get_taxonomy",
    "Get taxonomy details and schema",
    {
      site: z.string().describe("Site id (see list_sites)"),
      taxonomy: z.string().describe("Taxonomy name (e.g., category, product_cat)"),
    },
    async ({ site, taxonomy }) => {
      const wp = forSite(site);
      const result = await wp.get<Record<string, unknown>>(
        `/mcp/v1/taxonomies/${encodeURIComponent(taxonomy)}`
      );
      return jsonResult(result);
    }
  );

  // List terms for any taxonomy
  server.tool(
    "mcp_list_terms",
    "List terms for any taxonomy (categories, tags, custom taxonomies)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      taxonomy: z.string().describe("Taxonomy name"),
      hide_empty: z.boolean().optional().default(false).describe("Hide terms with no posts"),
      parent: z.number().optional().describe("Parent term ID (for hierarchical)"),
      search: z.string().optional().describe("Search term names"),
    },
    async ({ site, taxonomy, hide_empty, parent, search }) => {
      const wp = forSite(site);
      const params: Record<string, string | number> = {};
      if (hide_empty) params.hide_empty = 1;
      if (parent !== undefined) params.parent = parent;
      if (search) params.search = search;
      const result = await wp.get<{
        terms: unknown[];
        count: number;
      }>(`/mcp/v1/taxonomies/${encodeURIComponent(taxonomy)}/terms`, params);
      return jsonResult(result);
    }
  );

  // Create term
  server.tool(
    "mcp_create_term",
    "Create a term in any taxonomy",
    {
      site: z.string().describe("Site id (see list_sites)"),
      taxonomy: z.string().describe("Taxonomy name"),
      name: z.string().describe("Term name"),
      slug: z.string().optional().describe("URL slug"),
      description: z.string().optional().default("").describe("Term description"),
      parent: z.number().optional().default(0).describe("Parent term ID (for hierarchical taxonomies)"),
    },
    async ({ site, taxonomy, ...params }) => {
      const wp = forSite(site);
      const result = await wp.post<Record<string, unknown>>(
        `/mcp/v1/taxonomies/${encodeURIComponent(taxonomy)}/terms`,
        params
      );
      return jsonResult(result);
    }
  );

  // Update term
  server.tool(
    "mcp_update_term",
    "Update a term in any taxonomy",
    {
      site: z.string().describe("Site id (see list_sites)"),
      taxonomy: z.string().describe("Taxonomy name"),
      id: z.number().describe("Term ID"),
      name: z.string().optional().describe("Term name"),
      slug: z.string().optional().describe("URL slug"),
      description: z.string().optional().describe("Term description"),
      parent: z.number().optional().describe("Parent term ID"),
    },
    async ({ site, taxonomy, id, ...params }) => {
      const wp = forSite(site);
      const result = await wp.put<Record<string, unknown>>(
        `/mcp/v1/taxonomies/${encodeURIComponent(taxonomy)}/terms/${id}`,
        params
      );
      return jsonResult(result);
    }
  );

  // Delete term
  server.tool(
    "mcp_delete_term",
    "Delete a term from any taxonomy",
    {
      site: z.string().describe("Site id (see list_sites)"),
      taxonomy: z.string().describe("Taxonomy name"),
      id: z.number().describe("Term ID"),
    },
    async ({ site, taxonomy, id }) => {
      const wp = forSite(site);
      const result = await wp.delete<Record<string, unknown>>(
        `/mcp/v1/taxonomies/${encodeURIComponent(taxonomy)}/terms/${id}`
      );
      return jsonResult(result);
    }
  );

  // Assign terms to a post
  server.tool(
    "mcp_assign_terms",
    "Assign taxonomy terms to a post",
    {
      site: z.string().describe("Site id (see list_sites)"),
      post_id: z.number().describe("Post ID"),
      taxonomy: z.string().describe("Taxonomy name"),
      terms: z.array(z.number()).describe("Array of term IDs"),
      append: z.boolean().optional().default(false).describe("Append to existing terms (false = replace)"),
    },
    async ({ site, post_id, taxonomy, terms, append }) => {
      const wp = forSite(site);
      const result = await wp.post<Record<string, unknown>>(
        "/mcp/v1/taxonomies/assign",
        { post_id, taxonomy, terms, append }
      );
      return jsonResult(result);
    }
  );
}
