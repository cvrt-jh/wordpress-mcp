import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { jsonResult } from "../types.js";
import { slimComment } from "../slim.js";

export function register(server: McpServer) {
  // List comments
  server.tool(
    "wp_list_comments",
    "List comments",
    {
      site: z.string().describe("Site id (see list_sites)"),
      per_page: z.number().optional().default(20).describe("Comments per page"),
      page: z.number().optional().default(1).describe("Page number"),
      post: z.number().optional().describe("Filter by post ID"),
      status: z.enum(["approve", "hold", "spam", "trash"]).optional().describe("Comment status"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const comments = await wp.get<unknown[]>("/wp/v2/comments", params as Record<string, string | number>);
      return jsonResult(comments.map(slimComment));
    }
  );

  // Get comment
  server.tool(
    "wp_get_comment",
    "Get a comment by ID",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Comment ID"),
    },
    async ({ site, id }) => {
      const wp = forSite(site);
      const comment = await wp.get<Record<string, unknown>>(`/wp/v2/comments/${id}`);
      return jsonResult(slimComment(comment));
    }
  );

  // Create comment (reply)
  server.tool(
    "wp_create_comment",
    "Create a comment on a post",
    {
      site: z.string().describe("Site id (see list_sites)"),
      post: z.number().describe("Post ID"),
      content: z.string().describe("Comment content"),
      parent: z.number().optional().default(0).describe("Parent comment ID (for replies)"),
      author_name: z.string().optional().describe("Author name (if not logged in)"),
      author_email: z.string().optional().describe("Author email (if not logged in)"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const comment = await wp.post<Record<string, unknown>>("/wp/v2/comments", params);
      return jsonResult(slimComment(comment));
    }
  );

  // Update comment (approve, edit, etc.)
  server.tool(
    "wp_update_comment",
    "Update a comment (approve, edit content, etc.)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Comment ID"),
      content: z.string().optional().describe("Comment content"),
      status: z.enum(["approve", "hold", "spam", "trash"]).optional().describe("Comment status"),
    },
    async ({ site, id, ...params }) => {
      const wp = forSite(site);
      const comment = await wp.put<Record<string, unknown>>(`/wp/v2/comments/${id}`, params);
      return jsonResult(slimComment(comment));
    }
  );

  // Delete comment
  server.tool(
    "wp_delete_comment",
    "Delete a comment",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Comment ID"),
      force: z.boolean().optional().default(false).describe("Bypass trash and delete permanently"),
    },
    async ({ site, id, force }) => {
      const wp = forSite(site);
      await wp.delete<Record<string, unknown>>(`/wp/v2/comments/${id}`, { force: force ? 1 : 0 });
      return jsonResult({ deleted: true, id });
    }
  );

  // Moderate comments (batch approve/spam/trash)
  server.tool(
    "wp_moderate_comments",
    "Batch moderate comments by status",
    {
      site: z.string().describe("Site id (see list_sites)"),
      ids: z.array(z.number()).describe("Comment IDs"),
      status: z.enum(["approve", "hold", "spam", "trash"]).describe("New status"),
    },
    async ({ site, ids, status }) => {
      const wp = forSite(site);
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            await wp.put<Record<string, unknown>>(`/wp/v2/comments/${id}`, { status });
            return { id, success: true };
          } catch (e) {
            return { id, success: false, error: String(e) };
          }
        })
      );
      return jsonResult({ moderated: results });
    }
  );
}
