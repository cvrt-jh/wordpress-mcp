import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wpGet, wpPost, wpPut, wpDelete } from "../client.js";
import { jsonResult } from "../types.js";
import { slimCategory, slimTag } from "../slim.js";

export function register(server: McpServer) {
  // === CATEGORIES ===

  // List categories
  server.tool(
    "wp_list_categories",
    "List all categories",
    {
      per_page: z.number().optional().default(100).describe("Categories per page"),
      parent: z.number().optional().describe("Parent category ID (0 for top-level)"),
      hide_empty: z.boolean().optional().default(false).describe("Hide categories with no posts"),
    },
    async ({ per_page, parent, hide_empty }) => {
      const params: Record<string, string | number> = { per_page };
      if (parent !== undefined) params.parent = parent;
      if (hide_empty) params.hide_empty = 1;
      const cats = await wpGet<unknown[]>("/wp/v2/categories", params);
      return jsonResult(cats.map(slimCategory));
    }
  );

  // Create category
  server.tool(
    "wp_create_category",
    "Create a new category",
    {
      name: z.string().describe("Category name"),
      slug: z.string().optional().describe("URL slug"),
      parent: z.number().optional().default(0).describe("Parent category ID"),
      description: z.string().optional().describe("Description"),
    },
    async (params) => {
      const cat = await wpPost<Record<string, unknown>>("/wp/v2/categories", params);
      return jsonResult(slimCategory(cat));
    }
  );

  // Update category
  server.tool(
    "wp_update_category",
    "Update a category",
    {
      id: z.number().describe("Category ID"),
      name: z.string().optional().describe("Category name"),
      slug: z.string().optional().describe("URL slug"),
      parent: z.number().optional().describe("Parent category ID"),
      description: z.string().optional().describe("Description"),
    },
    async ({ id, ...params }) => {
      const cat = await wpPut<Record<string, unknown>>(`/wp/v2/categories/${id}`, params);
      return jsonResult(slimCategory(cat));
    }
  );

  // Delete category
  server.tool(
    "wp_delete_category",
    "Delete a category",
    {
      id: z.number().describe("Category ID"),
    },
    async ({ id }) => {
      await wpDelete<Record<string, unknown>>(`/wp/v2/categories/${id}`, { force: 1 });
      return jsonResult({ deleted: true, id });
    }
  );

  // === TAGS ===

  // List tags
  server.tool(
    "wp_list_tags",
    "List all tags",
    {
      per_page: z.number().optional().default(100).describe("Tags per page"),
      search: z.string().optional().describe("Search term"),
      hide_empty: z.boolean().optional().default(false).describe("Hide tags with no posts"),
    },
    async ({ per_page, search, hide_empty }) => {
      const params: Record<string, string | number> = { per_page };
      if (search) params.search = search;
      if (hide_empty) params.hide_empty = 1;
      const tags = await wpGet<unknown[]>("/wp/v2/tags", params);
      return jsonResult(tags.map(slimTag));
    }
  );

  // Create tag
  server.tool(
    "wp_create_tag",
    "Create a new tag",
    {
      name: z.string().describe("Tag name"),
      slug: z.string().optional().describe("URL slug"),
      description: z.string().optional().describe("Description"),
    },
    async (params) => {
      const tag = await wpPost<Record<string, unknown>>("/wp/v2/tags", params);
      return jsonResult(slimTag(tag));
    }
  );

  // Update tag
  server.tool(
    "wp_update_tag",
    "Update a tag",
    {
      id: z.number().describe("Tag ID"),
      name: z.string().optional().describe("Tag name"),
      slug: z.string().optional().describe("URL slug"),
      description: z.string().optional().describe("Description"),
    },
    async ({ id, ...params }) => {
      const tag = await wpPut<Record<string, unknown>>(`/wp/v2/tags/${id}`, params);
      return jsonResult(slimTag(tag));
    }
  );

  // Delete tag
  server.tool(
    "wp_delete_tag",
    "Delete a tag",
    {
      id: z.number().describe("Tag ID"),
    },
    async ({ id }) => {
      await wpDelete<Record<string, unknown>>(`/wp/v2/tags/${id}`, { force: 1 });
      return jsonResult({ deleted: true, id });
    }
  );
}
