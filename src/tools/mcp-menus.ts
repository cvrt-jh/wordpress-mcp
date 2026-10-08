/**
 * Navigation menu management tools using cvrt-mcp-endpoints plugin
 * Requires: cvrt-mcp-endpoints WordPress plugin (1.14.2+ for the full
 * menu-item update: target, classes, xfn, attr_title, description, status,
 * and a partial update that keeps every field it is not given).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { defined, jsonResult } from "../types.js";

const site = z.string().describe("Site id (see list_sites)");

export interface MenuItem {
  id: number;
  title: string;
  url: string;
  type: string;
  object: string;
  object_id: number;
  parent: number;
  position: number;
  target: string;
  classes: string[];
  xfn: string;
  attr_title: string;
  description: string;
  status: string;
}

export function register(server: McpServer) {
  // List menus
  server.tool(
    "mcp_list_menus",
    "List all navigation menus (id, name, slug, item count, assigned locations)",
    { site },
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
    "Get registered menu locations and the menu assigned to each",
    { site },
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
    "Get a menu with all its items. Each item has id, title, url, type, object, object_id, parent, position, target, classes, xfn, attr_title, description, status.",
    {
      site,
      id: z.number().int().describe("Menu ID"),
    },
    async ({ site, id }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        id: number;
        name: string;
        slug: string;
        locations: string[];
        items: MenuItem[];
        count: number;
      }>(`/mcp/v1/menus/${id}`);
      return jsonResult(result);
    }
  );

  // Create menu
  server.tool(
    "mcp_create_menu",
    "Create a new navigation menu",
    {
      site,
      name: z.string().describe("Menu name"),
    },
    async ({ site, name }) => {
      const wp = forSite(site);
      const result = await wp.post<{ id: number; name: string; created: boolean }>("/mcp/v1/menus", { name });
      return jsonResult(result);
    }
  );

  // Delete menu
  server.tool(
    "mcp_delete_menu",
    "Delete a navigation menu",
    {
      site,
      id: z.number().int().describe("Menu ID"),
    },
    async ({ site, id }) => {
      const wp = forSite(site);
      const result = await wp.delete<{ id: number; deleted: boolean }>(`/mcp/v1/menus/${id}`);
      return jsonResult(result);
    }
  );

  // Add menu item
  server.tool(
    "mcp_add_menu_item",
    "Add an item to a menu. A custom link needs url; a page/post or term item needs object_type post_type/taxonomy plus object and object_id of an existing object. Only the given fields are sent; the plugin defaults the rest (object_type custom, parent 0, appended at the end). target, classes, xfn, attr_title, description and status are set afterwards with mcp_update_menu_item.",
    {
      site,
      menu_id: z.number().int().describe("Menu ID"),
      title: z.string().describe("Menu item label"),
      url: z.string().optional().describe("Link URL (custom links only)"),
      object_type: z
        .enum(["custom", "post_type", "taxonomy"])
        .optional()
        .describe("Item type: custom (link with url), post_type (page, post, CPT) or taxonomy (category, product_cat, ...). Plugin default: custom"),
      object: z.string().optional().describe("Post type or taxonomy slug of the linked object (page, post, category, product_cat, ...)"),
      object_id: z.number().int().optional().describe("ID of the linked post or term"),
      parent: z.number().int().optional().describe("Parent menu item ID (an item of the same menu; 0 = top level)"),
      position: z.number().int().optional().describe("Menu order position"),
    },
    async ({ site, menu_id, ...fields }) => {
      const wp = forSite(site);
      const result = await wp.post<{ id: number; menu_id: number; created: boolean }>(
        `/mcp/v1/menus/${menu_id}/items`,
        defined(fields)
      );
      return jsonResult(result);
    }
  );

  // Delete menu item
  server.tool(
    "mcp_delete_menu_item",
    "Delete a menu item. Its children move up to its own parent; the response lists them as reparented.",
    {
      site,
      item_id: z.number().int().describe("Menu item ID"),
    },
    async ({ site, item_id }) => {
      const wp = forSite(site);
      const result = await wp.delete<{ id: number; deleted: boolean; reparented: number[] }>(
        `/mcp/v1/menus/items/${item_id}`
      );
      return jsonResult(result);
    }
  );

  // Update menu
  server.tool(
    "mcp_update_menu",
    "Rename a navigation menu (the menu's description and parent are kept)",
    {
      site,
      id: z.number().int().describe("Menu ID"),
      name: z.string().min(1).describe("New menu name"),
    },
    async ({ site, id, name }) => {
      const wp = forSite(site);
      const result = await wp.put<{ id: number; updated: boolean }>(`/mcp/v1/menus/${id}`, { name });
      return jsonResult(result);
    }
  );

  // Update menu item
  server.tool(
    "mcp_update_menu_item",
    "Partially update a menu item: only the given fields are sent and changed, every other stored field (type, linked object, url, ...) is kept (cvrt-mcp-endpoints 1.14.2+). The linked object (type/object/object_id) cannot be changed here: delete the item and add a new one. The response lists the changed fields.",
    {
      site,
      item_id: z.number().int().describe("Menu item ID"),
      title: z.string().optional().describe("Menu item label (empty string = follow the linked page's title)"),
      url: z.string().optional().describe("Link URL. Only allowed on custom links; a page/term item answers 400 url_not_custom"),
      parent: z.number().int().optional().describe("Parent menu item ID (an item of the same menu; 0 = top level)"),
      position: z.number().int().optional().describe("Menu order position"),
      target: z.enum(["", "_blank"]).optional().describe('Link target: "_blank" opens in a new tab, "" in the same tab'),
      classes: z.string().optional().describe("CSS classes, space- or comma-separated (replaces the stored list; empty string clears)"),
      xfn: z.string().optional().describe("Link relationship (XFN rel values), space-separated, e.g. \"nofollow noopener\""),
      attr_title: z.string().optional().describe("Title attribute (tooltip) of the link"),
      description: z.string().optional().describe("Item description (shown by themes that render menu descriptions)"),
      status: z.enum(["publish", "draft"]).optional().describe("publish = visible, draft = hidden from the menu"),
    },
    async ({ site, item_id, ...fields }) => {
      const wp = forSite(site);
      const result = await wp.put<{ id: number; updated: boolean; changed: string[] }>(
        `/mcp/v1/menus/items/${item_id}`,
        defined(fields)
      );
      return jsonResult(result);
    }
  );

  // Assign menu to location
  server.tool(
    "mcp_assign_menu_location",
    "Assign a menu to a registered theme location (see mcp_get_menu_locations); menu_id 0 unassigns",
    {
      site,
      menu_id: z.number().int().min(0).describe("Menu ID (0 to unassign)"),
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
