import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { jsonResult, PostStatusSchema } from "../types.js";
import { slimPost } from "../slim.js";

export function register(server: McpServer) {
  // List posts
  server.tool(
    "wp_list_posts",
    "List WordPress posts with optional filters",
    {
      site: z.string().describe("Site id (see list_sites)"),
      per_page: z.number().optional().default(10).describe("Posts per page (max 100)"),
      page: z.number().optional().default(1).describe("Page number"),
      status: PostStatusSchema.optional().describe("Post status filter"),
      search: z.string().optional().describe("Search term"),
      categories: z.string().optional().describe("Category ID(s), comma-separated"),
      tags: z.string().optional().describe("Tag ID(s), comma-separated"),
      author: z.number().optional().describe("Author ID"),
      orderby: z.enum(["date", "title", "modified", "id"]).optional().default("date"),
      order: z.enum(["asc", "desc"]).optional().default("desc"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const posts = await wp.get<unknown[]>("/wp/v2/posts", params as Record<string, string | number>);
      return jsonResult(posts.map(slimPost));
    }
  );

  // Get single post
  server.tool(
    "wp_get_post",
    "Get a single post by ID",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Post ID"),
      content: z.boolean().optional().default(false).describe("Include full content"),
    },
    async ({ site, id, content }) => {
      const wp = forSite(site);
      const post = await wp.get<Record<string, unknown>>(`/wp/v2/posts/${id}`);
      const result = slimPost(post);
      if (content && post.content) {
        result.content = (post.content as { rendered?: string }).rendered || "";
      }
      return jsonResult(result);
    }
  );

  // Create post
  server.tool(
    "wp_create_post",
    "Create a new WordPress post",
    {
      site: z.string().describe("Site id (see list_sites)"),
      title: z.string().describe("Post title"),
      content: z.string().optional().describe("Post content (HTML)"),
      status: PostStatusSchema.optional().default("draft").describe("Post status"),
      excerpt: z.string().optional().describe("Post excerpt"),
      categories: z.array(z.number()).optional().describe("Category IDs"),
      tags: z.array(z.number()).optional().describe("Tag IDs"),
      featured_media: z.number().optional().describe("Featured image ID"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const post = await wp.post<Record<string, unknown>>("/wp/v2/posts", params);
      return jsonResult(slimPost(post));
    }
  );

  // Update post
  server.tool(
    "wp_update_post",
    "Update an existing post",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Post ID"),
      title: z.string().optional().describe("Post title"),
      content: z.string().optional().describe("Post content (HTML)"),
      status: PostStatusSchema.optional().describe("Post status"),
      excerpt: z.string().optional().describe("Post excerpt"),
      categories: z.array(z.number()).optional().describe("Category IDs"),
      tags: z.array(z.number()).optional().describe("Tag IDs"),
      featured_media: z.number().optional().describe("Featured image ID"),
    },
    async ({ site, id, ...params }) => {
      const wp = forSite(site);
      const post = await wp.put<Record<string, unknown>>(`/wp/v2/posts/${id}`, params);
      return jsonResult(slimPost(post));
    }
  );

  // Delete post
  server.tool(
    "wp_delete_post",
    "Delete a post (moves to trash, or permanently if force=true)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Post ID"),
      force: z.boolean().optional().default(false).describe("Bypass trash and delete permanently"),
    },
    async ({ site, id, force }) => {
      const wp = forSite(site);
      const result = await wp.delete<Record<string, unknown>>(`/wp/v2/posts/${id}`, { force: force ? 1 : 0 });
      return jsonResult({ deleted: true, id, previous: slimPost(result.previous || result) });
    }
  );

  // Search posts
  server.tool(
    "wp_search_posts",
    "Search posts by keyword",
    {
      site: z.string().describe("Site id (see list_sites)"),
      search: z.string().describe("Search term"),
      per_page: z.number().optional().default(10).describe("Results per page"),
    },
    async ({ site, search, per_page }) => {
      const wp = forSite(site);
      const posts = await wp.get<unknown[]>("/wp/v2/posts", { search, per_page });
      return jsonResult(posts.map(slimPost));
    }
  );
}
