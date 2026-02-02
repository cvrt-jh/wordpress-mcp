import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wpGet, wpPost, wpPut, wpDelete } from "../client.js";
import { jsonResult } from "../types.js";
import { slimUser } from "../slim.js";

export function register(server: McpServer) {
  // List users
  server.tool(
    "wp_list_users",
    "List WordPress users",
    {
      per_page: z.number().optional().default(20).describe("Users per page (max 100)"),
      page: z.number().optional().default(1).describe("Page number"),
      roles: z.string().optional().describe("Filter by role(s), comma-separated"),
      search: z.string().optional().describe("Search by name or email"),
    },
    async (params) => {
      const users = await wpGet<unknown[]>("/wp/v2/users", params as Record<string, string | number>);
      return jsonResult(users.map(slimUser));
    }
  );

  // Get current user (me)
  server.tool(
    "wp_me",
    "Get the currently authenticated user",
    {},
    async () => {
      const user = await wpGet<Record<string, unknown>>("/wp/v2/users/me");
      return jsonResult(slimUser(user));
    }
  );

  // Get user by ID
  server.tool(
    "wp_get_user",
    "Get a user by ID",
    {
      id: z.number().describe("User ID"),
    },
    async ({ id }) => {
      const user = await wpGet<Record<string, unknown>>(`/wp/v2/users/${id}`);
      return jsonResult(slimUser(user));
    }
  );

  // Create user
  server.tool(
    "wp_create_user",
    "Create a new WordPress user",
    {
      username: z.string().describe("Username (login name)"),
      email: z.string().email().describe("Email address"),
      password: z.string().describe("Password"),
      name: z.string().optional().describe("Display name"),
      roles: z.array(z.string()).optional().describe("Roles (e.g., ['editor'])"),
    },
    async (params) => {
      const user = await wpPost<Record<string, unknown>>("/wp/v2/users", params);
      return jsonResult(slimUser(user));
    }
  );

  // Update user
  server.tool(
    "wp_update_user",
    "Update an existing user",
    {
      id: z.number().describe("User ID"),
      email: z.string().email().optional().describe("Email address"),
      name: z.string().optional().describe("Display name"),
      roles: z.array(z.string()).optional().describe("Roles"),
      password: z.string().optional().describe("New password"),
    },
    async ({ id, ...params }) => {
      const user = await wpPut<Record<string, unknown>>(`/wp/v2/users/${id}`, params);
      return jsonResult(slimUser(user));
    }
  );

  // Delete user
  server.tool(
    "wp_delete_user",
    "Delete a user (requires reassign parameter)",
    {
      id: z.number().describe("User ID to delete"),
      reassign: z.number().describe("User ID to reassign content to"),
    },
    async ({ id, reassign }) => {
      await wpDelete<Record<string, unknown>>(`/wp/v2/users/${id}`, { reassign, force: 1 });
      return jsonResult({ deleted: true, id, reassigned_to: reassign });
    }
  );
}
