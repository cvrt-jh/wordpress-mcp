import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { defined, jsonResult } from "../types.js";
import { slimUser } from "../slim.js";
import { toQuery } from "./posts.js";

// email and roles are edit-context fields: in the default view context WP
// leaves them out, so every read here asks for context=edit.
const EDIT = { context: "edit" } as const;

/** Writable user fields except username/email/password (WP_REST_Users_Controller::get_item_schema). */
const userFields = {
  name: z.string().optional().describe("Display name"),
  first_name: z.string().optional().describe("First name"),
  last_name: z.string().optional().describe("Last name"),
  url: z.string().optional().describe("Website URL"),
  description: z.string().optional().describe("Biographical info"),
  locale: z.string().optional().describe("Locale, e.g. de_DE ('' = site default); must be an installed language"),
  nickname: z.string().optional().describe("Nickname"),
  slug: z.string().optional().describe("URL slug (user_nicename)"),
  roles: z.array(z.string()).optional().describe("Roles, e.g. ['editor'] (replaces the current roles)"),
  meta: z.record(z.string(), z.unknown()).optional().describe("Registered user meta fields (show_in_rest) as key/value"),
};

export function register(server: McpServer) {
  // List users
  server.tool(
    "wp_list_users",
    "List WordPress users",
    {
      site: z.string().describe("Site id (see list_sites)"),
      per_page: z.number().int().optional().default(20).describe("Users per page (max 100)"),
      page: z.number().int().optional().default(1).describe("Page number"),
      offset: z.number().int().optional().describe("Skip this many users (overrides page)"),
      search: z.string().optional().describe("Search term"),
      search_columns: z
        .array(z.enum(["email", "name", "id", "username", "slug"]))
        .optional()
        .describe("Columns to search"),
      include: z.array(z.number().int()).optional().describe("Limit to these user IDs"),
      exclude: z.array(z.number().int()).optional().describe("Exclude these user IDs"),
      slug: z.array(z.string()).optional().describe("Limit to these slugs"),
      roles: z.array(z.string()).optional().describe("Limit to users with at least one of these roles"),
      capabilities: z.array(z.string()).optional().describe("Limit to users with at least one of these capabilities"),
      who: z.enum(["authors"]).optional().describe("'authors' = only users considered authors"),
      has_published_posts: z
        .union([z.boolean(), z.array(z.string())])
        .optional()
        .describe("true = only users with published posts, or a list of post types"),
      orderby: z
        .enum(["id", "include", "name", "registered_date", "slug", "include_slugs", "email", "url"])
        .optional()
        .default("name")
        .describe("Sort field"),
      order: z.enum(["asc", "desc"]).optional().default("asc").describe("Sort direction"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const users = await wp.get<unknown[]>("/wp/v2/users", { ...toQuery(params), ...EDIT });
      return jsonResult(users.map(slimUser));
    }
  );

  // Get current user (me)
  server.tool(
    "wp_me",
    "Get the currently authenticated user",
    { site: z.string().describe("Site id (see list_sites)") },
    async ({ site }) => {
      const wp = forSite(site);
      const user = await wp.get<Record<string, unknown>>("/wp/v2/users/me", EDIT);
      return jsonResult(slimUser(user));
    }
  );

  // Get user by ID
  server.tool(
    "wp_get_user",
    "Get a user by ID",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().int().describe("User ID"),
    },
    async ({ site, id }) => {
      const wp = forSite(site);
      const user = await wp.get<Record<string, unknown>>(`/wp/v2/users/${id}`, EDIT);
      return jsonResult(slimUser(user));
    }
  );

  // Create user
  server.tool(
    "wp_create_user",
    "Create a new WordPress user",
    {
      site: z.string().describe("Site id (see list_sites)"),
      username: z.string().describe("Username (login name, cannot be changed later)"),
      email: z.string().email().describe("Email address"),
      password: z.string().describe("Password (write-only, never returned)"),
      ...userFields,
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const user = await wp.post<Record<string, unknown>>("/wp/v2/users", defined(params));
      return jsonResult(slimUser(user));
    }
  );

  // Update user
  server.tool(
    "wp_update_user",
    "Update an existing user (only the given fields change)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().int().describe("User ID"),
      email: z.string().email().optional().describe("Email address"),
      password: z.string().optional().describe("New password (write-only, never returned)"),
      ...userFields,
    },
    async ({ site, id, ...params }) => {
      const wp = forSite(site);
      const user = await wp.put<Record<string, unknown>>(`/wp/v2/users/${id}`, defined(params));
      return jsonResult(slimUser(user));
    }
  );

  // Delete user
  server.tool(
    "wp_delete_user",
    "Delete a user permanently, reassigning their content to another user",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().int().describe("User ID to delete"),
      reassign: z.number().int().describe("User ID to reassign the deleted user's posts and links to"),
    },
    async ({ site, id, reassign }) => {
      const wp = forSite(site);
      // Users cannot be trashed: WP answers 501 without force=true.
      await wp.delete<Record<string, unknown>>(`/wp/v2/users/${id}`, { reassign, force: 1 });
      return jsonResult({ deleted: true, id, reassigned_to: reassign });
    }
  );
}
