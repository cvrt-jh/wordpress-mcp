/**
 * Navigation menu management tools using mcp-endpoints plugin
 * Requires: mcp-endpoints WordPress plugin
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wpGet, wpPost, wpPut, wpDelete } from "../client.js";
import { jsonResult } from "../types.js";

export function register(server: McpServer) {
  // List menus
  server.tool(
    "mcp_list_menus",
    "List all navigation menus",
    {},
    async () => {
      const result = await wpGet<{
        menus: Array<{ id: number; name: string; slug: string; count: number; locations: string[] }>;
        count: number;
      }>("/mcp/v1/menus");
      return jsonResult(result);
    }
  );

  // Get menu locations
  server.tool(
    "mcp_get_menu_locations",
    "Get registered menu locations",
    {},
    async () => {
      const result = await wpGet<{
        locations: Array<{ location: string; description: string; menu_id: number | null }>;
        count: number;
      }>("/mcp/v1/menus/locations");
      return jsonResult(result);
    }
  );

  // Get menu with items
  server.tool(
    "mcp_get_menu",
    "Get a menu with all its items",
    {
      id: z.number().describe("Menu ID"),
    },
    async ({ id }) => {
      const result = await wpGet<{
        id: number;
        name: string;
        items: Array<{
          id: number;
          title: string;
          url: string;
          type: string;
          parent: number;
          position: number;
        }>;
      }>(`/mcp/v1/menus/${id}`);
      return jsonResult(result);
    }
  );

  // Create menu
  server.tool(
    "mcp_create_menu",
    "Create a new navigation menu",
    {
      name: z.string().describe("Menu name"),
    },
    async ({ name }) => {
      const result = await wpPost<{ id: number; name: string; created: boolean }>(
        "/mcp/v1/menus",
        { name }
      );
      return jsonResult(result);
    }
  );

  // Delete menu
  server.tool(
    "mcp_delete_menu",
    "Delete a navigation menu",
    {
      id: z.number().describe("Menu ID"),
    },
    async ({ id }) => {
      const result = await wpDelete<{ id: number; deleted: boolean }>(
        `/mcp/v1/menus/${id}`
      );
      return jsonResult(result);
    }
  );

  // Add menu item
  server.tool(
    "mcp_add_menu_item",
    "Add an item to a menu",
    {
      menu_id: z.number().describe("Menu ID"),
      title: z.string().describe("Menu item title"),
      url: z.string().optional().describe("URL for custom links"),
      object_type: z.enum(["custom", "post_type", "taxonomy"]).optional().default("custom").describe("Item type"),
      object: z.string().optional().describe("Object type (page, product_cat, etc.)"),
      object_id: z.number().optional().describe("Object ID"),
      parent: z.number().optional().default(0).describe("Parent menu item ID"),
      position: z.number().optional().describe("Position in menu"),
    },
    async ({ menu_id, title, url, object_type, object, object_id, parent, position }) => {
      const result = await wpPost<{ id: number; menu_id: number; created: boolean }>(
        `/mcp/v1/menus/${menu_id}/items`,
        { title, url, object_type, object, object_id, parent, position }
      );
      return jsonResult(result);
    }
  );

  // Delete menu item
  server.tool(
    "mcp_delete_menu_item",
    "Delete a menu item",
    {
      item_id: z.number().describe("Menu item ID"),
    },
    async ({ item_id }) => {
      const result = await wpDelete<{ id: number; deleted: boolean }>(
        `/mcp/v1/menus/items/${item_id}`
      );
      return jsonResult(result);
    }
  );

  // Assign menu to location
  server.tool(
    "mcp_assign_menu_location",
    "Assign a menu to a theme location",
    {
      menu_id: z.number().describe("Menu ID (0 to unassign)"),
      location: z.string().describe("Theme location slug"),
    },
    async ({ menu_id, location }) => {
      const result = await wpPost<{ location: string; menu_id: number; assigned: boolean }>(
        "/mcp/v1/menus/locations/assign",
        { menu_id, location }
      );
      return jsonResult(result);
    }
  );
}
