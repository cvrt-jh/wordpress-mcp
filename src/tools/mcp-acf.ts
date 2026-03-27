/**
 * ACF (Advanced Custom Fields) tools using cvrt-mcp-endpoints plugin
 * Requires: cvrt-mcp-endpoints WordPress plugin + ACF Pro active
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { wpGet, wpPost, wpPut, wpDelete } from "../client.js";
import { jsonResult } from "../types.js";

export function register(server: McpServer) {
  // List all ACF field groups
  server.tool(
    "acf_list_field_groups",
    "List all ACF field groups with their fields",
    {},
    async () => {
      const result = await wpGet<
        Array<{
          key: string;
          title: string;
          active: boolean;
          location: unknown[];
          fields: Array<{ key: string; name: string; label: string; type: string }>;
        }>
      >("/mcp/v1/acf/field-groups");
      return jsonResult(result);
    }
  );

  // Get single field group with full config
  server.tool(
    "acf_get_field_group",
    "Get ACF field group with full field configuration",
    {
      key: z.string().describe("Field group key (e.g., group_abc123)"),
    },
    async ({ key }) => {
      const result = await wpGet<{
        key: string;
        title: string;
        active: boolean;
        location: unknown[];
        position: string;
        style: string;
        hide_on_screen: string[];
        fields: Array<Record<string, unknown>>;
      }>(`/mcp/v1/acf/field-groups/${encodeURIComponent(key)}`);
      return jsonResult(result);
    }
  );

  // Create field group
  server.tool(
    "acf_create_field_group",
    "Create an ACF field group with fields",
    {
      title: z.string().describe("Field group title"),
      key: z.string().optional().describe("Field group key (auto-generated if omitted)"),
      fields: z
        .array(
          z.object({
            name: z.string().describe("Field name"),
            label: z.string().optional().describe("Field label"),
            type: z.string().optional().default("text").describe("Field type"),
            required: z.number().optional().default(0).describe("1 = required"),
            instructions: z.string().optional().default(""),
            default_value: z.string().optional().default(""),
            key: z.string().optional().describe("Field key (auto-generated if omitted)"),
            settings: z.record(z.unknown()).optional().describe("ACF field settings (choices, min, max, etc.)"),
          })
        )
        .describe("Array of field definitions"),
      location: z
        .array(z.array(z.record(z.string())))
        .optional()
        .describe("Location rules (defaults to post_type == post)"),
      position: z.enum(["normal", "acf_after_title", "side"]).optional().default("normal"),
      style: z.enum(["default", "seamless"]).optional().default("default"),
      hide_on_screen: z.array(z.string()).optional().default([]),
    },
    async (params) => {
      const result = await wpPost<{
        success: boolean;
        key: string;
        title: string;
        fields: number;
        post_id: number | null;
      }>("/mcp/v1/acf/field-groups", params);
      return jsonResult(result);
    }
  );

  // Update field group
  server.tool(
    "acf_update_field_group",
    "Update an existing ACF field group",
    {
      key: z.string().describe("Field group key"),
      title: z.string().optional().describe("New title"),
      fields: z
        .array(z.record(z.unknown()))
        .optional()
        .describe("Updated field definitions (replaces all fields)"),
      location: z.array(z.array(z.record(z.string()))).optional().describe("Updated location rules"),
      position: z.string().optional(),
      style: z.string().optional(),
      active: z.boolean().optional(),
      hide_on_screen: z.array(z.string()).optional(),
    },
    async ({ key, ...params }) => {
      const result = await wpPut<{
        success: boolean;
        key: string;
        title: string;
        fields: number;
        post_id: number | null;
      }>(`/mcp/v1/acf/field-groups/${encodeURIComponent(key)}`, params);
      return jsonResult(result);
    }
  );

  // Delete field group
  server.tool(
    "acf_delete_field_group",
    "Delete an ACF field group",
    {
      key: z.string().describe("Field group key"),
    },
    async ({ key }) => {
      const result = await wpDelete<{
        success: boolean;
        key: string;
        title: string;
        deleted: boolean;
      }>(`/mcp/v1/acf/field-groups/${encodeURIComponent(key)}`);
      return jsonResult(result);
    }
  );

  // Export field group as ACF JSON
  server.tool(
    "acf_export_field_group",
    "Export a field group in ACF JSON format (for import/backup)",
    {
      key: z.string().describe("Field group key"),
    },
    async ({ key }) => {
      const result = await wpGet<Record<string, unknown>>(
        `/mcp/v1/acf/field-groups/${encodeURIComponent(key)}/export`
      );
      return jsonResult(result);
    }
  );

  // Import field groups from ACF JSON
  server.tool(
    "acf_import_field_groups",
    "Import ACF field groups from JSON export format",
    {
      groups: z.array(z.record(z.unknown())).describe("Array of ACF field group JSON objects"),
    },
    async ({ groups }) => {
      const result = await wpPost<{
        imported: number;
        results: Array<{
          key: string;
          title: string;
          success: boolean;
          post_id: number | null;
          error?: string;
        }>;
      }>("/mcp/v1/acf/import", { groups });
      return jsonResult(result);
    }
  );

  // ============================================
  // POST FIELD VALUES
  // ============================================

  // Get all ACF fields for a post
  server.tool(
    "acf_get_post_fields",
    "Get all ACF field values for a post",
    {
      post_id: z.number().describe("Post ID"),
      format: z.enum(["formatted", "raw"]).optional().default("formatted"),
    },
    async ({ post_id, format }) => {
      const result = await wpGet<{
        post_id: number;
        fields: Record<string, { value: unknown; type: string; label: string }>;
      }>(`/mcp/v1/acf/posts/${post_id}/fields`, { format });
      return jsonResult(result);
    }
  );

  // Update ACF fields for a post
  server.tool(
    "acf_update_post_fields",
    "Update multiple ACF field values for a post",
    {
      post_id: z.number().describe("Post ID"),
      fields: z.record(z.unknown()).describe("Field name => value pairs"),
    },
    async ({ post_id, fields }) => {
      const result = await wpPost<{
        post_id: number;
        updated: Record<string, boolean>;
      }>(`/mcp/v1/acf/posts/${post_id}/fields`, { fields });
      return jsonResult(result);
    }
  );

  // Get single ACF field value
  server.tool(
    "acf_get_post_field",
    "Get a single ACF field value for a post",
    {
      post_id: z.number().describe("Post ID"),
      field: z.string().describe("Field name"),
      format: z.enum(["formatted", "raw"]).optional().default("formatted"),
    },
    async ({ post_id, field, format }) => {
      const result = await wpGet<{
        post_id: number;
        field: string;
        value: unknown;
        type: string;
        label: string;
      }>(`/mcp/v1/acf/posts/${post_id}/fields/${encodeURIComponent(field)}`, { format });
      return jsonResult(result);
    }
  );

  // Update single ACF field value
  server.tool(
    "acf_update_post_field",
    "Update a single ACF field value for a post",
    {
      post_id: z.number().describe("Post ID"),
      field: z.string().describe("Field name"),
      value: z.unknown().describe("New value"),
    },
    async ({ post_id, field, value }) => {
      const result = await wpPut<{
        post_id: number;
        field: string;
        updated: boolean;
      }>(`/mcp/v1/acf/posts/${post_id}/fields/${encodeURIComponent(field)}`, { value });
      return jsonResult(result);
    }
  );
}
