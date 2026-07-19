/**
 * Extended user management tools using cvrt-mcp-endpoints plugin
 * Requires: cvrt-mcp-endpoints WordPress plugin
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { jsonResult } from "../types.js";

export function register(server: McpServer) {
  // List users with extended filters
  server.tool(
    "mcp_list_users",
    "List WordPress users with role/search filters",
    {
      site: z.string().describe("Site id (see list_sites)"),
      role: z.string().optional().describe("Filter by role (administrator, editor, etc.)"),
      per_page: z.number().optional().default(20).describe("Users per page"),
      page: z.number().optional().default(1).describe("Page number"),
      search: z.string().optional().describe("Search by name or email"),
      orderby: z.string().optional().default("registered").describe("Order by field"),
      order: z.enum(["ASC", "DESC"]).optional().default("DESC").describe("Sort direction"),
    },
    async ({ site, role, per_page, page, search, orderby, order }) => {
      const wp = forSite(site);
      const params: Record<string, string | number> = { per_page, page, orderby, order };
      if (role) params.role = role;
      if (search) params.search = search;
      const result = await wp.get<{
        users: unknown[];
        total: number;
        pages: number;
      }>("/mcp/v1/users", params);
      return jsonResult(result);
    }
  );

  // Get single user
  server.tool(
    "mcp_get_user",
    "Get user details by ID",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("User ID"),
    },
    async ({ site, id }) => {
      const wp = forSite(site);
      const result = await wp.get<Record<string, unknown>>(
        `/mcp/v1/users/${id}`
      );
      return jsonResult(result);
    }
  );

  // Create user
  server.tool(
    "mcp_create_user",
    "Create a new WordPress user",
    {
      site: z.string().describe("Site id (see list_sites)"),
      username: z.string().describe("Login username"),
      email: z.string().describe("Email address"),
      password: z.string().optional().describe("Password (auto-generated if omitted)"),
      first_name: z.string().optional().describe("First name"),
      last_name: z.string().optional().describe("Last name"),
      role: z.string().optional().default("subscriber").describe("User role"),
      send_notification: z.boolean().optional().default(true).describe("Send welcome email"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const result = await wp.post<Record<string, unknown>>(
        "/mcp/v1/users",
        params
      );
      return jsonResult(result);
    }
  );

  // Update user
  server.tool(
    "mcp_update_user",
    "Update an existing user",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("User ID"),
      email: z.string().optional().describe("Email address"),
      first_name: z.string().optional().describe("First name"),
      last_name: z.string().optional().describe("Last name"),
      password: z.string().optional().describe("New password"),
    },
    async ({ site, id, ...params }) => {
      const wp = forSite(site);
      const result = await wp.put<Record<string, unknown>>(
        `/mcp/v1/users/${id}`,
        params
      );
      return jsonResult(result);
    }
  );

  // Delete user
  server.tool(
    "mcp_delete_user",
    "Delete a user and reassign their content",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("User ID to delete"),
      reassign: z.number().optional().describe("User ID to reassign content to"),
    },
    async ({ site, id, reassign }) => {
      const wp = forSite(site);
      const result = await wp.delete<Record<string, unknown>>(
        `/mcp/v1/users/${id}`,
        reassign ? { reassign } : undefined
      );
      return jsonResult(result);
    }
  );

  // Get available roles
  server.tool(
    "mcp_list_roles",
    "List all available WordPress user roles",
    {
      site: z.string().describe("Site id (see list_sites)"),
    },
    async ({ site }) => {
      const wp = forSite(site);
      const result = await wp.get<Record<string, unknown>>(
        "/mcp/v1/users/roles"
      );
      return jsonResult(result);
    }
  );

  // Change user role
  server.tool(
    "mcp_change_user_role",
    "Change a user's role",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("User ID"),
      role: z.string().describe("New role (administrator, editor, author, contributor, subscriber)"),
    },
    async ({ site, id, role }) => {
      const wp = forSite(site);
      const result = await wp.put<Record<string, unknown>>(
        `/mcp/v1/users/${id}/role`,
        { role }
      );
      return jsonResult(result);
    }
  );

  // Get user meta
  server.tool(
    "mcp_get_user_meta",
    "Get all meta data for a user",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("User ID"),
    },
    async ({ site, id }) => {
      const wp = forSite(site);
      const result = await wp.get<Record<string, unknown>>(
        `/mcp/v1/users/${id}/meta`
      );
      return jsonResult(result);
    }
  );

  // Update user meta
  server.tool(
    "mcp_update_user_meta",
    "Update meta data for a user",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("User ID"),
      meta: z.record(z.unknown()).describe("Meta key-value pairs to set"),
    },
    async ({ site, id, meta }) => {
      const wp = forSite(site);
      const result = await wp.post<Record<string, unknown>>(
        `/mcp/v1/users/${id}/meta`,
        { meta }
      );
      return jsonResult(result);
    }
  );
}
