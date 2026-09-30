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
    "Update cvrt-fields settings. github_token is write-only and stored encrypted; a blank or omitted token keeps the stored one. clear_github_token: true deletes it.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      github_token: z.string().optional(),
      clear_github_token: z.boolean().optional(),
    },
    async ({ site, ...args }) => {
      const wp = forSite(site);
      const body = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
      return jsonResult(await wp.put<Record<string, unknown>>(`${NS}/settings`, body));
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
    "Create a definition (field group, post type, taxonomy or options page). Fails with 409 when the key exists.",
    { site: z.string().describe("Site id (see list_sites)"), kind, definition },
    async ({ site, kind, definition }) => {
      const wp = forSite(site);
      return jsonResult(await wp.post<Record<string, unknown>>(`${NS}/${kind}`, definition));
    }
  );

  server.tool(
    "fields_update_definition",
    "Replace a definition. 409 cvrt_fields_json_shadowed means a read-only JSON file still overrides the database copy.",
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
