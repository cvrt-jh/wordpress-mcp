import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { jsonResult } from "../types.js";
import { slimMedia } from "../slim.js";

export function register(server: McpServer) {
  // List media
  server.tool(
    "wp_list_media",
    "List media library items",
    {
      site: z.string().describe("Site id (see list_sites)"),
      per_page: z.number().optional().default(20).describe("Items per page (max 100)"),
      page: z.number().optional().default(1).describe("Page number"),
      media_type: z.enum(["image", "video", "audio", "application"]).optional().describe("Filter by type"),
      search: z.string().optional().describe("Search term"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const media = await wp.get<unknown[]>("/wp/v2/media", params as Record<string, string | number>);
      return jsonResult(media.map(slimMedia));
    }
  );

  // Get single media item
  server.tool(
    "wp_get_media",
    "Get a media item by ID",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Media ID"),
    },
    async ({ site, id }) => {
      const wp = forSite(site);
      const media = await wp.get<Record<string, unknown>>(`/wp/v2/media/${id}`);
      return jsonResult(slimMedia(media));
    }
  );

  // Update media metadata
  server.tool(
    "wp_update_media",
    "Update media item metadata (title, alt text, caption)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Media ID"),
      title: z.string().optional().describe("Title"),
      alt_text: z.string().optional().describe("Alt text for images"),
      caption: z.string().optional().describe("Caption"),
      description: z.string().optional().describe("Description"),
    },
    async ({ site, id, ...params }) => {
      const wp = forSite(site);
      const media = await wp.put<Record<string, unknown>>(`/wp/v2/media/${id}`, params);
      return jsonResult(slimMedia(media));
    }
  );

  // Delete media
  server.tool(
    "wp_delete_media",
    "Delete a media item",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Media ID"),
      force: z.boolean().optional().default(true).describe("Permanently delete (bypass trash)"),
    },
    async ({ site, id, force }) => {
      const wp = forSite(site);
      await wp.delete<Record<string, unknown>>(`/wp/v2/media/${id}`, { force: force ? 1 : 0 });
      return jsonResult({ deleted: true, id });
    }
  );
}
