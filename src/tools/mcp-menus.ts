/**
 * Navigation menu management tools using cvrt-mcp-endpoints plugin
 * Requires: cvrt-mcp-endpoints WordPress plugin
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { jsonResult } from "../types.js";

export function register(server: McpServer) {
  // List menus
  server.tool(
    "mcp_list_menus",
    "List all navigation menus",
    {
      site: z.string().describe("Site id (see list_sites)"),
    },
    async ({ site }) => {
      const wp = forSite(site);
      const result = await wp.get<{
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
    {
      site: z.string().describe("Site id (see list_sites)"),
    },
    async ({ site }) => {
      const wp = forSite(site);
      const result = await wp.get<{
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
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Menu ID"),
    },
    async ({ site, id }) => {
      const wp = forSite(site);
      const result = await wp.get<{
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
      site: z.string().describe("Site id (see list_sites)"),
      name: z.string().describe("Menu name"),
    },
    async ({ site, name }) => {
      const wp = forSite(site);
      const result = await wp.post<{ id: number; name: string; created: boolean }>(
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
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Menu ID"),
    },
    async ({ site, id }) => {
      const wp = forSite(site);
      const result = await wp.delete<{ id: number; deleted: boolean }>(
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
      site: z.string().describe("Site id (see list_sites)"),
      menu_id: z.number().describe("Menu ID"),
      title: z.string().describe("Menu item title"),
      url: z.string().optional().describe("URL for custom links"),
      object_type: z.enum(["custom", "post_type", "taxonomy"]).optional().default("custom").describe("Item type"),
      object: z.string().optional().describe("Object type (page, product_cat, etc.)"),
      object_id: z.number().optional().describe("Object ID"),
      parent: z.number().optional().default(0).describe("Parent menu item ID"),
      position: z.number().optional().describe("Position in menu"),
    },
    async ({ site, menu_id, title, url, object_type, object, object_id, parent, position }) => {
      const wp = forSite(site);
      const result = await wp.post<{ id: number; menu_id: number; created: boolean }>(
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
      site: z.string().describe("Site id (see list_sites)"),
      item_id: z.number().describe("Menu item ID"),
    },
    async ({ site, item_id }) => {
      const wp = forSite(site);
      const result = await wp.delete<{ id: number; deleted: boolean }>(
        `/mcp/v1/menus/items/${item_id}`
      );
      return jsonResult(result);
    }
  );

  // Update menu
  server.tool(
    "mcp_update_menu",
    "Update a navigation menu (rename)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Menu ID"),
      name: z.string().describe("New menu name"),
    },
    async ({ site, id, name }) => {
      const wp = forSite(site);
      const result = await wp.put<{ id: number; updated: boolean }>(
        `/mcp/v1/menus/${id}`,
        { name }
      );
      return jsonResult(result);
    }
  );

  // Update menu item
  server.tool(
    "mcp_update_menu_item",
    "Update a menu item (title, URL, position, parent)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      item_id: z.number().describe("Menu item ID"),
      title: z.string().optional().describe("Menu item title"),
      url: z.string().optional().describe("URL for custom links"),
      parent: z.number().optional().describe("Parent menu item ID"),
      position: z.number().optional().describe("Position in menu"),
    },
    async ({ site, item_id, ...params }) => {
      const wp = forSite(site);
      const result = await wp.put<{ id: number; updated: boolean }>(
        `/mcp/v1/menus/items/${item_id}`,
        params
      );
      return jsonResult(result);
    }
  );

  // Assign menu to location
  server.tool(
    "mcp_assign_menu_location",
    "Assign a menu to a theme location",
    {
      site: z.string().describe("Site id (see list_sites)"),
      menu_id: z.number().describe("Menu ID (0 to unassign)"),
      location: z.string().describe("Theme location slug"),
    },
    async ({ site, menu_id, location }) => {
      const wp = forSite(site);
      const result = await wp.post<{ location: string; menu_id: number; assigned: boolean }>(
        "/mcp/v1/menus/locations/assign",
        { menu_id, location }
      );
      return jsonResult(result);
    }
  );
}
