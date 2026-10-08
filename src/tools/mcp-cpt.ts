/**
 * Custom Post Type tools using cvrt-mcp-endpoints plugin
 * Requires: cvrt-mcp-endpoints WordPress plugin
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { defined, jsonResult } from "../types.js";

const site = z.string().describe("Site id (see list_sites)");
const type = z.string().regex(/^[a-zA-Z0-9_-]+$/).describe("Post type name (e.g. post, page, product, testimonial)");
const status = z
  .enum(["publish", "future", "draft", "pending", "private"])
  .describe("Post status");
// The endpoint runs orderby through sanitize_key (lowercase), so WP_Query's
// "ID" cannot be reached and is left out.
const orderby = z.enum([
  "date",
  "modified",
  "title",
  "name",
  "author",
  "parent",
  "type",
  "menu_order",
  "comment_count",
  "rand",
  "none",
]);

export function register(server: McpServer) {
  // List all registered post types
  server.tool(
    "mcp_list_post_types",
    "List all public post types (name, labels, hierarchical, has_archive, rest_base, supports, taxonomies, published count)",
    { site },
    async ({ site }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        post_types: Array<{
          name: string;
          label: string;
          singular: string;
          public: boolean;
          hierarchical: boolean;
          has_archive: boolean | string;
          rest_base: string;
          supports: Record<string, boolean>;
          taxonomies: string[];
          count: number;
        }>;
        count: number;
      }>("/mcp/v1/cpt");
      return jsonResult(result);
    }
  );

  // Get single post type schema
  server.tool(
    "mcp_get_post_type",
    "Get detailed schema for a post type (supports, taxonomies, counts per status, labels)",
    { site, type },
    async ({ site, type }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        name: string;
        label: string;
        singular: string;
        description: string;
        public: boolean;
        hierarchical: boolean;
        has_archive: boolean | string;
        rest_base: string;
        supports: Record<string, boolean>;
        taxonomies: string[];
        counts: { publish: number; draft: number; pending: number; private: number; trash: number };
        labels: { add_new: string; add_new_item: string; edit_item: string; view_item: string };
      }>(`/mcp/v1/cpt/${encodeURIComponent(type)}`);
      return jsonResult(result);
    }
  );

  // List posts of a specific type
  server.tool(
    "mcp_list_cpt_posts",
    "List posts of any post type (id, title, slug, status, date, modified, author, excerpt, parent) with paging totals",
    {
      site,
      type,
      per_page: z.number().int().min(1).optional().describe("Posts per page (default 20)"),
      page: z.number().int().min(1).optional().describe("Page number (default 1)"),
      status: z
        .string()
        .optional()
        .describe("Post status filter: any (default), publish, draft, pending, private, future, trash, or a comma-separated list"),
      orderby: orderby.optional().describe("Order by field (default date)"),
      order: z.enum(["ASC", "DESC"]).optional().describe("Sort direction (default DESC)"),
    },
    async ({ site, type, per_page, page, status, orderby, order }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        posts: Array<{
          id: number;
          title: string;
          slug: string;
          status: string;
          date: string;
          modified: string;
          author: number;
          excerpt: string;
          parent: number;
        }>;
        total: number;
        pages: number;
        page: number;
      }>(`/mcp/v1/cpt/${encodeURIComponent(type)}/posts`, defined({ per_page, page, status, orderby, order }));
      return jsonResult(result);
    }
  );

  // Create post of specific type
  server.tool(
    "mcp_create_cpt_post",
    "Create a post of any post type. Meta keys are run through sanitize_key (lowercase a-z0-9_-).",
    {
      site,
      type,
      title: z.string().describe("Post title"),
      content: z
        .string()
        .optional()
        .describe("Post content (default empty). Note: the endpoint sanitizes it as plain text, so HTML tags are stripped"),
      status: status.optional().describe("Post status (default draft)"),
      meta: z.record(z.unknown()).optional().describe("Post meta key-value pairs, written with update_post_meta"),
    },
    async ({ site, type, title, content, status, meta }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        id: number;
        created: boolean;
        edit_url: string;
      }>(`/mcp/v1/cpt/${encodeURIComponent(type)}/posts`, defined({ title, content, status, meta }));
      return jsonResult(result);
    }
  );

  // Update post of specific type
  server.tool(
    "mcp_update_cpt_post",
    "Update a post of any post type. Only the given fields change; meta keys are merged (update_post_meta per key).",
    {
      site,
      type,
      id: z.number().int().describe("Post ID"),
      title: z.string().optional().describe("Post title"),
      content: z
        .string()
        .optional()
        .describe("Post content. Note: the endpoint sanitizes it as plain text, so HTML tags are stripped"),
      status: status.optional(),
      meta: z.record(z.unknown()).optional().describe("Post meta key-value pairs to set"),
    },
    async ({ site, type, id, title, content, status, meta }) => {
      const wp = forSite(site);
      const result = await wp.put<{
        id: number;
        updated: boolean;
      }>(`/mcp/v1/cpt/${encodeURIComponent(type)}/posts/${id}`, defined({ title, content, status, meta }));
      return jsonResult(result);
    }
  );

  // Delete post of specific type
  server.tool(
    "mcp_delete_cpt_post",
    "Delete a post of any post type (moves to trash unless force is true)",
    {
      site,
      type,
      id: z.number().int().describe("Post ID"),
      force: z.boolean().optional().describe("Skip trash and permanently delete (default false)"),
    },
    async ({ site, type, id, force }) => {
      const wp = forSite(site);
      const result = await wp.delete<{
        id: number;
        deleted: boolean;
        trashed: boolean;
      }>(`/mcp/v1/cpt/${encodeURIComponent(type)}/posts/${id}`, force === undefined ? undefined : { force: force ? 1 : 0 });
      return jsonResult(result);
    }
  );
}
