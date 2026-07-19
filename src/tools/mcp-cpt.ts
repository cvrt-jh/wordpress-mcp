/**
 * Custom Post Type tools using cvrt-mcp-endpoints plugin
 * Requires: cvrt-mcp-endpoints WordPress plugin
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { jsonResult } from "../types.js";

export function register(server: McpServer) {
  // List all registered post types
  server.tool(
    "mcp_list_post_types",
    "List all public post types with their schema and counts",
    {
      site: z.string().describe("Site id (see list_sites)"),
    },
    async ({ site }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        post_types: Array<{
          name: string;
          label: string;
          singular: string;
          public: boolean;
          hierarchical: boolean;
          has_archive: boolean;
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
    "Get detailed schema for a post type",
    {
      site: z.string().describe("Site id (see list_sites)"),
      type: z.string().describe("Post type name (e.g., product, testimonial)"),
    },
    async ({ site, type }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        name: string;
        label: string;
        singular: string;
        description: string;
        public: boolean;
        hierarchical: boolean;
        has_archive: boolean;
        rest_base: string;
        supports: Record<string, boolean>;
        taxonomies: string[];
        counts: Record<string, number>;
        labels: Record<string, string>;
      }>(`/mcp/v1/cpt/${encodeURIComponent(type)}`);
      return jsonResult(result);
    }
  );

  // List posts of a specific type
  server.tool(
    "mcp_list_cpt_posts",
    "List posts of any custom post type",
    {
      site: z.string().describe("Site id (see list_sites)"),
      type: z.string().describe("Post type name"),
      per_page: z.number().optional().default(20).describe("Posts per page"),
      page: z.number().optional().default(1).describe("Page number"),
      status: z.string().optional().default("any").describe("Post status filter"),
      orderby: z.string().optional().default("date").describe("Order by field"),
      order: z.enum(["ASC", "DESC"]).optional().default("DESC").describe("Sort direction"),
    },
    async ({ site, type, ...params }) => {
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
      }>(`/mcp/v1/cpt/${encodeURIComponent(type)}/posts`, params);
      return jsonResult(result);
    }
  );

  // Create post of specific type
  server.tool(
    "mcp_create_cpt_post",
    "Create a post of any custom post type",
    {
      site: z.string().describe("Site id (see list_sites)"),
      type: z.string().describe("Post type name"),
      title: z.string().describe("Post title"),
      content: z.string().optional().default("").describe("Post content"),
      status: z.string().optional().default("draft").describe("Post status"),
      meta: z.record(z.unknown()).optional().default({}).describe("Post meta key-value pairs"),
    },
    async ({ site, type, ...params }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        id: number;
        created: boolean;
        edit_url: string;
      }>(`/mcp/v1/cpt/${encodeURIComponent(type)}/posts`, params);
      return jsonResult(result);
    }
  );

  // Update post of specific type
  server.tool(
    "mcp_update_cpt_post",
    "Update a custom post type post",
    {
      site: z.string().describe("Site id (see list_sites)"),
      type: z.string().describe("Post type name"),
      id: z.number().describe("Post ID"),
      title: z.string().optional().describe("Post title"),
      content: z.string().optional().describe("Post content"),
      status: z.string().optional().describe("Post status"),
      meta: z.record(z.unknown()).optional().describe("Post meta key-value pairs"),
    },
    async ({ site, type, id, ...params }) => {
      const wp = forSite(site);
      const result = await wp.put<{
        id: number;
        updated: boolean;
      }>(`/mcp/v1/cpt/${encodeURIComponent(type)}/posts/${id}`, params);
      return jsonResult(result);
    }
  );

  // Delete post of specific type
  server.tool(
    "mcp_delete_cpt_post",
    "Delete a custom post type post",
    {
      site: z.string().describe("Site id (see list_sites)"),
      type: z.string().describe("Post type name"),
      id: z.number().describe("Post ID"),
      force: z.boolean().optional().default(false).describe("Skip trash and permanently delete"),
    },
    async ({ site, type, id, force }) => {
      const wp = forSite(site);
      const result = await wp.delete<{
        id: number;
        deleted: boolean;
        trashed: boolean;
      }>(`/mcp/v1/cpt/${encodeURIComponent(type)}/posts/${id}`, { force: force ? 1 : 0 });
      return jsonResult(result);
    }
  );
}
