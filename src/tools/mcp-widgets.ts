/**
 * Widget management tools using cvrt-mcp-endpoints plugin
 * Requires: cvrt-mcp-endpoints WordPress plugin
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { defined, jsonResult } from "../types.js";

export function register(server: McpServer) {
  // List sidebars
  server.tool(
    "mcp_list_sidebars",
    "List all registered sidebars",
    {
      site: z.string().describe("Site id (see list_sites)"),
    },
    async ({ site }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        sidebars: Array<{
          id: string;
          name: string;
          description: string;
          class: string;
          widget_count: number;
        }>;
        count: number;
      }>("/mcp/v1/widgets/sidebars");
      return jsonResult(result);
    }
  );

  // Get sidebar widgets
  server.tool(
    "mcp_get_sidebar_widgets",
    "Get all widgets in a sidebar",
    {
      site: z.string().describe("Site id (see list_sites)"),
      sidebar_id: z.string().describe("Sidebar ID"),
    },
    async ({ site, sidebar_id }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        sidebar: { id: string; name: string };
        widgets: Array<{
          id: string;
          type: string;
          name: string;
          settings: Record<string, unknown>;
        }>;
        count: number;
      }>(`/mcp/v1/widgets/sidebars/${encodeURIComponent(sidebar_id)}`);
      return jsonResult(result);
    }
  );

  // List widget types
  server.tool(
    "mcp_list_widget_types",
    "List all available widget types",
    {
      site: z.string().describe("Site id (see list_sites)"),
    },
    async ({ site }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        types: Array<{
          id_base: string;
          name: string;
          description: string;
          class: string;
        }>;
        count: number;
      }>("/mcp/v1/widgets/types");
      return jsonResult(result);
    }
  );

  // Get widget
  server.tool(
    "mcp_get_widget",
    "Get a widget's details",
    {
      site: z.string().describe("Site id (see list_sites)"),
      widget_id: z.string().describe("Widget ID (e.g., text-2)"),
    },
    async ({ site, widget_id }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        id: string;
        type: string;
        name: string;
        settings: Record<string, unknown>;
        sidebar_id: string | null;
      }>(`/mcp/v1/widgets/${encodeURIComponent(widget_id)}`);
      return jsonResult(result);
    }
  );

  // Add widget
  server.tool(
    "mcp_add_widget",
    "Add a widget to a sidebar",
    {
      site: z.string().describe("Site id (see list_sites)"),
      sidebar_id: z.string().describe("Target sidebar ID"),
      widget_type: z.string().describe("Widget type id_base (e.g., text, search; see mcp_list_widget_types)"),
      settings: z
        .record(z.unknown())
        .optional()
        .default({})
        .describe("Widget instance settings, e.g. { title, text } for a text widget (default {})"),
      position: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("0-based position in the sidebar (default: append at the end)"),
    },
    async ({ site, sidebar_id, widget_type, settings, position }) => {
      const wp = forSite(site);
      const result = await wp.post<{ widget_id: string; sidebar_id: string; created: boolean }>(
        "/mcp/v1/widgets",
        defined({ sidebar_id, widget_type, settings, position })
      );
      return jsonResult(result);
    }
  );

  // Update widget
  server.tool(
    "mcp_update_widget",
    "Update a widget's settings. The given keys are merged into the stored settings; keys not given are kept.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      widget_id: z.string().describe("Widget ID"),
      settings: z.record(z.unknown()).describe("Settings keys to change (merged into the existing settings)"),
    },
    async ({ site, widget_id, settings }) => {
      const wp = forSite(site);
      const result = await wp.put<{ widget_id: string; updated: boolean }>(
        `/mcp/v1/widgets/${encodeURIComponent(widget_id)}`,
        { settings }
      );
      return jsonResult(result);
    }
  );

  // Delete widget
  server.tool(
    "mcp_delete_widget",
    "Remove a widget from its sidebar",
    {
      site: z.string().describe("Site id (see list_sites)"),
      widget_id: z.string().describe("Widget ID"),
    },
    async ({ site, widget_id }) => {
      const wp = forSite(site);
      const result = await wp.delete<{ widget_id: string; deleted: boolean }>(
        `/mcp/v1/widgets/${encodeURIComponent(widget_id)}`
      );
      return jsonResult(result);
    }
  );

  // Reorder widgets in sidebar
  server.tool(
    "mcp_reorder_widgets",
    "Set the widget order of a sidebar. Pass the COMPLETE list: widgets of the sidebar left out are removed from it (their settings stay, but they end up in no sidebar, not even Inactive Widgets).",
    {
      site: z.string().describe("Site id (see list_sites)"),
      sidebar_id: z.string().describe("Sidebar ID"),
      widget_ids: z.array(z.string()).describe("All widget IDs of the sidebar in the new order (each must already be in this sidebar)"),
    },
    async ({ site, sidebar_id, widget_ids }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        sidebar_id: string;
        widget_ids: string[];
        reordered: boolean;
      }>(`/mcp/v1/widgets/sidebars/${encodeURIComponent(sidebar_id)}/reorder`, { widget_ids });
      return jsonResult(result);
    }
  );

  // Move widget
  server.tool(
    "mcp_move_widget",
    "Move a widget to a different sidebar",
    {
      site: z.string().describe("Site id (see list_sites)"),
      widget_id: z.string().describe("Widget ID"),
      sidebar_id: z.string().describe("Target sidebar ID"),
      position: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("0-based position in the target sidebar (default: append at the end)"),
    },
    async ({ site, widget_id, sidebar_id, position }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        widget_id: string;
        from_sidebar: string;
        to_sidebar: string;
        moved: boolean;
      }>(`/mcp/v1/widgets/${encodeURIComponent(widget_id)}/move`, defined({ sidebar_id, position }));
      return jsonResult(result);
    }
  );
}
