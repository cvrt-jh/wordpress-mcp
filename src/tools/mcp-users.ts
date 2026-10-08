/**
 * Extended user management tools using cvrt-mcp-endpoints plugin
 * Requires: cvrt-mcp-endpoints WordPress plugin
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { defined, jsonResult } from "../types.js";

const site = z.string().describe("Site id (see list_sites)");
const userId = z.number().int().describe("User ID");

/** The error with every occurrence of the secret replaced, so a password never reaches the caller. */
function redact(err: unknown, secret: string | undefined): Error {
  const message = err instanceof Error ? err.message : String(err);
  if (!secret) return err instanceof Error ? err : new Error(message);
  return new Error(message.split(secret).join("[redacted]"));
}

export function register(server: McpServer) {
  // List users with extended filters
  server.tool(
    "mcp_list_users",
    "List WordPress users (id, username, email, display_name, first_name, last_name, roles, registered) with role/search filters. Returns { users, total, page }.",
    {
      site,
      role: z.string().optional().describe("Filter by role slug (administrator, editor, author, contributor, subscriber, or a custom role)"),
      per_page: z.number().int().min(1).optional().describe("Users per page (default 20)"),
      page: z.number().int().min(1).optional().describe("Page number (default 1)"),
      search: z.string().optional().describe("Search login, email, URL, nicename or display name (wildcard on both sides)"),
      orderby: z
        .enum(["registered", "login", "nicename", "email", "url", "display_name", "name", "post_count", "id"])
        .optional()
        .describe("Order by field (default registered)"),
      order: z.enum(["ASC", "DESC"]).optional().describe("Sort direction (default DESC)"),
    },
    async ({ site, role, per_page, page, search, orderby, order }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        users: Array<{
          id: number;
          username: string;
          email: string;
          display_name: string;
          first_name: string;
          last_name: string;
          roles: string[];
          registered: string;
        }>;
        total: number;
        page: number;
      }>("/mcp/v1/users", defined({ role, per_page, page, search, orderby, order }));
      return jsonResult(result);
    }
  );

  // Get single user
  server.tool(
    "mcp_get_user",
    "Get user details by ID (profile fields, roles, capabilities, registered, posts_count)",
    { site, id: userId },
    async ({ site, id }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        id: number;
        username: string;
        email: string;
        display_name: string;
        first_name: string;
        last_name: string;
        nickname: string;
        description: string;
        url: string;
        roles: string[];
        capabilities: string[];
        registered: string;
        posts_count: number;
      }>(`/mcp/v1/users/${id}`);
      return jsonResult(result);
    }
  );

  // Create user
  server.tool(
    "mcp_create_user",
    "Create a new WordPress user. Returns { id, username, created }; the password is never echoed.",
    {
      site,
      username: z.string().describe("Login username"),
      email: z.string().email().describe("Email address"),
      password: z
        .string()
        .optional()
        .describe(
          "Write-only password, never echoed (a strong one is generated if omitted). The endpoint sanitizes it as text: tags, %XX sequences and surrounding whitespace are stripped, so avoid them."
        ),
      first_name: z.string().optional().describe("First name"),
      last_name: z.string().optional().describe("Last name"),
      role: z.string().optional().describe("Role slug (default subscriber)"),
      send_notification: z.boolean().optional().describe("Send the new-user email with a set-password link (default true)"),
    },
    async ({ site, username, email, password, first_name, last_name, role, send_notification }) => {
      const wp = forSite(site);
      const secret = password && password !== "" ? password : undefined;
      try {
        const result = await wp.post<{ id: number; username: string; created: boolean }>(
          "/mcp/v1/users",
          defined({ username, email, password: secret, first_name, last_name, role, send_notification })
        );
        return jsonResult(result);
      } catch (err) {
        throw redact(err, secret);
      }
    }
  );

  // Update user
  server.tool(
    "mcp_update_user",
    "Update an existing user. Only the given fields change. Use mcp_change_user_role for the role.",
    {
      site,
      id: userId,
      email: z.string().email().optional().describe("Email address (must not belong to another user)"),
      first_name: z.string().optional().describe("First name"),
      last_name: z.string().optional().describe("Last name"),
      display_name: z.string().optional().describe("Public display name"),
      description: z.string().optional().describe("Biographical info, plain text"),
      url: z.string().optional().describe("Website URL"),
      password: z.string().optional().describe("Write-only new password, never echoed"),
    },
    async ({ site, id, email, first_name, last_name, display_name, description, url, password }) => {
      const wp = forSite(site);
      const secret = password && password !== "" ? password : undefined;
      try {
        const result = await wp.put<{ id: number; updated: boolean }>(
          `/mcp/v1/users/${id}`,
          defined({ email, first_name, last_name, display_name, description, url, password: secret })
        );
        return jsonResult(result);
      } catch (err) {
        throw redact(err, secret);
      }
    }
  );

  // Delete user
  server.tool(
    "mcp_delete_user",
    "Delete a user. WITHOUT reassign, all of the user's posts and links are deleted too. The current API user cannot delete itself.",
    {
      site,
      id: z.number().int().describe("User ID to delete"),
      reassign: z.number().int().optional().describe("User ID to reassign the deleted user's posts and links to (strongly recommended)"),
    },
    async ({ site, id, reassign }) => {
      const wp = forSite(site);
      const result = await wp.delete<{ id: number; deleted: boolean; posts_reassigned_to: number | null }>(
        `/mcp/v1/users/${id}`,
        reassign === undefined ? undefined : { reassign }
      );
      return jsonResult(result);
    }
  );

  // Get available roles
  server.tool(
    "mcp_list_roles",
    "List all available WordPress user roles (slug, name, capabilities, user count)",
    { site },
    async ({ site }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        roles: Array<{ slug: string; name: string; capabilities: string[]; count: number }>;
        count: number;
      }>("/mcp/v1/users/roles");
      return jsonResult(result);
    }
  );

  // Change user role
  server.tool(
    "mcp_change_user_role",
    "Change a user's role (replaces all current roles)",
    {
      site,
      id: userId,
      role: z.string().describe("New role slug (administrator, editor, author, contributor, subscriber, or a custom role; see mcp_list_roles)"),
    },
    async ({ site, id, role }) => {
      const wp = forSite(site);
      const result = await wp.put<{ id: number; role: string; updated: boolean }>(`/mcp/v1/users/${id}/role`, { role });
      return jsonResult(result);
    }
  );

  // Get user meta
  server.tool(
    "mcp_get_user_meta",
    "Get all meta data for a user (keys starting with _ are hidden; single values are flattened)",
    { site, id: userId },
    async ({ site, id }) => {
      const wp = forSite(site);
      const result = await wp.get<{ user_id: number; meta: Record<string, unknown> }>(`/mcp/v1/users/${id}/meta`);
      return jsonResult(result);
    }
  );

  // Update user meta
  server.tool(
    "mcp_update_user_meta",
    "Set meta data for a user (merged per key; keys are run through sanitize_key, so lowercase a-z0-9_-)",
    {
      site,
      id: userId,
      meta: z.record(z.unknown()).describe("Meta key-value pairs to set"),
    },
    async ({ site, id, meta }) => {
      const wp = forSite(site);
      const result = await wp.post<{ user_id: number; updated_keys: string[] }>(`/mcp/v1/users/${id}/meta`, { meta });
      return jsonResult(result);
    }
  );
}
