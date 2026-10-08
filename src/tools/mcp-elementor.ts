/**
 * Elementor page builder tools using cvrt-mcp-endpoints plugin
 * Requires: cvrt-mcp-endpoints WordPress plugin + Elementor active
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { defined, jsonResult } from "../types.js";

const site = z.string().describe("Site id (see list_sites)");
const postId = z.number().int().describe("Post/page ID");
// The routes only match hex element ids.
const elementId = z
  .string()
  .regex(/^[a-fA-F0-9]+$/)
  .describe("Elementor element ID (hex, usually 7-8 chars)");
const fields = z
  .string()
  .optional()
  .describe("Comma-separated setting keys to keep in each element's settings (default: all)");
const widgetType = z.string().optional().describe("Filter by widget type (heading, button, image, text-editor, html, ...)");

export function register(server: McpServer) {
  // Get page build tree
  server.tool(
    "mcp_get_elementor_build",
    "Get full Elementor page build (containers, widgets, settings tree) with element and widget counts",
    { site, id: postId, fields },
    async ({ site, id, fields }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        post_id: number;
        title: string;
        edit_mode: string;
        template_type: string;
        element_count: number;
        widget_count: number;
        elements: unknown[];
      }>(`/mcp/v1/elementor/posts/${id}`, defined({ fields: fields || undefined }));
      return jsonResult(result);
    }
  );

  // Get flat element list
  server.tool(
    "mcp_get_elementor_flat",
    "Get flat list of all Elementor elements on a page (id, elType, widgetType, parent_id, depth, settings); easier to search/filter than the tree",
    {
      site,
      id: postId,
      widget_type: widgetType,
      el_type: z.string().optional().describe("Filter by element type (container, section, column, widget, or a V4 type like e-div-block)"),
      fields,
    },
    async ({ site, id, widget_type, el_type, fields }) => {
      const wp = forSite(site);
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
      }>(
        `/mcp/v1/elementor/posts/${id}/flat`,
        defined({ widget_type: widget_type || undefined, el_type: el_type || undefined, fields: fields || undefined })
      );
      return jsonResult(result);
    }
  );

  // Get single element
  server.tool(
    "mcp_get_elementor_element",
    "Get a single Elementor element with full settings, its parent id and child ids",
    { site, id: postId, element_id: elementId },
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
    "Update settings on a single Elementor element (merge by default). With widget_type, replaces the widget in place (same id, position and parent), e.g. turn a V4 placeholder into a V3 html widget; the type must be registered with Elementor. Give settings, widget_type, or both.",
    {
      site,
      id: postId,
      element_id: elementId,
      settings: z
        .record(z.unknown())
        .optional()
        .describe("Settings to merge into (or, with settings_mode replace, to become) the element's settings. Optional when widget_type is given."),
      widget_type: z
        .string()
        .regex(/^[a-z0-9][a-z0-9_-]*$/)
        .optional()
        .describe("Replace the widget type in place (cvrt-mcp-endpoints 1.13.0+). Widgets only, not containers."),
      settings_mode: z
        .enum(["merge", "replace"])
        .optional()
        .describe("merge (default): top-level keys are merged into the current settings; replace: settings become the element's complete settings"),
    },
    async ({ site, id, element_id, settings, widget_type, settings_mode }) => {
      if (settings === undefined && widget_type === undefined) {
        throw new Error("mcp_update_elementor_element: give settings, widget_type, or both");
      }
      const wp = forSite(site);
      const result = await wp.put<{
        post_id: number;
        element_id: string;
        updated: boolean;
        element: { id: string; elType: string; widgetType: string | null; settings: Record<string, unknown> };
      }>(`/mcp/v1/elementor/posts/${id}/elements/${element_id}`, defined({ settings, widget_type, settings_mode }));
      return jsonResult(result);
    }
  );

  // Get page settings
  server.tool(
    "mcp_get_elementor_page_settings",
    "Get Elementor page-level settings (hide title, custom CSS, etc.). Fails if the post is not built with Elementor.",
    { site, id: postId },
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
    "Update Elementor page-level settings. Top-level keys are merged into the stored settings (a nested value replaces the old one whole); returns the merged settings.",
    {
      site,
      id: postId,
      settings: z.record(z.unknown()).describe("Settings to merge (non-empty)"),
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
    "List Elementor library templates (headers, footers, singles, loop items, popups) with theme builder conditions; at most 100, ordered by title",
    {
      site,
      type: z
        .string()
        .optional()
        .describe("Filter by template type (header, footer, single, single-post, single-page, archive, loop-item, page, section, container, popup, kit, ...)"),
    },
    async ({ site, type }) => {
      const wp = forSite(site);
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
      }>("/mcp/v1/elementor/templates", defined({ type: type || undefined }));
      return jsonResult(result);
    }
  );

  // Get template conditions
  server.tool(
    "mcp_get_elementor_conditions",
    "Get theme builder display conditions for an Elementor template (Elementor Pro)",
    { site, id: z.number().int().describe("Template post ID") },
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
    { site },
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
    "Update Elementor global kit settings (colors, fonts, typography). Top-level keys are merged; a nested value such as system_colors replaces the old one whole, so send the complete list. Returns the merged settings.",
    {
      site,
      settings: z.record(z.unknown()).describe("Kit settings to merge (non-empty)"),
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
    "Search published Elementor-built posts for widgets, settings, or text in string setting values (case-insensitive)",
    {
      site,
      widget_type: widgetType,
      setting: z.string().optional().describe("Setting key: alone, matches elements that have it; with contains, searches only that key"),
      contains: z.string().optional().describe("Text to search for in string setting values"),
      post_type: z.string().optional().describe("Limit to one post type (default any)"),
      per_page: z.number().int().min(1).max(200).optional().describe("Max results (default 50, max 200)"),
    },
    async ({ site, widget_type, setting, contains, post_type, per_page }) => {
      const wp = forSite(site);
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
      }>(
        "/mcp/v1/elementor/search",
        defined({
          widget_type: widget_type || undefined,
          setting: setting || undefined,
          contains: contains || undefined,
          post_type: post_type || undefined,
          per_page,
        })
      );
      return jsonResult(result);
    }
  );
}
