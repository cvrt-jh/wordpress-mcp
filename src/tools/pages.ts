import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { defined, jsonResult } from "../types.js";
import { slimPage } from "../slim.js";
import {
  contentOf,
  ListStatusSchema,
  postCollectionParams,
  postWriteFields,
  toQuery,
  WriteStatusSchema,
} from "./posts.js";

const pageOnlyFields = {
  parent: z.number().int().optional().describe("Parent page ID (0 = top level)"),
  menu_order: z.number().int().optional().describe("Order among sibling pages"),
};

export function register(server: McpServer) {
  // List pages
  server.tool(
    "wp_list_pages",
    "List WordPress pages",
    {
      site: z.string().describe("Site id (see list_sites)"),
      per_page: z.number().int().optional().default(20).describe("Pages per request (max 100)"),
      ...postCollectionParams,
      order: z.enum(["asc", "desc"]).optional().default("asc").describe("Sort direction"),
      status: ListStatusSchema,
      parent: z.array(z.number().int()).optional().describe("Limit to children of these page IDs ([0] = top level)"),
      parent_exclude: z.array(z.number().int()).optional().describe("Exclude children of these page IDs"),
      menu_order: z.number().int().optional().describe("Limit to pages with this menu_order"),
      orderby: z
        .enum(["author", "date", "id", "include", "modified", "parent", "relevance", "slug", "include_slugs", "title", "menu_order"])
        .optional()
        .default("menu_order")
        .describe("Sort field"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const pages = await wp.get<unknown[]>("/wp/v2/pages", toQuery(params));
      return jsonResult(pages.map(slimPage));
    }
  );

  // Get single page
  server.tool(
    "wp_get_page",
    "Get a single page by ID (content, when requested, is the raw stored markup)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().int().describe("Page ID"),
      content: z.boolean().optional().default(false).describe("Include the full content (raw block markup, safe to edit and send back)"),
    },
    async ({ site, id, content }) => {
      const wp = forSite(site);
      const page = await wp.get<Record<string, unknown>>(`/wp/v2/pages/${id}`, { context: "edit" });
      const result = slimPage(page);
      if (content && page.content) result.content = contentOf(page);
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
      status: WriteStatusSchema.optional().default("draft").describe("Page status (default draft)"),
      ...postWriteFields,
      ...pageOnlyFields,
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const page = await wp.post<Record<string, unknown>>("/wp/v2/pages", defined(params));
      return jsonResult(slimPage(page));
    }
  );

  // Update page
  server.tool(
    "wp_update_page",
    "Update an existing page (only the given fields change)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().int().describe("Page ID"),
      title: z.string().optional().describe("Page title"),
      status: WriteStatusSchema.optional().describe("Page status"),
      ...postWriteFields,
      ...pageOnlyFields,
    },
    async ({ site, id, ...params }) => {
      const wp = forSite(site);
      const page = await wp.put<Record<string, unknown>>(`/wp/v2/pages/${id}`, defined(params));
      return jsonResult(slimPage(page));
    }
  );

  // Delete page
  server.tool(
    "wp_delete_page",
    "Delete a page (moves to trash, or permanently if force=true)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().int().describe("Page ID"),
      force: z.boolean().optional().default(false).describe("Bypass trash and delete permanently"),
    },
    async ({ site, id, force }) => {
      const wp = forSite(site);
      await wp.delete<Record<string, unknown>>(`/wp/v2/pages/${id}`, { force: force ? 1 : 0 });
      return jsonResult({ deleted: !!force, trashed: !force, id });
    }
  );
}
