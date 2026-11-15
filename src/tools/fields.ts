/**
 * Custom-field tools using the cvrt-fields plugin.
 * Requires: cvrt-fields WordPress plugin (v0.1.2+) with the mcp/fields/v1 API.
 * All routes require the authenticated user to hold the manage_options
 * capability (satisfied by the app-password used by this MCP server).
 * The update token is returned masked as { set: boolean } and stored encrypted.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { jsonResult } from "../types.js";

const NS = "/mcp/fields/v1";

const kind = z
  .enum(["groups", "post-types", "taxonomies", "options-pages"])
  .describe("Definition kind: field groups, post types, taxonomies or options pages");

const key = z
  .string()
  .regex(/^[a-z0-9_]+$/)
  .describe("Definition key (lowercase letters, digits, underscore), e.g. group_event or event");

const valuesObject = z
  .string()
  .regex(/^[a-z0-9_]+$/)
  .describe(
    "Object as ACF's post_id: a post ID (\"42\"), \"term_5\", \"user_3\", or the storage id of an options page (\"options\" for the default one)"
  );

const definition = z
  .record(z.string(), z.unknown())
  .describe("Definition object in the shape of fields_get_schema for this kind (ACF-compatible)");

export function register(server: McpServer) {
  server.tool(
    "fields_status",
    "cvrt-fields status: plugin version, definition counts per kind, whether ACF / Elementor / Elementor Pro are active, JSON sync state and JSON read error.",
    { site: z.string().describe("Site id (see list_sites)") },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Record<string, unknown>>(`${NS}/status`));
    }
  );

  server.tool(
    "fields_get_settings",
    "Get cvrt-fields settings. The GitHub update token is returned as { set: boolean }, never raw; also the JSON sync path and whether it is writable.",
    { site: z.string().describe("Site id (see list_sites)") },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Record<string, unknown>>(`${NS}/settings`));
    }
  );

  server.tool(
    "fields_update_settings",
    "Update cvrt-fields settings. github_token is write-only and stored encrypted; a blank or omitted token keeps the stored one. clear_github_token: true deletes it. compat_acf_functions switches the opt-in ACF compatibility layer. shortcode_options_pages lists the options pages whose values shortcodes may print. Returns the settings as fields_get_settings does (token as { set }, compat_acf_functions as a boolean, shortcode_options_pages as a list).",
    {
      site: z.string().describe("Site id (see list_sites)"),
      github_token: z
        .string()
        .optional()
        .describe("GitHub token for plugin updates; write-only, stored encrypted, blank keeps the stored one"),
      clear_github_token: z.boolean().optional().describe("true deletes the stored token (wins over github_token)"),
      compat_acf_functions: z
        .boolean()
        .optional()
        .describe(
          "Opt-in ACF compatibility layer (default false): get_field(), the_field(), get_fields(), update_field() and [acf] exist while ACF is not loaded; never active when ACF is loaded. false switches it off; omitted keeps the setting"
        ),
      shortcode_options_pages: z
        .array(z.string().regex(/^[a-z0-9_]+$/))
        .optional()
        .describe(
          "Definition keys (e.g. ui_options_page_site, see fields_list_definitions options-pages; not menu slugs) of the options pages marked \"Available in shortcodes\": only their fields are printed by [cvrt_field post_id=\"option\"] / [acf post_id=\"option\"] (default none). Replaces the whole list; [] switches every page off; omitted keeps it. Only pages whose values may be public (any post author can place a shortcode)"
        ),
    },
    async ({ site, ...args }) => {
      const wp = forSite(site);
      const body = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
      return jsonResult(await wp.put<Record<string, unknown>>(`${NS}/settings`, body));
    }
  );

  server.tool(
    "fields_get_values",
    "Read every field value of one object (post, term, user or options page) that the field groups located on it define: name, key, type, group, the raw stored value and an escaped HTML rendering. 404 for an unknown object, 403 when the user may not edit it (cvrt-fields 0.2.1+).",
    { site: z.string().describe("Site id (see list_sites)"), object: valuesObject },
    async ({ site, object }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Record<string, unknown>>(`${NS}/values/${object}`));
    }
  );

  server.tool(
    "fields_update_values",
    "Write field values of one object by field name, validated by the field types and all-or-nothing: when any value is invalid nothing is saved (400 cvrt_fields_invalid_values with per-field errors). Only fields of active groups located on the object can be written. Values are given as a form would submit them (gallery: array of image ids, select: value or array, true/false: 1/0). Returns the object's values as fields_get_values does (cvrt-fields 0.2.1+).",
    {
      site: z.string().describe("Site id (see list_sites)"),
      object: valuesObject,
      values: z
        .record(z.string(), z.unknown())
        .refine((v) => Object.keys(v).length > 0, "send at least one field value")
        .describe("Field name => value, e.g. { telephone: \"06101 123456\", open: 1 }"),
    },
    async ({ site, object, values }) => {
      const wp = forSite(site);
      return jsonResult(await wp.put<Record<string, unknown>>(`${NS}/values/${object}`, { values }));
    }
  );

  server.tool(
    "fields_list_types",
    "List the available field types (text, date_picker, image, relationship, ...) with their settings.",
    { site: z.string().describe("Site id (see list_sites)") },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Record<string, unknown>>(`${NS}/types`));
    }
  );

  server.tool(
    "fields_get_location_values",
    "Values usable in field-group location rules: post types, page templates, taxonomies, options pages, user forms.",
    { site: z.string().describe("Site id (see list_sites)") },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Record<string, unknown>>(`${NS}/location-values`));
    }
  );

  server.tool(
    "fields_get_schema",
    "Editor form schema of one definition kind (fields and their options). Read it before fields_create_definition / fields_update_definition.",
    { site: z.string().describe("Site id (see list_sites)"), kind },
    async ({ site, kind }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Record<string, unknown>>(`${NS}/schemas/${kind}`));
    }
  );

  server.tool(
    "fields_list_definitions",
    "List all definitions of one kind from every source (database, JSON, PHP) with their _source.",
    { site: z.string().describe("Site id (see list_sites)"), kind },
    async ({ site, kind }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<unknown>(`${NS}/${kind}`));
    }
  );

  server.tool(
    "fields_get_definition",
    "Get one definition by kind and key.",
    { site: z.string().describe("Site id (see list_sites)"), kind, key },
    async ({ site, kind, key }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Record<string, unknown>>(`${NS}/${kind}/${key}`));
    }
  );

  server.tool(
    "fields_create_definition",
    "Create a definition (field group, post type, taxonomy or options page). The body is the definition itself; omitted keys take the kind's defaults, and a missing key is generated (group_..., post_type_..., taxonomy_..., ui_options_page_...). Fails with 409 when the key exists, 400 when it does not validate. Returns the stored definition (201).",
    { site: z.string().describe("Site id (see list_sites)"), kind, definition },
    async ({ site, kind, definition }) => {
      const wp = forSite(site);
      return jsonResult(await wp.post<Record<string, unknown>>(`${NS}/${kind}`, definition));
    }
  );

  server.tool(
    "fields_update_definition",
    "Replace a definition as a whole: omitted keys fall back to the kind's defaults (it is not a merge, so send the full definition from fields_get_definition with your changes). The key always comes from the path; a key in the body is ignored. 404 when it does not exist, 409 cvrt_fields_defined_in_code for a PHP definition, 409 cvrt_fields_json_shadowed when a read-only JSON file still overrides the database copy. Returns the stored definition.",
    { site: z.string().describe("Site id (see list_sites)"), kind, key, definition },
    async ({ site, kind, key, definition }) => {
      const wp = forSite(site);
      return jsonResult(await wp.put<Record<string, unknown>>(`${NS}/${kind}/${key}`, definition));
    }
  );

  server.tool(
    "fields_delete_definition",
    "Delete a database definition. Stored field values stay in post/term/user meta and options.",
    { site: z.string().describe("Site id (see list_sites)"), kind, key },
    async ({ site, kind, key }) => {
      const wp = forSite(site);
      return jsonResult(await wp.delete<Record<string, unknown>>(`${NS}/${kind}/${key}`));
    }
  );

  server.tool(
    "fields_sync_definition",
    "Copy a JSON-sourced definition into the database. Only JSON definitions can be synced.",
    { site: z.string().describe("Site id (see list_sites)"), kind, key },
    async ({ site, kind, key }) => {
      const wp = forSite(site);
      return jsonResult(await wp.post<Record<string, unknown>>(`${NS}/${kind}/${key}/sync`, {}));
    }
  );
}
