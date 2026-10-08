import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { defined, jsonResult } from "../types.js";
import { slimMedia } from "../slim.js";
import { postCollectionParams, toQuery, WriteStatusSchema } from "./posts.js";

export function register(server: McpServer) {
  // List media
  server.tool(
    "wp_list_media",
    "List media library items",
    {
      site: z.string().describe("Site id (see list_sites)"),
      per_page: z.number().int().optional().default(20).describe("Items per page (max 100)"),
      ...postCollectionParams,
      status: z
        .array(z.enum(["inherit", "private", "trash"]))
        .optional()
        .describe("Limit to these statuses (default inherit)"),
      media_type: z
        .array(z.enum(["image", "video", "text", "application", "audio"]))
        .optional()
        .describe("Limit to these media types"),
      mime_type: z.array(z.string()).optional().describe("Limit to these MIME types, e.g. ['image/webp']"),
      parent: z.array(z.number().int()).optional().describe("Limit to items attached to these post IDs ([0] = unattached)"),
      parent_exclude: z.array(z.number().int()).optional().describe("Exclude items attached to these post IDs"),
      orderby: z
        .enum(["author", "date", "id", "include", "modified", "parent", "relevance", "slug", "include_slugs", "title"])
        .optional()
        .default("date")
        .describe("Sort field"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const media = await wp.get<unknown[]>("/wp/v2/media", toQuery(params));
      return jsonResult(media.map(slimMedia));
    }
  );

  // Get single media item
  server.tool(
    "wp_get_media",
    "Get a media item by ID",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().int().describe("Media ID"),
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
    "Update media item metadata (title, alt text, caption, description, attachment, ...); only the given fields change",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().int().describe("Media ID"),
      title: z.string().optional().describe("Title"),
      alt_text: z.string().optional().describe("Alt text for images"),
      caption: z.string().optional().describe("Caption"),
      description: z.string().optional().describe("Description"),
      post: z.number().int().optional().describe("ID of the post the item is attached to (0 = unattached)"),
      slug: z.string().optional().describe("URL slug"),
      status: WriteStatusSchema.optional().describe("Status (media normally inherits its parent's; 'private' hides it)"),
      date: z.string().optional().describe("Date in the site timezone (ISO8601)"),
      date_gmt: z.string().optional().describe("Date in GMT (ISO8601)"),
      author: z.number().int().optional().describe("Author user ID"),
      featured_media: z.number().int().optional().describe("Cover image media ID (audio/video)"),
      comment_status: z.enum(["open", "closed"]).optional().describe("Whether comments are open"),
      ping_status: z.enum(["open", "closed"]).optional().describe("Whether pingbacks/trackbacks are open"),
      template: z.string().optional().describe("Theme template file for the attachment page"),
      meta: z.record(z.string(), z.unknown()).optional().describe("Registered meta fields (show_in_rest) as key/value"),
    },
    async ({ site, id, ...params }) => {
      const wp = forSite(site);
      const media = await wp.put<Record<string, unknown>>(`/wp/v2/media/${id}`, defined(params));
      return jsonResult(slimMedia(media));
    }
  );

  // Delete media
  server.tool(
    "wp_delete_media",
    "Delete a media item and its files",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().int().describe("Media ID"),
      force: z
        .boolean()
        .optional()
        .default(true)
        .describe("Permanently delete; media cannot be trashed unless MEDIA_TRASH is on, so false usually fails with 501"),
    },
    async ({ site, id, force }) => {
      const wp = forSite(site);
      await wp.delete<Record<string, unknown>>(`/wp/v2/media/${id}`, { force: force ? 1 : 0 });
      return jsonResult({ deleted: true, id });
    }
  );
}
