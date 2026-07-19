import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { jsonResult, PostStatusSchema } from "../types.js";
import { slimPage } from "../slim.js";

export function register(server: McpServer) {
  // List pages
  server.tool(
    "wp_list_pages",
    "List WordPress pages",
    {
      site: z.string().describe("Site id (see list_sites)"),
      per_page: z.number().optional().default(20).describe("Pages per request (max 100)"),
      page: z.number().optional().default(1).describe("Page number"),
      status: PostStatusSchema.optional().describe("Page status filter"),
      parent: z.number().optional().describe("Parent page ID (0 for top-level)"),
      orderby: z.enum(["date", "title", "modified", "menu_order"]).optional().default("menu_order"),
      order: z.enum(["asc", "desc"]).optional().default("asc"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const pages = await wp.get<unknown[]>("/wp/v2/pages", params as Record<string, string | number>);
      return jsonResult(pages.map(slimPage));
    }
  );

  // Get single page
  server.tool(
    "wp_get_page",
    "Get a single page by ID",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Page ID"),
      content: z.boolean().optional().default(false).describe("Include full content"),
    },
    async ({ site, id, content }) => {
      const wp = forSite(site);
      const page = await wp.get<Record<string, unknown>>(`/wp/v2/pages/${id}`);
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
      site: z.string().describe("Site id (see list_sites)"),
      title: z.string().describe("Page title"),
      content: z.string().optional().describe("Page content (HTML)"),
      status: PostStatusSchema.optional().default("draft").describe("Page status"),
      parent: z.number().optional().default(0).describe("Parent page ID"),
      menu_order: z.number().optional().default(0).describe("Menu order"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const page = await wp.post<Record<string, unknown>>("/wp/v2/pages", params);
      return jsonResult(slimPage(page));
    }
  );

  // Update page
  server.tool(
    "wp_update_page",
    "Update an existing page",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Page ID"),
      title: z.string().optional().describe("Page title"),
      content: z.string().optional().describe("Page content (HTML)"),
      status: PostStatusSchema.optional().describe("Page status"),
      parent: z.number().optional().describe("Parent page ID"),
      menu_order: z.number().optional().describe("Menu order"),
    },
    async ({ site, id, ...params }) => {
      const wp = forSite(site);
      const page = await wp.put<Record<string, unknown>>(`/wp/v2/pages/${id}`, params);
      return jsonResult(slimPage(page));
    }
  );

  // Delete page
  server.tool(
    "wp_delete_page",
    "Delete a page (moves to trash, or permanently if force=true)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Page ID"),
      force: z.boolean().optional().default(false).describe("Bypass trash and delete permanently"),
    },
    async ({ site, id, force }) => {
      const wp = forSite(site);
      const result = await wp.delete<Record<string, unknown>>(`/wp/v2/pages/${id}`, { force: force ? 1 : 0 });
      return jsonResult({ deleted: true, id });
    }
  );
}
