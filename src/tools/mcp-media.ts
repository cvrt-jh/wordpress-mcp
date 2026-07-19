/**
 * Extended media management tools using cvrt-mcp-endpoints plugin
 * Requires: cvrt-mcp-endpoints WordPress plugin
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { jsonResult } from "../types.js";

export function register(server: McpServer) {
  // List media with extended filters
  server.tool(
    "mcp_list_media",
    "List media library items with filtering",
    {
      site: z.string().describe("Site id (see list_sites)"),
      per_page: z.number().optional().default(20).describe("Items per page"),
      page: z.number().optional().default(1).describe("Page number"),
      mime_type: z.string().optional().describe("Filter by MIME type (image, video, audio, application)"),
      search: z.string().optional().describe("Search term"),
      orderby: z.string().optional().default("date").describe("Order by field"),
      order: z.enum(["ASC", "DESC"]).optional().default("DESC").describe("Sort direction"),
    },
    async ({ site, per_page, page, mime_type, search, orderby, order }) => {
      const wp = forSite(site);
      const params: Record<string, string | number> = { per_page, page, orderby, order };
      if (mime_type) params.mime_type = mime_type;
      if (search) params.search = search;
      const result = await wp.get<{
        media: Array<{
          id: number;
          title: string;
          url: string;
          mime_type: string;
          date: string;
          alt?: string;
          width?: number;
          height?: number;
        }>;
        total: number;
        pages: number;
        page: number;
      }>("/mcp/v1/media", params);
      return jsonResult(result);
    }
  );

  // Get single media item with details
  server.tool(
    "mcp_get_media",
    "Get detailed media item info (sizes, metadata)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Media ID"),
    },
    async ({ site, id }) => {
      const wp = forSite(site);
      const result = await wp.get<Record<string, unknown>>(
        `/mcp/v1/media/${id}`
      );
      return jsonResult(result);
    }
  );

  // Sideload media from URL
  server.tool(
    "mcp_sideload_media",
    "Upload media to WordPress from an external URL",
    {
      site: z.string().describe("Site id (see list_sites)"),
      url: z.string().describe("URL of the file to download and import"),
      filename: z.string().optional().describe("Override filename"),
      title: z.string().optional().describe("Media title"),
      alt: z.string().optional().describe("Alt text (for images)"),
      caption: z.string().optional().describe("Caption"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        id: number;
        url: string;
        uploaded: boolean;
        source_url: string;
      }>("/mcp/v1/media/sideload", params);
      return jsonResult(result);
    }
  );

  // Update media metadata
  server.tool(
    "mcp_update_media",
    "Update media item metadata (title, alt text, caption)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Media ID"),
      title: z.string().optional().describe("Title"),
      alt: z.string().optional().describe("Alt text"),
      caption: z.string().optional().describe("Caption"),
      description: z.string().optional().describe("Description"),
    },
    async ({ site, id, ...params }) => {
      const wp = forSite(site);
      const result = await wp.put<{ id: number; updated: boolean }>(
        `/mcp/v1/media/${id}`,
        params
      );
      return jsonResult(result);
    }
  );

  // Delete media
  server.tool(
    "mcp_delete_media",
    "Delete a media item",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Media ID"),
      force: z.boolean().optional().default(true).describe("Permanently delete"),
    },
    async ({ site, id, force }) => {
      const wp = forSite(site);
      const result = await wp.delete<{ id: number; deleted: boolean }>(
        `/mcp/v1/media/${id}`,
        { force: force ? 1 : 0 }
      );
      return jsonResult(result);
    }
  );

  // Bulk delete media
  server.tool(
    "mcp_bulk_delete_media",
    "Delete multiple media items at once",
    {
      site: z.string().describe("Site id (see list_sites)"),
      ids: z.array(z.number()).describe("Array of media IDs to delete"),
      force: z.boolean().optional().default(true).describe("Permanently delete"),
    },
    async ({ site, ids, force }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        deleted: number[];
        failed: number[];
        deleted_count: number;
      }>("/mcp/v1/media/bulk-delete", { ids, force });
      return jsonResult(result);
    }
  );

  // Regenerate thumbnails
  server.tool(
    "mcp_regenerate_thumbnails",
    "Regenerate image thumbnails for a media item",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Image media ID"),
    },
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
    "Get media library statistics (counts by type, total size)",
    {
      site: z.string().describe("Site id (see list_sites)"),
    },
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
