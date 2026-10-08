/**
 * ACF (Advanced Custom Fields) tools using cvrt-mcp-endpoints plugin
 * Requires: cvrt-mcp-endpoints WordPress plugin + ACF (Pro for repeater/flexible fields) active
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { defined, jsonResult } from "../types.js";

const site = z.string().describe("Site id (see list_sites)");
const groupKey = z
  .string()
  .regex(/^[a-zA-Z0-9_-]+$/)
  .describe("Field group key (e.g. group_abc123)");
const postId = z.number().int().describe("Post ID");
const format = z
  .enum(["formatted", "raw"])
  .optional()
  .describe("formatted (default): values as get_field returns them; raw: unformatted stored values");

// The endpoint's process_fields() keeps only these field keys (plus a
// whitelist inside settings), so nothing else is offered.
const fieldDefinition = z.object({
  name: z.string().describe("Field name (meta key; run through sanitize_title)"),
  label: z.string().optional().describe("Field label (default: the name)"),
  type: z.string().optional().describe("ACF field type: text, textarea, number, email, url, image, file, wysiwyg, select, checkbox, radio, true_false, link, post_object, relationship, taxonomy, user, date_picker, color_picker, repeater, group, ... (default text)"),
  required: z.number().int().min(0).max(1).optional().describe("1 = required (default 0)"),
  instructions: z.string().optional().describe("Instructions shown to editors (default empty)"),
  default_value: z.string().optional().describe("Default value (default empty)"),
  key: z.string().optional().describe("Field key (default: field_ + md5(group key + name), so the same name keeps its key)"),
  settings: z
    .record(z.unknown())
    .optional()
    .describe(
      "Extra ACF field settings. Only these keys are kept: choices, other_choice, allow_null, multiple, placeholder, rows, new_lines, min, max, step, prepend, append, maxlength, conditional_logic, wrapper, return_format, display_format, first_day, library, min_size, max_size, mime_types, preview_size, taxonomy, field_type, save_terms, load_terms, add_term, save_other_choice, layout, sub_fields, min_rows, max_rows, button_label"
    ),
});

const locationRule = z.object({
  param: z.string().describe("Rule parameter (post_type, page_template, taxonomy, options_page, user_role, ...)"),
  operator: z.string().describe("Comparison operator: == or != (add-ons may register more)"),
  value: z.string().describe("Value to compare against (e.g. post, page, product)"),
});
const location = z
  .array(z.array(locationRule))
  .describe("Location rules: OR-groups of AND-ed rules, e.g. [[{param:'post_type',operator:'==',value:'page'}]]");

const position = z.enum(["normal", "acf_after_title", "side"]);
const style = z.enum(["default", "seamless"]);

export function register(server: McpServer) {
  // List all ACF field groups
  server.tool(
    "acf_list_field_groups",
    "List all ACF field groups with their fields (key, name, label, type)",
    { site },
    async ({ site }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        field_groups: Array<{
          key: string;
          title: string;
          active: boolean;
          location: unknown[];
          field_count: number;
          fields: Array<{ key: string; name: string; label: string; type: string }>;
        }>;
        count: number;
      }>("/mcp/v1/acf/field-groups");
      return jsonResult(result);
    }
  );

  // Get single field group with full config
  server.tool(
    "acf_get_field_group",
    "Get ACF field group with full field configuration",
    { site, key: groupKey },
    async ({ site, key }) => {
      const wp = forSite(site);
      const result = await wp.get<{
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
    "Create an ACF field group with fields (active, shown in REST, labels on top)",
    {
      site,
      title: z.string().describe("Field group title"),
      key: z.string().optional().describe("Field group key (default group_ + a UUID)"),
      fields: z.array(fieldDefinition).min(1).describe("Field definitions (at least one)"),
      location: location.optional().describe("Location rules (default: post_type == post)"),
      position: position.optional().describe("Meta box position (default normal)"),
      style: style.optional().describe("Meta box style (default default)"),
      hide_on_screen: z.array(z.string()).optional().describe("Edit screen elements to hide (permalink, the_content, excerpt, featured_image, ...)"),
    },
    async ({ site, title, key, fields, location, position, style, hide_on_screen }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        key: string;
        title: string;
        fields: number;
        created: boolean;
      }>("/mcp/v1/acf/field-groups", defined({ title, key, fields, location, position, style, hide_on_screen }));
      return jsonResult(result);
    }
  );

  // Update field group
  server.tool(
    "acf_update_field_group",
    "Update an existing ACF field group. Only the given group settings change. The endpoint re-imports the whole group through acf_import_field_group, which deletes stored fields whose key is not in the imported list, so pass the COMPLETE fields list (fields without a key get field_ + md5(group key + name), matching ones made by acf_create_field_group).",
    {
      site,
      key: groupKey,
      title: z.string().optional().describe("New title"),
      fields: z.array(fieldDefinition).optional().describe("Complete list of field definitions for the group (an empty list is ignored)"),
      location: location.optional(),
      menu_order: z.number().int().optional().describe("Order of the field group on the edit screen"),
      position: position.optional().describe("Meta box position"),
      style: style.optional().describe("Meta box style"),
      label_placement: z.enum(["top", "left"]).optional().describe("Label placement"),
      instruction_placement: z.enum(["label", "field"]).optional().describe("Instruction placement"),
      active: z.boolean().optional().describe("Whether the field group is active"),
      show_in_rest: z.boolean().optional().describe("Expose the fields in the WP REST API"),
      hide_on_screen: z.array(z.string()).optional().describe("Edit screen elements to hide"),
    },
    async ({ site, key, ...rest }) => {
      const wp = forSite(site);
      const result = await wp.put<{
        key: string;
        title: string;
        /** Number of fields sent in this update (0 when fields was not given). */
        fields: number;
        updated: boolean;
      }>(`/mcp/v1/acf/field-groups/${encodeURIComponent(key)}`, defined(rest));
      return jsonResult(result);
    }
  );

  // Delete field group
  server.tool(
    "acf_delete_field_group",
    "Delete an ACF field group and its fields (stored post values are kept)",
    { site, key: groupKey },
    async ({ site, key }) => {
      const wp = forSite(site);
      const result = await wp.delete<{
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
    { site, key: groupKey },
    async ({ site, key }) => {
      const wp = forSite(site);
      const result = await wp.get<Record<string, unknown>>(
        `/mcp/v1/acf/field-groups/${encodeURIComponent(key)}/export`
      );
      return jsonResult(result);
    }
  );

  // Import field groups from ACF JSON
  server.tool(
    "acf_import_field_groups",
    "Import ACF field groups from JSON export format (each needs key, title and fields). The endpoint does not look up an existing group by key, so importing a key that already exists can create a duplicate; use acf_update_field_group for existing groups.",
    {
      site,
      groups: z.array(z.record(z.unknown())).min(1).describe("ACF field group JSON objects (as from acf_export_field_group)"),
    },
    async ({ site, groups }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        imported: number;
        results: Array<{
          key: string;
          title: string;
          success: boolean;
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
    "Get all ACF field values for a post (name => { value, type, label })",
    { site, post_id: postId, format },
    async ({ site, post_id, format }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        post_id: number;
        fields: Record<string, { value: unknown; type: string; label: string }>;
      }>(`/mcp/v1/acf/posts/${post_id}/fields`, defined({ format }));
      return jsonResult(result);
    }
  );

  // Update ACF fields for a post
  server.tool(
    "acf_update_post_fields",
    "Update multiple ACF field values for a post (field names are run through sanitize_key, so use lowercase names or field keys)",
    {
      site,
      post_id: postId,
      fields: z.record(z.unknown()).describe("Field name (or key) => value pairs (non-empty)"),
    },
    async ({ site, post_id, fields }) => {
      const wp = forSite(site);
      const result = await wp.post<{
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
      site,
      post_id: postId,
      field: z.string().regex(/^[a-zA-Z0-9_-]+$/).describe("Field name or key (lowercased by the endpoint)"),
      format,
    },
    async ({ site, post_id, field, format }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        post_id: number;
        field: string;
        value: unknown;
        type: string;
        label: string;
      }>(`/mcp/v1/acf/posts/${post_id}/fields/${encodeURIComponent(field)}`, defined({ format }));
      return jsonResult(result);
    }
  );

  // Update single ACF field value
  server.tool(
    "acf_update_post_field",
    "Update a single ACF field value for a post (updated is false when the value did not change)",
    {
      site,
      post_id: postId,
      field: z.string().regex(/^[a-zA-Z0-9_-]+$/).describe("Field name or key (lowercased by the endpoint)"),
      value: z.unknown().describe("New value (required; null clears the field)"),
    },
    async ({ site, post_id, field, value }) => {
      if (value === undefined) throw new Error("acf_update_post_field: value is required (use null to clear the field)");
      const wp = forSite(site);
      const result = await wp.put<{
        post_id: number;
        field: string;
        updated: boolean;
      }>(`/mcp/v1/acf/posts/${post_id}/fields/${encodeURIComponent(field)}`, { value });
      return jsonResult(result);
    }
  );
}
