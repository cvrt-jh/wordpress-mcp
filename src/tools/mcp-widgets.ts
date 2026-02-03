/**
 * Widget management tools using mcp-endpoints plugin
 * Requires: mcp-endpoints WordPress plugin
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wpGet, wpPost, wpPut, wpDelete } from "../client.js";
import { jsonResult } from "../types.js";

export function register(server: McpServer) {
  // List sidebars
  server.tool(
    "mcp_list_sidebars",
    "List all registered sidebars",
    {},
    async () => {
      const result = await wpGet<{
        sidebars: Array<{
          id: string;
          name: string;
          description: string;
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
      sidebar_id: z.string().describe("Sidebar ID"),
    },
    async ({ sidebar_id }) => {
      const result = await wpGet<{
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
    {},
    async () => {
      const result = await wpGet<{
        types: Array<{
          id_base: string;
          name: string;
          description: string;
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
      widget_id: z.string().describe("Widget ID (e.g., text-2)"),
    },
    async ({ widget_id }) => {
      const result = await wpGet<{
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
      sidebar_id: z.string().describe("Target sidebar ID"),
      widget_type: z.string().describe("Widget type (e.g., text, search)"),
      settings: z.record(z.unknown()).optional().default({}).describe("Widget settings"),
      position: z.number().optional().describe("Position in sidebar"),
    },
    async ({ sidebar_id, widget_type, settings, position }) => {
      const result = await wpPost<{ widget_id: string; sidebar_id: string; created: boolean }>(
        "/mcp/v1/widgets",
        { sidebar_id, widget_type, settings, position }
      );
      return jsonResult(result);
    }
  );

  // Update widget
  server.tool(
    "mcp_update_widget",
    "Update a widget's settings",
    {
      widget_id: z.string().describe("Widget ID"),
      settings: z.record(z.unknown()).describe("Settings to update"),
    },
    async ({ widget_id, settings }) => {
      const result = await wpPut<{ widget_id: string; updated: boolean }>(
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
      widget_id: z.string().describe("Widget ID"),
    },
    async ({ widget_id }) => {
      const result = await wpDelete<{ widget_id: string; deleted: boolean }>(
        `/mcp/v1/widgets/${encodeURIComponent(widget_id)}`
      );
      return jsonResult(result);
    }
  );

  // Move widget
  server.tool(
    "mcp_move_widget",
    "Move a widget to a different sidebar",
    {
      widget_id: z.string().describe("Widget ID"),
      sidebar_id: z.string().describe("Target sidebar ID"),
      position: z.number().optional().describe("Position in target sidebar"),
    },
    async ({ widget_id, sidebar_id, position }) => {
      const result = await wpPost<{
        widget_id: string;
        from_sidebar: string;
        to_sidebar: string;
        moved: boolean;
      }>(`/mcp/v1/widgets/${encodeURIComponent(widget_id)}/move`, { sidebar_id, position });
      return jsonResult(result);
    }
  );
}
