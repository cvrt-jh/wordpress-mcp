/**
 * Elementor page builder tools using cvrt-mcp-endpoints plugin
 * Requires: cvrt-mcp-endpoints WordPress plugin + Elementor active
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { jsonResult } from "../types.js";

export function register(server: McpServer) {
  // Get page build tree
  server.tool(
    "mcp_get_elementor_build",
    "Get full Elementor page build (containers, widgets, settings tree)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Post/page ID"),
      fields: z.string().optional().default("").describe("Comma-separated setting keys to include (empty = all)"),
    },
    async ({ site, id, fields }) => {
      const wp = forSite(site);
      const params: Record<string, string | number> = {};
      if (fields) params.fields = fields;
      const result = await wp.get<{
        post_id: number;
        title: string;
        edit_mode: string;
        template_type: string;
        element_count: number;
        widget_count: number;
        elements: unknown[];
      }>(`/mcp/v1/elementor/posts/${id}`, params);
      return jsonResult(result);
    }
  );

  // Get flat element list
  server.tool(
    "mcp_get_elementor_flat",
    "Get flat list of all Elementor elements on a page (easier to search/filter than tree)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Post/page ID"),
      widget_type: z.string().optional().default("").describe("Filter by widget type (heading, button, image, etc.)"),
      el_type: z.string().optional().default("").describe("Filter by element type (container, widget)"),
      fields: z.string().optional().default("").describe("Comma-separated setting keys to include"),
    },
    async ({ site, id, widget_type, el_type, fields }) => {
      const wp = forSite(site);
      const params: Record<string, string | number> = {};
      if (widget_type) params.widget_type = widget_type;
      if (el_type) params.el_type = el_type;
      if (fields) params.fields = fields;
      const result = await wp.get<{
        post_id: number;
        elements: Array<{
          id: string;
          elType: string;
          widgetType: string | null;
          parent_id: string | null;
          depth: number;
          settings: Record<string, unknown>;
        }>;
        total: number;
      }>(`/mcp/v1/elementor/posts/${id}/flat`, params);
      return jsonResult(result);
    }
  );

  // Get single element
  server.tool(
    "mcp_get_elementor_element",
    "Get a single Elementor element with full settings",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Post/page ID"),
      element_id: z.string().describe("Elementor element ID (8-char hex)"),
    },
    async ({ site, id, element_id }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        post_id: number;
        element: {
          id: string;
          elType: string;
          widgetType: string | null;
          parent_id: string | null;
          settings: Record<string, unknown>;
          children: string[];
        };
      }>(`/mcp/v1/elementor/posts/${id}/elements/${element_id}`);
      return jsonResult(result);
    }
  );

  // Update element settings
  server.tool(
    "mcp_update_elementor_element",
    "Update settings on a single Elementor element (merge, not replace)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Post/page ID"),
      element_id: z.string().describe("Elementor element ID"),
      settings: z.record(z.unknown()).describe("Settings to merge into the element"),
    },
    async ({ site, id, element_id, settings }) => {
      const wp = forSite(site);
      const result = await wp.put<{
        post_id: number;
        element_id: string;
        updated: boolean;
        element: Record<string, unknown>;
      }>(`/mcp/v1/elementor/posts/${id}/elements/${element_id}`, { settings });
      return jsonResult(result);
    }
  );

  // Get page settings
  server.tool(
    "mcp_get_elementor_page_settings",
    "Get Elementor page-level settings (hide title, custom CSS, etc.)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Post/page ID"),
    },
    async ({ site, id }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        post_id: number;
        edit_mode: string;
        template_type: string;
        settings: Record<string, unknown>;
      }>(`/mcp/v1/elementor/posts/${id}/settings`);
      return jsonResult(result);
    }
  );

  // Update page settings
  server.tool(
    "mcp_update_elementor_page_settings",
    "Update Elementor page-level settings",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Post/page ID"),
      settings: z.record(z.unknown()).describe("Settings to merge"),
    },
    async ({ site, id, settings }) => {
      const wp = forSite(site);
      const result = await wp.put<{
        post_id: number;
        updated: boolean;
        settings: Record<string, unknown>;
      }>(`/mcp/v1/elementor/posts/${id}/settings`, { settings });
      return jsonResult(result);
    }
  );

  // List templates
  server.tool(
    "mcp_list_elementor_templates",
    "List all Elementor library templates (headers, footers, singles, loop items, popups)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      type: z.string().optional().default("").describe("Filter by type (header, footer, single, archive, loop-item, page, popup)"),
    },
    async ({ site, type }) => {
      const wp = forSite(site);
      const params: Record<string, string | number> = {};
      if (type) params.type = type;
      const result = await wp.get<{
        templates: Array<{
          id: number;
          title: string;
          type: string;
          conditions: string[];
          status: string;
          date: string;
        }>;
        count: number;
      }>("/mcp/v1/elementor/templates", params);
      return jsonResult(result);
    }
  );

  // Get template conditions
  server.tool(
    "mcp_get_elementor_conditions",
    "Get theme builder display conditions for an Elementor template",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Template post ID"),
    },
    async ({ site, id }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        template_id: number;
        title: string;
        type: string;
        conditions: string[];
      }>(`/mcp/v1/elementor/templates/${id}/conditions`);
      return jsonResult(result);
    }
  );

  // Get global kit
  server.tool(
    "mcp_get_elementor_kit",
    "Get Elementor global kit settings (colors, fonts, typography, spacing, button defaults)",
    {
      site: z.string().describe("Site id (see list_sites)"),
    },
    async ({ site }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        kit_id: number;
        title: string;
        settings: Record<string, unknown>;
      }>("/mcp/v1/elementor/kit");
      return jsonResult(result);
    }
  );

  // Update global kit
  server.tool(
    "mcp_update_elementor_kit",
    "Update Elementor global kit settings (colors, fonts, typography)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      settings: z.record(z.unknown()).describe("Kit settings to merge"),
    },
    async ({ site, settings }) => {
      const wp = forSite(site);
      const result = await wp.put<{
        kit_id: number;
        updated: boolean;
        settings: Record<string, unknown>;
      }>("/mcp/v1/elementor/kit", { settings });
      return jsonResult(result);
    }
  );

  // Search across pages
  server.tool(
    "mcp_search_elementor",
    "Search all Elementor pages for specific widgets, settings, or text content",
    {
      site: z.string().describe("Site id (see list_sites)"),
      widget_type: z.string().optional().default("").describe("Filter by widget type (heading, button, image, etc.)"),
      setting: z.string().optional().default("").describe("Setting key to search in"),
      contains: z.string().optional().default("").describe("Text to search for in setting values"),
      post_type: z.string().optional().default("any").describe("Limit to specific post type"),
      per_page: z.number().optional().default(50).describe("Max results"),
    },
    async ({ site, widget_type, setting, contains, post_type, per_page }) => {
      const wp = forSite(site);
      const params: Record<string, string | number> = { per_page };
      if (widget_type) params.widget_type = widget_type;
      if (setting) params.setting = setting;
      if (contains) params.contains = contains;
      if (post_type !== "any") params.post_type = post_type;
      const result = await wp.get<{
        results: Array<{
          post_id: number;
          post_title: string;
          element_id: string;
          widgetType: string;
          matched_setting?: string;
          matched_value?: unknown;
        }>;
        total: number;
        posts_searched: number;
      }>("/mcp/v1/elementor/search", params);
      return jsonResult(result);
    }
  );
}
