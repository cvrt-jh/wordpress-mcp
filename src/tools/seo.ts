/**
 * SEO Manager tools using the cvrt-seo-manager plugin (v1.5.0+).
 * Requires: cvrt-seo-manager active on the site, exposing mcp/seo/v1/*.
 * All routes require manage_options (satisfied by the app-password the MCP
 * server uses). Secret settings are returned masked as { set: boolean }.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { jsonResult } from "../types.js";

const NS = "/mcp/seo/v1";

export function register(server: McpServer) {
  server.tool(
    "seo_status",
    "Get cvrt-seo-manager status (version, configured, dependencies).",
    { site: z.string().describe("Site id (see list_sites)") },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<unknown>(`${NS}/status`));
    }
  );

  server.tool(
    "seo_get_settings",
    "Get cvrt-seo-manager settings. Secret values are returned as { set: boolean }, never raw.",
    { site: z.string().describe("Site id (see list_sites)") },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<unknown>(`${NS}/settings`));
    }
  );

  server.tool(
    "seo_update_settings",
    "Update cvrt-seo-manager settings. Provide only keys to change; a blank/omitted secret preserves the stored value.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      settings: z.record(z.any()).describe("Partial settings object to merge"),
    },
    async ({ site, settings }) => {
      const wp = forSite(site);
      return jsonResult(await wp.put<unknown>(`${NS}/settings`, settings));
    }
  );

  server.tool(
    "seo_get_post_seo",
    "Get the SEO meta for a post.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Post ID"),
    },
    async ({ site, id }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<unknown>(`${NS}/posts/${id}/seo`));
    }
  );

  server.tool(
    "seo_update_post_seo",
    "Update the SEO meta for a post.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Post ID"),
      meta: z.record(z.any()).describe("SEO meta fields to set"),
    },
    async ({ site, id, meta }) => {
      const wp = forSite(site);
      return jsonResult(await wp.put<unknown>(`${NS}/posts/${id}/seo`, meta));
    }
  );

  server.tool(
    "seo_delete_post_seo",
    "Delete (reset) the SEO meta for a post.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Post ID"),
    },
    async ({ site, id }) => {
      const wp = forSite(site);
      return jsonResult(await wp.delete<unknown>(`${NS}/posts/${id}/seo`));
    }
  );

  server.tool(
    "seo_get_post_analysis",
    "Get the SEO analysis (score, issues) for a post.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Post ID"),
    },
    async ({ site, id }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<unknown>(`${NS}/posts/${id}/analysis`));
    }
  );

  server.tool(
    "seo_list_posts_seo",
    "List SEO meta across posts.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      params: z
        .record(z.union([z.string(), z.number()]))
        .optional()
        .describe("Query params (page, per_page, post_type, search, ...)"),
    },
    async ({ site, params }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<unknown>(`${NS}/posts/seo`, params));
    }
  );

  server.tool(
    "seo_bulk_update_posts_seo",
    "Bulk update SEO meta across multiple posts.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      updates: z.record(z.any()).describe("Bulk update payload (e.g. { posts: [{ id, ...meta }] })"),
    },
    async ({ site, updates }) => {
      const wp = forSite(site);
      return jsonResult(await wp.put<unknown>(`${NS}/posts/seo/bulk`, updates));
    }
  );

  server.tool(
    "seo_get_term_seo",
    "Get the SEO meta for a taxonomy term.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Term ID"),
    },
    async ({ site, id }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<unknown>(`${NS}/terms/${id}/seo`));
    }
  );

  server.tool(
    "seo_update_term_seo",
    "Update the SEO meta for a taxonomy term.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Term ID"),
      meta: z.record(z.any()).describe("SEO meta fields to set"),
    },
    async ({ site, id, meta }) => {
      const wp = forSite(site);
      return jsonResult(await wp.put<unknown>(`${NS}/terms/${id}/seo`, meta));
    }
  );

  server.tool(
    "seo_delete_term_seo",
    "Delete (reset) the SEO meta for a taxonomy term.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Term ID"),
    },
    async ({ site, id }) => {
      const wp = forSite(site);
      return jsonResult(await wp.delete<unknown>(`${NS}/terms/${id}/seo`));
    }
  );

  server.tool(
    "seo_keyword_check",
    "Run the keyword analysis check.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      params: z.record(z.any()).describe("Keyword-check inputs"),
    },
    async ({ site, params }) => {
      const wp = forSite(site);
      return jsonResult(await wp.post<unknown>(`${NS}/analysis/keyword-check`, params));
    }
  );

  server.tool(
    "seo_list_redirects",
    "List all redirects.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      params: z
        .record(z.union([z.string(), z.number()]))
        .optional()
        .describe("Query params (page, per_page, search, ...)"),
    },
    async ({ site, params }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<unknown>(`${NS}/redirects`, params));
    }
  );

  server.tool(
    "seo_create_redirect",
    "Create a redirect.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      redirect: z.record(z.any()).describe("Redirect fields (source, target, type, ...)"),
    },
    async ({ site, redirect }) => {
      const wp = forSite(site);
      return jsonResult(await wp.post<unknown>(`${NS}/redirects`, redirect));
    }
  );

  server.tool(
    "seo_get_redirect",
    "Get a redirect by id.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Redirect ID"),
    },
    async ({ site, id }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<unknown>(`${NS}/redirects/${id}`));
    }
  );

  server.tool(
    "seo_update_redirect",
    "Update a redirect by id.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Redirect ID"),
      redirect: z.record(z.any()).describe("Redirect fields to change"),
    },
    async ({ site, id, redirect }) => {
      const wp = forSite(site);
      return jsonResult(await wp.put<unknown>(`${NS}/redirects/${id}`, redirect));
    }
  );

  server.tool(
    "seo_delete_redirect",
    "Delete a redirect by id.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Redirect ID"),
    },
    async ({ site, id }) => {
      const wp = forSite(site);
      return jsonResult(await wp.delete<unknown>(`${NS}/redirects/${id}`));
    }
  );

  server.tool(
    "seo_list_monitor_log",
    "List the 404/redirect monitor log entries.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      params: z
        .record(z.union([z.string(), z.number()]))
        .optional()
        .describe("Query params (page, per_page, search, ...)"),
    },
    async ({ site, params }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<unknown>(`${NS}/monitor/log`, params));
    }
  );

  server.tool(
    "seo_clear_monitor_log",
    "Clear the 404/redirect monitor log.",
    { site: z.string().describe("Site id (see list_sites)") },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.delete<unknown>(`${NS}/monitor/log`));
    }
  );

  server.tool(
    "seo_create_redirect_from_log",
    "Create a redirect directly from a monitor log entry.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Monitor log entry ID"),
      redirect: z.record(z.any()).optional().describe("Redirect fields (target, type, ...)"),
    },
    async ({ site, id, redirect }) => {
      const wp = forSite(site);
      return jsonResult(await wp.post<unknown>(`${NS}/monitor/log/${id}/redirect`, redirect ?? {}));
    }
  );

  server.tool(
    "seo_sitemap_status",
    "Get sitemap status.",
    { site: z.string().describe("Site id (see list_sites)") },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<unknown>(`${NS}/sitemap/status`));
    }
  );

  server.tool(
    "seo_sitemap_ping",
    "Ping search engines with the sitemap.",
    { site: z.string().describe("Site id (see list_sites)") },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.post<unknown>(`${NS}/sitemap/ping`, {}));
    }
  );

  server.tool(
    "seo_indexnow_ping",
    "Submit URLs to IndexNow.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      urls: z.array(z.string()).optional().describe("URLs to submit"),
    },
    async ({ site, urls }) => {
      const wp = forSite(site);
      return jsonResult(await wp.post<unknown>(`${NS}/indexnow/ping`, { urls }));
    }
  );

  server.tool(
    "seo_export_settings",
    "Export cvrt-seo-manager settings.",
    { site: z.string().describe("Site id (see list_sites)") },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<unknown>(`${NS}/export/settings`));
    }
  );

  server.tool(
    "seo_import_settings",
    "Import cvrt-seo-manager settings.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      data: z.record(z.any()).describe("Settings payload to import"),
    },
    async ({ site, data }) => {
      const wp = forSite(site);
      return jsonResult(await wp.post<unknown>(`${NS}/import/settings`, data));
    }
  );

  server.tool(
    "seo_export_csv",
    "Export post SEO meta as CSV.",
    { site: z.string().describe("Site id (see list_sites)") },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<unknown>(`${NS}/export/csv`));
    }
  );

  server.tool(
    "seo_import_csv",
    "Import post SEO meta from CSV.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      data: z.record(z.any()).describe("CSV import payload"),
    },
    async ({ site, data }) => {
      const wp = forSite(site);
      return jsonResult(await wp.post<unknown>(`${NS}/import/csv`, data));
    }
  );

  server.tool(
    "seo_export_redirects",
    "Export redirects.",
    { site: z.string().describe("Site id (see list_sites)") },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<unknown>(`${NS}/export/redirects`));
    }
  );

  server.tool(
    "seo_import_redirects",
    "Import redirects.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      data: z.record(z.any()).describe("Redirects import payload"),
    },
    async ({ site, data }) => {
      const wp = forSite(site);
      return jsonResult(await wp.post<unknown>(`${NS}/import/redirects`, data));
    }
  );

  server.tool(
    "seo_import_migrate",
    "Run a migration import (e.g. from RankMath GLOBAL settings) into cvrt-seo-manager.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      data: z.record(z.any()).describe("Migration payload (source plugin, options to migrate, ...)"),
    },
    async ({ site, data }) => {
      const wp = forSite(site);
      return jsonResult(await wp.post<unknown>(`${NS}/import/migrate`, data));
    }
  );
}
