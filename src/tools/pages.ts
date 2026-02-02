import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wpGet, wpPost, wpPut, wpDelete } from "../client.js";
import { jsonResult, PostStatusSchema } from "../types.js";
import { slimPage } from "../slim.js";

export function register(server: McpServer) {
  // List pages
  server.tool(
    "wp_list_pages",
    "List WordPress pages",
    {
      per_page: z.number().optional().default(20).describe("Pages per request (max 100)"),
      page: z.number().optional().default(1).describe("Page number"),
      status: PostStatusSchema.optional().describe("Page status filter"),
      parent: z.number().optional().describe("Parent page ID (0 for top-level)"),
      orderby: z.enum(["date", "title", "modified", "menu_order"]).optional().default("menu_order"),
      order: z.enum(["asc", "desc"]).optional().default("asc"),
    },
    async (params) => {
      const pages = await wpGet<unknown[]>("/wp/v2/pages", params as Record<string, string | number>);
      return jsonResult(pages.map(slimPage));
    }
  );

  // Get single page
  server.tool(
    "wp_get_page",
    "Get a single page by ID",
    {
      id: z.number().describe("Page ID"),
      content: z.boolean().optional().default(false).describe("Include full content"),
    },
    async ({ id, content }) => {
      const page = await wpGet<Record<string, unknown>>(`/wp/v2/pages/${id}`);
      const result = slimPage(page);
      if (content && page.content) {
        result.content = (page.content as { rendered?: string }).rendered || "";
      }
      return jsonResult(result);
    }
  );

  // Create page
  server.tool(
    "wp_create_page",
    "Create a new WordPress page",
    {
      title: z.string().describe("Page title"),
      content: z.string().optional().describe("Page content (HTML)"),
      status: PostStatusSchema.optional().default("draft").describe("Page status"),
      parent: z.number().optional().default(0).describe("Parent page ID"),
      menu_order: z.number().optional().default(0).describe("Menu order"),
    },
    async (params) => {
      const page = await wpPost<Record<string, unknown>>("/wp/v2/pages", params);
      return jsonResult(slimPage(page));
    }
  );

  // Update page
  server.tool(
    "wp_update_page",
    "Update an existing page",
    {
      id: z.number().describe("Page ID"),
      title: z.string().optional().describe("Page title"),
      content: z.string().optional().describe("Page content (HTML)"),
      status: PostStatusSchema.optional().describe("Page status"),
      parent: z.number().optional().describe("Parent page ID"),
      menu_order: z.number().optional().describe("Menu order"),
    },
    async ({ id, ...params }) => {
      const page = await wpPut<Record<string, unknown>>(`/wp/v2/pages/${id}`, params);
      return jsonResult(slimPage(page));
    }
  );

  // Delete page
  server.tool(
    "wp_delete_page",
    "Delete a page (moves to trash, or permanently if force=true)",
    {
      id: z.number().describe("Page ID"),
      force: z.boolean().optional().default(false).describe("Bypass trash and delete permanently"),
    },
    async ({ id, force }) => {
      const result = await wpDelete<Record<string, unknown>>(`/wp/v2/pages/${id}`, { force: force ? 1 : 0 });
      return jsonResult({ deleted: true, id });
    }
  );
}
