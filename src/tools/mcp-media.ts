/**
 * Extended media management tools using cvrt-mcp-endpoints plugin
 * Requires: cvrt-mcp-endpoints WordPress plugin
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { defined, jsonResult } from "../types.js";

const site = z.string().describe("Site id (see list_sites)");
const mediaId = z.number().int().describe("Media (attachment) ID");

export interface MediaItem {
  id: number;
  title: string;
  url: string;
  mime_type: string;
  date: string;
  /** Images only. */
  alt?: string;
  width?: number | null;
  height?: number | null;
}

export function register(server: McpServer) {
  // List media with extended filters
  server.tool(
    "mcp_list_media",
    "List media library items (id, title, url, mime_type, date; images also alt, width, height) with paging totals",
    {
      site,
      per_page: z.number().int().min(1).optional().describe("Items per page (default 20)"),
      page: z.number().int().min(1).optional().describe("Page number (default 1)"),
      mime_type: z.string().optional().describe("Filter by MIME type or top-level type (image, video, audio, application, image/png)"),
      search: z.string().optional().describe("Search term"),
      // The endpoint runs orderby through sanitize_key (lowercase), so WP_Query's "ID" is unreachable.
      orderby: z
        .enum(["date", "modified", "title", "name", "author", "parent", "menu_order", "rand", "none"])
        .optional()
        .describe("Order by field (default date)"),
      order: z.enum(["ASC", "DESC"]).optional().describe("Sort direction (default DESC)"),
    },
    async ({ site, per_page, page, mime_type, search, orderby, order }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        media: MediaItem[];
        total: number;
        pages: number;
        page: number;
      }>("/mcp/v1/media", defined({ per_page, page, mime_type, search, orderby, order }));
      return jsonResult(result);
    }
  );

  // Get single media item with details
  server.tool(
    "mcp_get_media",
    "Get detailed media item info (caption, description, filename, filesize, image sizes, attached_to)",
    { site, id: mediaId },
    async ({ site, id }) => {
      const wp = forSite(site);
      const result = await wp.get<
        MediaItem & {
          caption: string;
          description: string;
          filename: string;
          filesize: number | null;
          sizes?: Record<string, { url: string; width: number; height: number }>;
          attached_to: number | null;
        }
      >(`/mcp/v1/media/${id}`);
      return jsonResult(result);
    }
  );

  // Sideload media from URL
  server.tool(
    "mcp_sideload_media",
    "Upload media to WordPress from a public external URL (private/internal hosts are refused)",
    {
      site,
      url: z.string().url().describe("Public URL of the file to download and import"),
      filename: z.string().optional().describe("Override filename (default: basename of the URL path)"),
      title: z.string().optional().describe("Media title"),
      alt: z.string().optional().describe("Alt text (for images)"),
      caption: z.string().optional().describe("Caption, plain text"),
      description: z.string().optional().describe("Description, plain text"),
    },
    async ({ site, url, filename, title, alt, caption, description }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        id: number;
        url: string;
        uploaded: boolean;
        source_url: string;
      }>("/mcp/v1/media/sideload", defined({ url, filename, title, alt, caption, description }));
      return jsonResult(result);
    }
  );

  // Update media metadata
  server.tool(
    "mcp_update_media",
    "Update media item metadata (title, alt text, caption, description). Only the given fields change.",
    {
      site,
      id: mediaId,
      title: z.string().optional().describe("Title"),
      alt: z.string().optional().describe("Alt text"),
      caption: z.string().optional().describe("Caption, plain text"),
      description: z.string().optional().describe("Description, plain text"),
    },
    async ({ site, id, title, alt, caption, description }) => {
      const wp = forSite(site);
      const result = await wp.put<{ id: number; updated: boolean }>(
        `/mcp/v1/media/${id}`,
        defined({ title, alt, caption, description })
      );
      return jsonResult(result);
    }
  );

  // Delete media
  server.tool(
    "mcp_delete_media",
    "Delete a media item and its files",
    {
      site,
      id: mediaId,
      force: z
        .boolean()
        .optional()
        .describe("Permanently delete (default true); false moves it to trash only when MEDIA_TRASH is enabled"),
    },
    async ({ site, id, force }) => {
      const wp = forSite(site);
      const result = await wp.delete<{ id: number; deleted: boolean }>(
        `/mcp/v1/media/${id}`,
        force === undefined ? undefined : { force: force ? 1 : 0 }
      );
      return jsonResult(result);
    }
  );

  // Bulk delete media
  server.tool(
    "mcp_bulk_delete_media",
    "Delete multiple media items at once. Returns the deleted and failed IDs.",
    {
      site,
      ids: z.array(z.number().int()).min(1).describe("Media IDs to delete"),
      force: z.boolean().optional().describe("Permanently delete (default true)"),
    },
    async ({ site, ids, force }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        deleted: number[];
        failed: number[];
        deleted_count: number;
      }>("/mcp/v1/media/bulk-delete", defined({ ids, force }));
      return jsonResult(result);
    }
  );

  // Regenerate thumbnails
  server.tool(
    "mcp_regenerate_thumbnails",
    "Regenerate image thumbnails for a media item (images only)",
    { site, id: z.number().int().describe("Image media ID") },
    async ({ site, id }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        id: number;
        regenerated: boolean;
        sizes: string[];
      }>(`/mcp/v1/media/${id}/regenerate`, {});
      return jsonResult(result);
    }
  );

  // Get media stats
  server.tool(
    "mcp_get_media_stats",
    "Get media library statistics (counts by MIME type, total size, upload path/url, max upload size)",
    { site },
    async ({ site }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        total: number;
        by_type: Record<string, number>;
        upload_path: string;
        upload_url: string;
        total_size_mb: number;
        max_upload_size: number;
        max_upload_size_mb: number;
      }>("/mcp/v1/media/stats");
      return jsonResult(result);
    }
  );
}
