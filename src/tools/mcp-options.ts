/**
 * WordPress options management tools using cvrt-mcp-endpoints plugin
 * Requires: cvrt-mcp-endpoints WordPress plugin
 *
 * The endpoint masks secret-looking values (by option/key name or by token
 * shape) as "[masked]" in every response. There is no server-side allow-list:
 * any option can be written, so mcp_set_option refuses to write a value that
 * still contains the mask, which would overwrite the real secret.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { jsonResult } from "../types.js";

/** The placeholder cvrt-mcp-endpoints puts in place of a secret value. */
export const MASK = "[masked]";

/** Whether `value` (or anything nested in it) is the mask placeholder. */
export function containsMask(value: unknown): boolean {
  if (value === MASK) return true;
  if (Array.isArray(value)) return value.some(containsMask);
  if (value !== null && typeof value === "object") return Object.values(value).some(containsMask);
  return false;
}

// The route only matches [a-zA-Z0-9_-]+; the server then applies sanitize_key
// (lowercases), so an option with a dot or uppercase name is unreachable.
const OptionKey = z
  .string()
  .regex(/^[a-zA-Z0-9_-]+$/, "option name may only contain letters, digits, _ and -")
  .describe("Option name (letters, digits, _ and -; the server lowercases it)");

const MASK_NOTE = `Secret-looking values are returned as "${MASK}".`;

export function register(server: McpServer) {
  // List options
  server.tool(
    "mcp_list_options",
    `List WordPress options (name ascending) with an optional name prefix filter. ${MASK_NOTE} Note: autoload is only true for legacy 'yes' rows (WP 6.6+ stores 'on'/'auto', reported as false).`,
    {
      site: z.string().describe("Site id (see list_sites)"),
      prefix: z
        .string()
        .optional()
        .describe("Only options whose name starts with this (server lowercases it and keeps only a-z, 0-9, _ and -)"),
      per_page: z.number().int().positive().optional().default(50).describe("Maximum options returned (default 50)"),
    },
    async ({ site, prefix, per_page }) => {
      const wp = forSite(site);
      const params: Record<string, string | number> = { per_page };
      if (prefix) params.prefix = prefix;
      const result = await wp.get<{
        options: Array<{ key: string; value: unknown; autoload: boolean }>;
        count: number;
      }>("/mcp/v1/options", params);
      return jsonResult(result);
    }
  );

  // Get option
  server.tool(
    "mcp_get_option",
    `Get a single option value. ${MASK_NOTE} masked: true says the value (or part of it) was hidden.`,
    {
      site: z.string().describe("Site id (see list_sites)"),
      key: OptionKey,
    },
    async ({ site, key }) => {
      const wp = forSite(site);
      const result = await wp.get<{ key: string; value: unknown; masked: boolean }>(
        `/mcp/v1/options/${encodeURIComponent(key)}`
      );
      return jsonResult(result);
    }
  );

  // Set option
  server.tool(
    "mcp_set_option",
    `Create or update an option (any option, no allow-list: be careful with siteurl, home, active_plugins etc.). A value containing "${MASK}" is refused, since writing back a masked read would destroy the stored secret. The echoed value is masked like reads. Note: created is always false (cvrt-mcp-endpoints 1.14.2 checks it after writing).`,
    {
      site: z.string().describe("Site id (see list_sites)"),
      key: OptionKey,
      value: z.unknown().describe("Option value (any JSON type; arrays/objects are stored serialized). Required."),
      autoload: z
        .boolean()
        .optional()
        .default(true)
        .describe("Load on every page (default true). Only applied when the value changes or the option is new."),
    },
    async ({ site, key, value, autoload }) => {
      if (value === undefined) throw new Error("value is required");
      if (containsMask(value)) {
        throw new Error(
          `Refusing to write "${MASK}" into option ${key}: that is the read mask, not the real value. Pass the real value.`
        );
      }
      const wp = forSite(site);
      const result = await wp.post<{ key: string; value: unknown; created: boolean }>(
        `/mcp/v1/options/${encodeURIComponent(key)}`,
        { value, autoload }
      );
      return jsonResult(result);
    }
  );

  // Delete option
  server.tool(
    "mcp_delete_option",
    "Delete an option (404 if it does not exist)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      key: OptionKey,
    },
    async ({ site, key }) => {
      const wp = forSite(site);
      const result = await wp.delete<{ deleted: boolean; key: string }>(
        `/mcp/v1/options/${encodeURIComponent(key)}`
      );
      return jsonResult(result);
    }
  );

  // Bulk get options
  server.tool(
    "mcp_bulk_get_options",
    `Get multiple options at once. A missing option comes back as false. ${MASK_NOTE}`,
    {
      site: z.string().describe("Site id (see list_sites)"),
      keys: z.array(z.string()).describe("Option names (the server lowercases them)"),
    },
    async ({ site, keys }) => {
      const wp = forSite(site);
      const result = await wp.post<{ options: Record<string, unknown> }>(
        "/mcp/v1/options-bulk",
        { keys }
      );
      return jsonResult(result);
    }
  );
}
