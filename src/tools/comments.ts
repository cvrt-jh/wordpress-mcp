import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { defined, jsonResult } from "../types.js";
import { slimComment } from "../slim.js";
import { toQuery } from "./posts.js";

const ids = (what: string) => z.array(z.number().int()).optional().describe(what);

/** Values WP_REST_Comments_Controller::handle_status_param understands on update. */
const UpdateStatusSchema = z.enum(["approve", "hold", "spam", "unspam", "trash", "untrash"]);

/** Comment fields writable on create and update (WP_REST_Comments_Controller::get_item_schema). */
const commentFields = {
  parent: z.number().int().optional().describe("Parent comment ID (for replies; 0 = top level)"),
  author: z.number().int().optional().describe("User ID of the author (instead of author_name/author_email)"),
  author_name: z.string().optional().describe("Author display name"),
  author_email: z.string().optional().describe("Author email"),
  author_url: z.string().optional().describe("Author website URL"),
  author_ip: z.string().optional().describe("Author IP address (requires moderate_comments)"),
  author_user_agent: z.string().optional().describe("Author user agent"),
  date: z.string().optional().describe("Date in the site timezone (ISO8601)"),
  date_gmt: z.string().optional().describe("Date in GMT (ISO8601)"),
  meta: z.record(z.string(), z.unknown()).optional().describe("Registered comment meta fields (show_in_rest) as key/value"),
};

const postPassword = z
  .string()
  .optional()
  .describe("Password of the post, if it is password protected (write-only, never returned)");

export function register(server: McpServer) {
  // List comments
  server.tool(
    "wp_list_comments",
    "List comments",
    {
      site: z.string().describe("Site id (see list_sites)"),
      per_page: z.number().int().optional().default(20).describe("Comments per page (max 100)"),
      page: z.number().int().optional().default(1).describe("Page number"),
      offset: z.number().int().optional().describe("Skip this many comments (overrides page)"),
      search: z.string().optional().describe("Search term"),
      post: ids("Limit to comments on these post IDs"),
      parent: ids("Limit to replies to these comment IDs ([0] = top level)"),
      parent_exclude: ids("Exclude replies to these comment IDs"),
      author: ids("Limit to comments by these user IDs"),
      author_exclude: ids("Exclude comments by these user IDs"),
      author_email: z.string().optional().describe("Limit to comments by this author email"),
      include: ids("Limit to these comment IDs"),
      exclude: ids("Exclude these comment IDs"),
      after: z.string().optional().describe("Published after this ISO8601 date"),
      before: z.string().optional().describe("Published before this ISO8601 date"),
      status: z
        .enum(["approve", "hold", "spam", "trash", "all"])
        .optional()
        .describe("Comment status (default approve; 'all' = approved and pending)"),
      type: z.string().optional().describe("Comment type: comment (default), pingback, trackback, note, ..."),
      password: postPassword,
      orderby: z
        .enum(["date", "date_gmt", "id", "include", "post", "parent", "type"])
        .optional()
        .describe("Sort field (default date_gmt)"),
      order: z.enum(["asc", "desc"]).optional().describe("Sort direction (default desc)"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const comments = await wp.get<unknown[]>("/wp/v2/comments", toQuery(params));
      return jsonResult(comments.map(slimComment));
    }
  );

  // Get comment
  server.tool(
    "wp_get_comment",
    "Get a comment by ID",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().int().describe("Comment ID"),
      password: postPassword,
    },
    async ({ site, id, password }) => {
      const wp = forSite(site);
      const comment = await wp.get<Record<string, unknown>>(`/wp/v2/comments/${id}`, toQuery({ password }));
      return jsonResult(slimComment(comment));
    }
  );

  // Create comment (reply)
  server.tool(
    "wp_create_comment",
    "Create a comment on a post (or a block note with type=note)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      post: z.number().int().describe("Post ID"),
      content: z.string().describe("Comment content"),
      status: z.enum(["approve", "hold", "spam", "trash"]).optional().describe("Initial status (requires moderate_comments)"),
      type: z.enum(["comment", "note"]).optional().describe("comment (default) or note (block editor note, WP 6.9+)"),
      ...commentFields,
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const comment = await wp.post<Record<string, unknown>>("/wp/v2/comments", defined(params));
      return jsonResult(slimComment(comment));
    }
  );

  // Update comment (approve, edit, etc.)
  server.tool(
    "wp_update_comment",
    "Update a comment (approve, edit content, move, ...); only the given fields change",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().int().describe("Comment ID"),
      content: z.string().optional().describe("Comment content"),
      status: UpdateStatusSchema.optional().describe("New status"),
      post: z.number().int().optional().describe("Move the comment to this post ID"),
      ...commentFields,
    },
    async ({ site, id, ...params }) => {
      const wp = forSite(site);
      const comment = await wp.put<Record<string, unknown>>(`/wp/v2/comments/${id}`, defined(params));
      return jsonResult(slimComment(comment));
    }
  );

  // Delete comment
  server.tool(
    "wp_delete_comment",
    "Delete a comment (moves to trash, or permanently if force=true)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().int().describe("Comment ID"),
      force: z.boolean().optional().default(false).describe("Bypass trash and delete permanently"),
      password: postPassword,
    },
    async ({ site, id, force, password }) => {
      const wp = forSite(site);
      await wp.delete<Record<string, unknown>>(`/wp/v2/comments/${id}`, toQuery({ force: force ? 1 : 0, password }));
      return jsonResult({ deleted: !!force, trashed: !force, id });
    }
  );

  // Moderate comments (batch approve/spam/trash)
  server.tool(
    "wp_moderate_comments",
    "Batch moderate comments by status",
    {
      site: z.string().describe("Site id (see list_sites)"),
      ids: z.array(z.number().int()).describe("Comment IDs"),
      status: UpdateStatusSchema.describe("New status"),
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
