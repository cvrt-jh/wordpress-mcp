import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wpGet, wpPost, wpPut, wpDelete } from "../client.js";
import { jsonResult } from "../types.js";
import { slimMedia } from "../slim.js";

export function register(server: McpServer) {
  // List media
  server.tool(
    "wp_list_media",
    "List media library items",
    {
      per_page: z.number().optional().default(20).describe("Items per page (max 100)"),
      page: z.number().optional().default(1).describe("Page number"),
      media_type: z.enum(["image", "video", "audio", "application"]).optional().describe("Filter by type"),
      search: z.string().optional().describe("Search term"),
    },
    async (params) => {
      const media = await wpGet<unknown[]>("/wp/v2/media", params as Record<string, string | number>);
      return jsonResult(media.map(slimMedia));
    }
  );

  // Get single media item
  server.tool(
    "wp_get_media",
    "Get a media item by ID",
    {
      id: z.number().describe("Media ID"),
    },
    async ({ id }) => {
      const media = await wpGet<Record<string, unknown>>(`/wp/v2/media/${id}`);
      return jsonResult(slimMedia(media));
    }
  );

  // Update media metadata
  server.tool(
    "wp_update_media",
    "Update media item metadata (title, alt text, caption)",
    {
      id: z.number().describe("Media ID"),
      title: z.string().optional().describe("Title"),
      alt_text: z.string().optional().describe("Alt text for images"),
      caption: z.string().optional().describe("Caption"),
      description: z.string().optional().describe("Description"),
    },
    async ({ id, ...params }) => {
      const media = await wpPut<Record<string, unknown>>(`/wp/v2/media/${id}`, params);
      return jsonResult(slimMedia(media));
    }
  );

  // Delete media
  server.tool(
    "wp_delete_media",
    "Delete a media item",
    {
      id: z.number().describe("Media ID"),
      force: z.boolean().optional().default(true).describe("Permanently delete (bypass trash)"),
    },
    async ({ id, force }) => {
      await wpDelete<Record<string, unknown>>(`/wp/v2/media/${id}`, { force: force ? 1 : 0 });
      return jsonResult({ deleted: true, id });
    }
  );
}
