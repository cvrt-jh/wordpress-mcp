/**
 * Taxonomy management tools using cvrt-mcp-endpoints plugin
 * Requires: cvrt-mcp-endpoints WordPress plugin
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { defined, jsonResult } from "../types.js";

const site = z.string().describe("Site id (see list_sites)");
const taxonomy = z
  .string()
  .regex(/^[a-zA-Z0-9_-]+$/)
  .describe("Taxonomy name (e.g. category, post_tag, product_cat)");

export interface TaxonomyInfo {
  name: string;
  label: string;
  singular: string;
  hierarchical: boolean;
  public: boolean;
  post_types: string[];
  rest_base: string;
  count: number;
}

export interface Term {
  id: number;
  name: string;
  slug: string;
  description: string;
  parent: number;
  count: number;
}

export function register(server: McpServer) {
  // List all taxonomies
  server.tool(
    "mcp_list_taxonomies",
    "List all public taxonomies (name, labels, hierarchical, post_types, rest_base, term count)",
    { site },
    async ({ site }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        taxonomies: TaxonomyInfo[];
        count: number;
      }>("/mcp/v1/taxonomies");
      return jsonResult(result);
    }
  );

  // Get single taxonomy
  server.tool(
    "mcp_get_taxonomy",
    "Get taxonomy details (labels, description, hierarchical, post_types, term count)",
    { site, taxonomy },
    async ({ site, taxonomy }) => {
      const wp = forSite(site);
      const result = await wp.get<
        TaxonomyInfo & {
          description: string;
          labels: { add_new_item: string; edit_item: string; search_items: string };
        }
      >(`/mcp/v1/taxonomies/${encodeURIComponent(taxonomy)}`);
      return jsonResult(result);
    }
  );

  // List terms for any taxonomy
  server.tool(
    "mcp_list_terms",
    "List terms for any taxonomy (categories, tags, custom taxonomies): id, name, slug, description, parent, count",
    {
      site,
      taxonomy,
      hide_empty: z.boolean().optional().describe("Hide terms with no posts (default false)"),
      parent: z.number().int().min(0).optional().describe("Only direct children of this term ID (0 = top level)"),
      search: z.string().optional().describe("Search term names"),
    },
    async ({ site, taxonomy, hide_empty, parent, search }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        terms: Term[];
        count: number;
      }>(
        `/mcp/v1/taxonomies/${encodeURIComponent(taxonomy)}/terms`,
        defined({ hide_empty: hide_empty === undefined ? undefined : hide_empty ? 1 : 0, parent, search })
      );
      return jsonResult(result);
    }
  );

  // Create term
  server.tool(
    "mcp_create_term",
    "Create a term in any taxonomy",
    {
      site,
      taxonomy,
      name: z.string().describe("Term name"),
      slug: z.string().optional().describe("URL slug (derived from the name if omitted)"),
      description: z.string().optional().describe("Term description, plain text (default empty)"),
      parent: z.number().int().min(0).optional().describe("Parent term ID for hierarchical taxonomies (default 0 = none)"),
    },
    async ({ site, taxonomy, name, slug, description, parent }) => {
      const wp = forSite(site);
      const result = await wp.post<{ id: number; created: boolean }>(
        `/mcp/v1/taxonomies/${encodeURIComponent(taxonomy)}/terms`,
        defined({ name, slug, description, parent })
      );
      return jsonResult(result);
    }
  );

  // Update term
  server.tool(
    "mcp_update_term",
    "Update a term in any taxonomy. Only the given fields change.",
    {
      site,
      taxonomy,
      id: z.number().int().describe("Term ID"),
      name: z.string().optional().describe("Term name"),
      slug: z.string().optional().describe("URL slug"),
      description: z.string().optional().describe("Term description, plain text"),
      parent: z.number().int().min(0).optional().describe("Parent term ID (0 = none)"),
    },
    async ({ site, taxonomy, id, name, slug, description, parent }) => {
      const wp = forSite(site);
      const result = await wp.put<{ id: number; updated: boolean }>(
        `/mcp/v1/taxonomies/${encodeURIComponent(taxonomy)}/terms/${id}`,
        defined({ name, slug, description, parent })
      );
      return jsonResult(result);
    }
  );

  // Delete term
  server.tool(
    "mcp_delete_term",
    "Delete a term from any taxonomy (permanent; terms have no trash)",
    {
      site,
      taxonomy,
      id: z.number().int().describe("Term ID"),
    },
    async ({ site, taxonomy, id }) => {
      const wp = forSite(site);
      const result = await wp.delete<{ id: number; deleted: boolean }>(
        `/mcp/v1/taxonomies/${encodeURIComponent(taxonomy)}/terms/${id}`
      );
      return jsonResult(result);
    }
  );

  // Assign terms to a post
  server.tool(
    "mcp_assign_terms",
    "Assign taxonomy terms to a post. Terms can be IDs, slugs or names; slugs/names that match no term are skipped silently.",
    {
      site,
      post_id: z.number().int().describe("Post ID"),
      taxonomy,
      terms: z
        .array(z.union([z.number().int(), z.string()]))
        .describe("Term IDs, slugs or names (an empty array with append false removes all terms)"),
      append: z.boolean().optional().describe("Append to existing terms instead of replacing them (default false)"),
    },
    async ({ site, post_id, taxonomy, terms, append }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        post_id: number;
        taxonomy: string;
        terms: Array<number | string>;
        appended: boolean;
      }>("/mcp/v1/taxonomies/assign", defined({ post_id, taxonomy, terms, append }));
      return jsonResult(result);
    }
  );
}
