import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { defined, jsonResult } from "../types.js";
import { slimCategory, slimTag } from "../slim.js";
import { toQuery } from "./posts.js";

/** Collection filters shared by wp/v2 categories and tags (WP_REST_Terms_Controller::get_collection_params). */
const termCollectionParams = {
  per_page: z.number().int().optional().default(100).describe("Terms per page (max 100)"),
  page: z.number().int().optional().describe("Page number"),
  search: z.string().optional().describe("Search term"),
  include: z.array(z.number().int()).optional().describe("Limit to these term IDs"),
  exclude: z.array(z.number().int()).optional().describe("Exclude these term IDs"),
  slug: z.array(z.string()).optional().describe("Limit to these slugs"),
  post: z.number().int().optional().describe("Limit to terms assigned to this post ID"),
  hide_empty: z.boolean().optional().default(false).describe("Hide terms with no posts"),
  orderby: z
    .enum(["id", "include", "name", "slug", "include_slugs", "term_group", "description", "count"])
    .optional()
    .describe("Sort field (default name)"),
  order: z.enum(["asc", "desc"]).optional().describe("Sort direction (default asc)"),
};

const meta = z.record(z.string(), z.unknown()).optional().describe("Registered term meta fields (show_in_rest) as key/value");

export function register(server: McpServer) {
  // === CATEGORIES ===

  // List categories
  server.tool(
    "wp_list_categories",
    "List categories",
    {
      site: z.string().describe("Site id (see list_sites)"),
      ...termCollectionParams,
      parent: z.number().int().optional().describe("Limit to children of this category ID (0 = top level)"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const cats = await wp.get<unknown[]>("/wp/v2/categories", toQuery(params));
      return jsonResult(cats.map(slimCategory));
    }
  );

  // Create category
  server.tool(
    "wp_create_category",
    "Create a new category",
    {
      site: z.string().describe("Site id (see list_sites)"),
      name: z.string().describe("Category name"),
      slug: z.string().optional().describe("URL slug"),
      parent: z.number().int().optional().describe("Parent category ID (default 0 = top level)"),
      description: z.string().optional().describe("Description"),
      meta,
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const cat = await wp.post<Record<string, unknown>>("/wp/v2/categories", defined(params));
      return jsonResult(slimCategory(cat));
    }
  );

  // Update category
  server.tool(
    "wp_update_category",
    "Update a category (only the given fields change)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().int().describe("Category ID"),
      name: z.string().optional().describe("Category name"),
      slug: z.string().optional().describe("URL slug"),
      parent: z.number().int().optional().describe("Parent category ID (0 = top level)"),
      description: z.string().optional().describe("Description"),
      meta,
    },
    async ({ site, id, ...params }) => {
      const wp = forSite(site);
      const cat = await wp.put<Record<string, unknown>>(`/wp/v2/categories/${id}`, defined(params));
      return jsonResult(slimCategory(cat));
    }
  );

  // Delete category
  server.tool(
    "wp_delete_category",
    "Delete a category permanently (its posts fall back to the default category)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().int().describe("Category ID"),
    },
    async ({ site, id }) => {
      const wp = forSite(site);
      // Terms cannot be trashed: WP answers 501 without force=true.
      await wp.delete<Record<string, unknown>>(`/wp/v2/categories/${id}`, { force: 1 });
      return jsonResult({ deleted: true, id });
    }
  );

  // === TAGS ===

  // List tags
  server.tool(
    "wp_list_tags",
    "List tags",
    {
      site: z.string().describe("Site id (see list_sites)"),
      ...termCollectionParams,
      offset: z.number().int().optional().describe("Skip this many tags (overrides page)"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const tags = await wp.get<unknown[]>("/wp/v2/tags", toQuery(params));
      return jsonResult(tags.map(slimTag));
    }
  );

  // Create tag
  server.tool(
    "wp_create_tag",
    "Create a new tag",
    {
      site: z.string().describe("Site id (see list_sites)"),
      name: z.string().describe("Tag name"),
      slug: z.string().optional().describe("URL slug"),
      description: z.string().optional().describe("Description"),
      meta,
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const tag = await wp.post<Record<string, unknown>>("/wp/v2/tags", defined(params));
      return jsonResult(slimTag(tag));
    }
  );

  // Update tag
  server.tool(
    "wp_update_tag",
    "Update a tag (only the given fields change)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().int().describe("Tag ID"),
      name: z.string().optional().describe("Tag name"),
      slug: z.string().optional().describe("URL slug"),
      description: z.string().optional().describe("Description"),
      meta,
    },
    async ({ site, id, ...params }) => {
      const wp = forSite(site);
      const tag = await wp.put<Record<string, unknown>>(`/wp/v2/tags/${id}`, defined(params));
      return jsonResult(slimTag(tag));
    }
  );

  // Delete tag
  server.tool(
    "wp_delete_tag",
    "Delete a tag permanently",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().int().describe("Tag ID"),
    },
    async ({ site, id }) => {
      const wp = forSite(site);
      // Terms cannot be trashed: WP answers 501 without force=true.
      await wp.delete<Record<string, unknown>>(`/wp/v2/tags/${id}`, { force: 1 });
      return jsonResult({ deleted: true, id });
    }
  );
}
