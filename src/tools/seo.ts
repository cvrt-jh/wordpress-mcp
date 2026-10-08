/**
 * SEO Manager tools using the cvrt-seo-manager plugin.
 * Requires: cvrt-seo-manager active on the site, exposing mcp/seo/v1/*.
 * Fields verified against cvrt-seo-manager 1.13.0 (includes/class-rest-api.php
 * and the classes it delegates to); see src/drift/seo.json.
 * All routes require manage_options (satisfied by the app-password the MCP
 * server uses). Secret settings are returned masked as { set: boolean }.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { forSite } from "../client.js";
import { defined, jsonResult } from "../types.js";

const NS = "/mcp/seo/v1";

/** CSV text from exactly one of an inline string or a local .csv file. */
export async function csvBody(csv: string | undefined, csvFile: string | undefined): Promise<string> {
  if (csv !== undefined && csvFile !== undefined) throw new Error("Give csv or csv_file, not both");
  if (csv === undefined && csvFile === undefined) throw new Error("Give csv or csv_file");
  if (csvFile !== undefined && !csvFile.toLowerCase().endsWith(".csv")) {
    throw new Error(`csv_file must be a .csv file: ${csvFile}`);
  }
  const text = csv ?? (await readFile(csvFile as string, "utf8"));
  if (text.trim() === "") throw new Error("CSV is empty");
  return text;
}

const site = z.string().describe("Site id (see list_sites)");

/** Redirect status codes the plugin accepts (Cvrt_CSM_Redirects::ALLOWED_TYPES). */
const redirectType = z
  .union([z.literal(301), z.literal(302), z.literal(307), z.literal(410), z.literal(451)])
  .describe("HTTP status: 301 permanent, 302 found, 307 temporary, 410 gone, 451 unavailable for legal reasons (410/451 need no to_url)");

const NULL_CLEARS = "null deletes the stored value.";

/** Per-post SEO fields (Cvrt_CSM_REST_API::POST_META_KEYS). Every one is optional; null deletes it. */
const postSeoFields = {
  title: z.string().nullable().optional().describe(`SEO title (template tokens like %title%, %sep%, %sitename% allowed). ${NULL_CLEARS}`),
  description: z.string().nullable().optional().describe(`Meta description. ${NULL_CLEARS}`),
  focus_keywords: z
    .array(z.string())
    .nullable()
    .optional()
    .describe(`Focus keywords, max 5 (extra ones are dropped). ${NULL_CLEARS}`),
  robots: z
    .string()
    .nullable()
    .optional()
    .describe(`Robots directives, comma separated (e.g. "noindex,nofollow"). ${NULL_CLEARS}`),
  advanced_robots: z
    .object({
      "max-snippet": z.union([z.string(), z.number()]).optional().describe("e.g. -1 or 160"),
      "max-image-preview": z.string().optional().describe("none | standard | large"),
      "max-video-preview": z.union([z.string(), z.number()]).optional().describe("e.g. -1 or 30"),
    })
    .nullable()
    .optional()
    .describe(`Advanced robots directives; other keys are dropped by the server. ${NULL_CLEARS}`),
  canonical: z.string().nullable().optional().describe(`Canonical URL. ${NULL_CLEARS}`),
  og_title: z.string().nullable().optional().describe(`Open Graph title. ${NULL_CLEARS}`),
  og_description: z.string().nullable().optional().describe(`Open Graph description. ${NULL_CLEARS}`),
  og_image: z.number().int().nullable().optional().describe(`Open Graph image attachment ID. ${NULL_CLEARS}`),
  twitter_card: z
    .enum(["summary", "summary_large_image"])
    .nullable()
    .optional()
    .describe(`Twitter card type; unset falls back to the default_twitter_card setting. ${NULL_CLEARS}`),
  twitter_title: z.string().nullable().optional().describe(`Twitter title. ${NULL_CLEARS}`),
  twitter_description: z.string().nullable().optional().describe(`Twitter description. ${NULL_CLEARS}`),
  twitter_image: z.number().int().nullable().optional().describe(`Twitter image attachment ID. ${NULL_CLEARS}`),
  schema: z
    .union([z.record(z.any()), z.array(z.any()), z.string()])
    .nullable()
    .optional()
    .describe(`Custom JSON-LD (object, array or JSON string); overrides schema_type. Invalid JSON is stored as []. ${NULL_CLEARS}`),
  schema_type: z
    .string()
    .nullable()
    .optional()
    .describe(`Schema type built from post data: BlogPosting, Article, NewsArticle, WebPage or Product. ${NULL_CLEARS}`),
  software_app: z
    .record(z.any())
    .nullable()
    .optional()
    .describe(
      `Per-post SoftwareApplication schema: { enabled, name, applicationCategory, operatingSystem, description, url, offers: [{ name, price, priceCurrency, url, unitText, unitCode }] (max 20), aggregateRating }. Omitted enabled = true. ${NULL_CLEARS}`
    ),
  breadcrumb_title: z.string().nullable().optional().describe(`Title used in breadcrumbs. ${NULL_CLEARS}`),
  pillar_content: z.boolean().nullable().optional().describe(`Mark as pillar (cornerstone) content. ${NULL_CLEARS}`),
  seo_score: z.number().int().nullable().optional().describe(`Stored SEO score (0-100). ${NULL_CLEARS}`),
};

/** Per-term SEO fields (Cvrt_CSM_REST_API::TERM_META_KEYS). */
const termSeoFields = {
  title: postSeoFields.title,
  description: postSeoFields.description,
  robots: postSeoFields.robots,
  og_image: postSeoFields.og_image,
  schema: postSeoFields.schema,
};

const SETTINGS_DOC = [
  "Update cvrt-seo-manager settings (partial: only the keys you send change; unknown keys are ignored).",
  "Send keys flat ({ title_separator: '|' }) or grouped ({ titles: { title_separator: '|' } }); keys are the option names without the csm_ prefix. Returns the full settings (GET shape, secrets masked).",
  "Groups and keys:",
  "titles: title_separator, title_home, desc_home, title_post, desc_post, title_page, desc_page, title_product, desc_product, title_category, title_tag, title_author, title_search, title_404 (templates, tokens like %title% %sep% %sitename%).",
  "robots: default_robots (text); booleans noindex_archives, noindex_tags, noindex_author, noindex_search, noindex_paginated, noindex_password_protected, noindex_empty_archives, robots_max_directives.",
  "social: default_og_image (attachment ID), default_twitter_card (summary | summary_large_image), social_profiles (object network => URL, e.g. { facebook: 'https://...', twitter: '@handle' }), social_extra_profiles (1.12.0+: extra schema sameAs profile URLs as an array, a JSON array string or one URL per line; only absolute http(s) URLs are kept, duplicates removed), og_home_title, og_home_description, og_home_image (attachment ID).",
  "knowledge_graph: kg_type, kg_name, kg_description (multi-line), kg_logo (attachment ID), kg_url.",
  "schema: schema_defaults (object post_type => BlogPosting | Article | NewsArticle | WebPage | Product), schema_article_type, software_app (site-wide SoftwareApplication object, same shape as the per-post field).",
  "verification: verify_google, verify_bing, verify_pinterest, verify_yandex (public meta tokens).",
  "indexnow: indexnow_enabled (bool), indexnow_key (SECRET, write-only; blank keeps the stored key).",
  "search_console: gsc_service_account (SECRET, write-only: the service-account JSON key as a string; validated before anything is written; blank keeps it, null clears it), gsc_property, gsc_auto_submit (bool).",
  "advanced: robots_txt_extra (multi-line), llms_txt.",
  "sitemap: sitemap_post_types, sitemap_taxonomies, html_sitemap_post_types (arrays of slugs), sitemap_exclude_noindex, sitemap_images, sitemap_authors (bools), sitemap_max_per_page (int).",
  "breadcrumbs: breadcrumbs_enabled, breadcrumbs_show_home, breadcrumbs_show_post_title (bools), breadcrumbs_separator, breadcrumbs_home_label.",
  "images: image_seo_enabled (bool), image_alt_template, image_title_template.",
  "links: nofollow_external, external_new_tab, strip_category_base (bools).",
  "local_seo: local_business_type, local_address (object), local_phone, local_email, local_hours (array), local_geo ({ latitude, longitude }), local_price_range.",
  "monitor_404: 404_monitor_enabled (bool), 404_retention_days, 404_max_rows (ints), 404_exclude_patterns (array of patterns).",
  "woocommerce: woo_remove_base_slug, woo_remove_category_base, woo_remove_generator (bools), woo_brand_taxonomy.",
].join(" ");

export interface Redirect {
  id: number;
  from_url: string;
  to_url: string;
  type: number;
  is_regex: boolean;
  hits: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface IndexNowResult {
  url: string;
  ok: boolean;
  error?: string;
}

function requireFields(body: Record<string, unknown>, what: string): void {
  if (Object.keys(body).length === 0) throw new Error(`Provide at least one ${what} to change`);
}

export function register(server: McpServer) {
  server.tool(
    "seo_status",
    "Get cvrt-seo-manager status: { version, configured, dependencies: { php, wordpress } }.",
    { site },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(
        await wp.get<{ version: string; configured: boolean; dependencies: { php: string; wordpress: string } }>(`${NS}/status`)
      );
    }
  );

  server.tool(
    "seo_get_settings",
    "Get cvrt-seo-manager settings grouped by section (titles, robots, social, knowledge_graph, schema, verification, indexnow, search_console, advanced, sitemap, breadcrumbs, images, links, local_seo, monitor_404, woocommerce). Secret values are returned as { set: boolean }, never raw.",
    { site },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Record<string, Record<string, unknown>>>(`${NS}/settings`));
    }
  );

  server.tool(
    "seo_update_settings",
    SETTINGS_DOC,
    {
      site,
      settings: z
        .record(z.any())
        .describe("Partial settings, flat or grouped (see the tool description for every group and key)"),
    },
    async ({ site, settings }) => {
      requireFields(settings, "setting");
      const wp = forSite(site);
      return jsonResult(await wp.put<Record<string, Record<string, unknown>>>(`${NS}/settings`, settings));
    }
  );

  server.tool(
    "seo_get_post_seo",
    "Get the SEO meta for a post (every field, null when unset; plus language and translations when Polylang is active).",
    {
      site,
      id: z.number().int().describe("Post ID"),
    },
    async ({ site, id }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Record<string, unknown>>(`${NS}/posts/${id}/seo`));
    }
  );

  server.tool(
    "seo_update_post_seo",
    "Update the SEO meta for a post (partial: only the fields you give change; null deletes a field). Purges the post's page cache. Returns the post's full SEO meta.",
    {
      site,
      id: z.number().int().describe("Post ID"),
      ...postSeoFields,
    },
    async ({ site, id, ...fields }) => {
      const body = defined(fields);
      requireFields(body, "SEO field");
      const wp = forSite(site);
      return jsonResult(await wp.put<Record<string, unknown>>(`${NS}/posts/${id}/seo`, body));
    }
  );

  server.tool(
    "seo_delete_post_seo",
    "Delete (reset) every SEO meta field of a post. Returns { deleted: true }.",
    {
      site,
      id: z.number().int().describe("Post ID"),
    },
    async ({ site, id }) => {
      const wp = forSite(site);
      return jsonResult(await wp.delete<{ deleted: boolean }>(`${NS}/posts/${id}/seo`));
    }
  );

  server.tool(
    "seo_get_post_analysis",
    "Run the SEO content analysis for a post: { score, checks }.",
    {
      site,
      id: z.number().int().describe("Post ID"),
    },
    async ({ site, id }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<{ score: number; checks: unknown }>(`${NS}/posts/${id}/analysis`));
    }
  );

  server.tool(
    "seo_list_posts_seo",
    "List SEO meta of published posts, newest ID first: [{ id, title, url, seo, language?, translations? }].",
    {
      site,
      post_type: z.string().optional().describe("Post type (default post)"),
      per_page: z.number().int().min(1).max(100).optional().describe("Items per page, 1-100 (default 50)"),
      page: z.number().int().min(1).optional().describe("Page number (default 1)"),
      lang: z.string().optional().describe("Polylang language code (default: every language; ignored without Polylang)"),
      has_seo: z
        .boolean()
        .optional()
        .describe("true = only posts with an SEO title set, false = only posts without one (default: all)"),
    },
    async ({ site, post_type, per_page, page, lang, has_seo }) => {
      const wp = forSite(site);
      const params = defined({
        post_type,
        per_page,
        page,
        lang,
        has_seo: has_seo === undefined ? undefined : String(has_seo),
      }) as Record<string, string | number>;
      return jsonResult(await wp.get<unknown[]>(`${NS}/posts/seo`, params));
    }
  );

  server.tool(
    "seo_bulk_update_posts_seo",
    "Bulk update SEO meta of up to 100 posts. Each item is { id, ...fields } with the same fields as seo_update_post_seo (null deletes a field, omitted fields are kept). Returns { updated, errors: [{ index, id?, message }] }.",
    {
      site,
      items: z
        .array(z.object({ id: z.number().int().describe("Post ID"), ...postSeoFields }))
        .min(1)
        .max(100)
        .describe("Posts to update (max 100)"),
    },
    async ({ site, items }) => {
      const wp = forSite(site);
      const body = { items: items.map((item) => defined(item)) };
      return jsonResult(
        await wp.put<{ updated: number; errors: Array<{ index: number; id?: number; message: string }> }>(`${NS}/posts/seo/bulk`, body)
      );
    }
  );

  server.tool(
    "seo_get_term_seo",
    "Get the SEO meta for a taxonomy term: { title, description, robots, og_image, schema } (null when unset).",
    {
      site,
      id: z.number().int().describe("Term ID"),
    },
    async ({ site, id }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Record<string, unknown>>(`${NS}/terms/${id}/seo`));
    }
  );

  server.tool(
    "seo_update_term_seo",
    "Update the SEO meta for a taxonomy term (partial; null deletes a field). Returns the term's full SEO meta.",
    {
      site,
      id: z.number().int().describe("Term ID"),
      ...termSeoFields,
    },
    async ({ site, id, ...fields }) => {
      const body = defined(fields);
      requireFields(body, "SEO field");
      const wp = forSite(site);
      return jsonResult(await wp.put<Record<string, unknown>>(`${NS}/terms/${id}/seo`, body));
    }
  );

  server.tool(
    "seo_delete_term_seo",
    "Delete (reset) every SEO meta field of a taxonomy term. Returns { deleted: true }.",
    {
      site,
      id: z.number().int().describe("Term ID"),
    },
    async ({ site, id }) => {
      const wp = forSite(site);
      return jsonResult(await wp.delete<{ deleted: boolean }>(`${NS}/terms/${id}/seo`));
    }
  );

  server.tool(
    "seo_keyword_check",
    "Check whether a focus keyword is already used by another post (case-insensitive). Returns { unique, posts: [{ id, title }] }.",
    {
      site,
      keyword: z.string().min(1).describe("Focus keyword to check"),
      exclude_post_id: z.number().int().optional().describe("Post ID to ignore (the post being edited)"),
    },
    async ({ site, keyword, exclude_post_id }) => {
      const wp = forSite(site);
      return jsonResult(
        await wp.post<{ unique: boolean; posts: Array<{ id: number; title: string }> }>(
          `${NS}/analysis/keyword-check`,
          defined({ keyword, exclude_post_id })
        )
      );
    }
  );

  server.tool(
    "seo_list_redirects",
    "List redirects, newest first: { items: [{ id, from_url, to_url, type, is_regex, hits, enabled, created_at, updated_at }], total, pages }.",
    {
      site,
      page: z.number().int().min(1).optional().describe("Page number (default 1)"),
      per_page: z.number().int().min(1).max(100).optional().describe("Items per page, 1-100 (default 50)"),
      search: z.string().optional().describe("Substring of from_url or to_url"),
      type: redirectType.optional().describe("Only redirects with this status code"),
      enabled: z.boolean().optional().describe("Only enabled (true) or disabled (false) redirects (default: all)"),
    },
    async ({ site, page, per_page, search, type, enabled }) => {
      const wp = forSite(site);
      const params = defined({
        page,
        per_page,
        search,
        type,
        // The server casts the raw query value to bool, so "false" would read as true; send 1/0.
        enabled: enabled === undefined ? undefined : enabled ? 1 : 0,
      }) as Record<string, string | number>;
      return jsonResult(await wp.get<{ items: Redirect[]; total: number; pages: number }>(`${NS}/redirects`, params));
    }
  );

  server.tool(
    "seo_create_redirect",
    "Create a redirect. Rejects invalid regex, unknown status codes and redirect loops/chains deeper than 5. Returns the redirect.",
    {
      site,
      from_url: z.string().describe("Source path or URL (a regex pattern without delimiters when is_regex)"),
      to_url: z.string().optional().describe("Target path or URL (required unless type is 410 or 451)"),
      type: redirectType.optional().describe("HTTP status (default 301): 301, 302, 307, 410, 451"),
      is_regex: z.boolean().optional().describe("Treat from_url as a regex (default false)"),
      enabled: z.boolean().optional().describe("Redirect is active (default true)"),
    },
    async ({ site, from_url, to_url, type, is_regex, enabled }) => {
      const wp = forSite(site);
      return jsonResult(await wp.post<Redirect>(`${NS}/redirects`, defined({ from_url, to_url, type, is_regex, enabled })));
    }
  );

  server.tool(
    "seo_get_redirect",
    "Get a redirect by id.",
    {
      site,
      id: z.number().int().describe("Redirect ID"),
    },
    async ({ site, id }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Redirect>(`${NS}/redirects/${id}`));
    }
  );

  server.tool(
    "seo_update_redirect",
    "Update a redirect (partial: omitted fields keep their stored value). Returns the redirect.",
    {
      site,
      id: z.number().int().describe("Redirect ID"),
      from_url: z.string().optional().describe("Source path or URL (regex when is_regex)"),
      to_url: z.string().optional().describe("Target path or URL"),
      type: redirectType.optional().describe("HTTP status: 301, 302, 307, 410, 451"),
      is_regex: z.boolean().optional().describe("Treat from_url as a regex"),
      enabled: z.boolean().optional().describe("Redirect is active"),
    },
    async ({ site, id, from_url, to_url, type, is_regex, enabled }) => {
      const body = defined({ from_url, to_url, type, is_regex, enabled });
      requireFields(body, "redirect field");
      const wp = forSite(site);
      return jsonResult(await wp.put<Redirect>(`${NS}/redirects/${id}`, body));
    }
  );

  server.tool(
    "seo_delete_redirect",
    "Delete a redirect by id. Returns { deleted: true }.",
    {
      site,
      id: z.number().int().describe("Redirect ID"),
    },
    async ({ site, id }) => {
      const wp = forSite(site);
      return jsonResult(await wp.delete<{ deleted: boolean }>(`${NS}/redirects/${id}`));
    }
  );

  server.tool(
    "seo_list_monitor_log",
    "List the 404 monitor log: { items: [{ id, url, hits, first_seen, last_seen, ... }], total, pages }.",
    {
      site,
      page: z.number().int().min(1).optional().describe("Page number (default 1)"),
      per_page: z.number().int().min(1).max(100).optional().describe("Items per page, 1-100 (default 50)"),
      search: z.string().optional().describe("Substring of the 404 URL"),
      order_by: z.enum(["id", "url", "hits", "first_seen", "last_seen"]).optional().describe("Sort column (default last_seen)"),
      order: z.enum(["ASC", "DESC"]).optional().describe("Sort direction (default DESC)"),
    },
    async ({ site, page, per_page, search, order_by, order }) => {
      const wp = forSite(site);
      const params = defined({ page, per_page, search, order_by, order }) as Record<string, string | number>;
      return jsonResult(await wp.get<{ items: unknown[]; total: number; pages: number }>(`${NS}/monitor/log`, params));
    }
  );

  server.tool(
    "seo_clear_monitor_log",
    "Delete 404 monitor log entries: one entry by id, or every entry last seen within from..to (inclusive dates, either bound optional). With no argument the WHOLE log is cleared. Returns { deleted, success }.",
    {
      site,
      id: z.number().int().positive().optional().describe("Delete only this log entry"),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Delete entries last seen on or after this date (YYYY-MM-DD)"),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Delete entries last seen on or before this date (YYYY-MM-DD)"),
    },
    async ({ site, id, from, to }) => {
      const wp = forSite(site);
      // The endpoint reads get_json_params(), so the selection goes in the DELETE body.
      const body = defined({ id, from, to });
      return jsonResult(
        await wp.delete<{ deleted: number; success: boolean }>(`${NS}/monitor/log`, undefined, Object.keys(body).length ? body : undefined)
      );
    }
  );

  server.tool(
    "seo_create_redirect_from_log",
    "Create a 301 redirect from a 404 monitor log entry's URL to to_url. Fails with 409 when a redirect from that URL already exists.",
    {
      site,
      id: z.number().int().describe("404 monitor log entry ID"),
      to_url: z.string().describe("Redirect target URL"),
    },
    async ({ site, id, to_url }) => {
      const wp = forSite(site);
      return jsonResult(await wp.post<unknown>(`${NS}/monitor/log/${id}/redirect`, { to_url }));
    }
  );

  server.tool(
    "seo_sitemap_status",
    "Get sitemap status: { sitemap_url, post_types, taxonomies, total_urls, search_console? }.",
    { site },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Record<string, unknown>>(`${NS}/sitemap/status`));
    }
  );

  server.tool(
    "seo_sitemap_ping",
    "Submit the sitemap to Google Search Console (needs the search_console settings) and return the status Search Console reports. The old Google/Bing ping URLs are switched off.",
    { site },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.post<unknown>(`${NS}/sitemap/submit`, {}));
    }
  );

  server.tool(
    "seo_indexnow_ping",
    "Submit URLs to IndexNow (one request per URL). Returns [{ url, ok, error? }]; ok means the site dispatched the ping (non-blocking), a failing URL does not stop the others.",
    {
      site,
      url: z.string().optional().describe("A URL to submit"),
      urls: z.array(z.string()).optional().describe("URLs to submit (combined with url, duplicates removed)"),
    },
    async ({ site, url, urls }) => {
      const list = [...new Set([...(url ? [url] : []), ...(urls ?? [])])];
      if (list.length === 0) throw new Error("Provide url or urls");
      const wp = forSite(site);
      const results: IndexNowResult[] = [];
      for (const u of list) {
        try {
          const dispatched = await wp.post<boolean>(`${NS}/indexnow/ping`, { url: u });
          results.push(dispatched === true ? { url: u, ok: true } : { url: u, ok: false, error: "not dispatched (empty URL or no IndexNow key)" });
        } catch (e) {
          results.push({ url: u, ok: false, error: (e as Error).message });
        }
      }
      return jsonResult(results);
    }
  );

  server.tool(
    "seo_export_settings",
    "Export every csm_* option as a flat { csm_name: value } map. Secrets are masked as { set: boolean }.",
    { site },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Record<string, unknown>>(`${NS}/export/settings`));
    }
  );

  server.tool(
    "seo_import_settings",
    "Import settings from a flat { csm_name: value } map (the seo_export_settings shape). Only csm_* keys are written; secrets (csm_indexnow_key, csm_gsc_service_account, csm_github_token) are never imported. Returns the number of options written.",
    {
      site,
      data: z.record(z.any()).describe("Flat map of csm_* option names to values, e.g. { csm_title_separator: '|' }"),
    },
    async ({ site, data }) => {
      requireFields(data, "setting");
      const wp = forSite(site);
      return jsonResult(await wp.post<number>(`${NS}/import/settings`, data));
    }
  );

  server.tool(
    "seo_export_csv",
    "Export post SEO meta as a CSV string (post_id, post_title, url, seo_title, seo_description, focus_keywords, seo_score).",
    { site },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<string>(`${NS}/export/csv`));
    }
  );

  server.tool(
    "seo_import_csv",
    "Import post SEO meta from CSV in the seo_export_csv format (header row, then one row per post with at least 7 columns; export first and edit that). Give the CSV inline (csv) or as a local .csv path (csv_file). It is sent as the raw text/csv request body. Returns { success, errors } row counts.",
    {
      site,
      csv: z.string().optional().describe("CSV text including the header row"),
      csv_file: z.string().optional().describe("Absolute path to a local .csv file"),
    },
    async ({ site, csv, csv_file }) => {
      const body = await csvBody(csv, csv_file);
      const wp = forSite(site);
      return jsonResult(await wp.postRaw<{ success: number; errors: number }>(`${NS}/import/csv`, body, "text/csv; charset=utf-8"));
    }
  );

  server.tool(
    "seo_export_redirects",
    "Export every redirect as a CSV string (source, target, type, is_regex, enabled).",
    { site },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<string>(`${NS}/export/redirects`));
    }
  );

  server.tool(
    "seo_import_redirects",
    "Import redirects from CSV in the seo_export_redirects format (header row source,target,type[,is_regex],enabled; the is_regex column is detected from the header). Give the CSV inline (csv) or as a local .csv path (csv_file). It is sent as the raw text/csv request body.",
    {
      site,
      csv: z.string().optional().describe("CSV text including the header row"),
      csv_file: z.string().optional().describe("Absolute path to a local .csv file"),
    },
    async ({ site, csv, csv_file }) => {
      const body = await csvBody(csv, csv_file);
      const wp = forSite(site);
      return jsonResult(await wp.postRaw<Record<string, unknown>>(`${NS}/import/redirects`, body, "text/csv; charset=utf-8"));
    }
  );

  server.tool(
    "seo_import_migrate",
    "Migrate from RankMath or Yoast. Default: per-post/term meta and redirects are migrated (WRITES immediately, dry_run is not honoured here) and { posts_migrated, terms_migrated, redirects_migrated, errors } is returned. With settings=true (RankMath only) ONLY the global titles/meta/sitemap/robots settings are ported instead, and dry_run=true reports { written, skipped, dry_run } without writing.",
    {
      site,
      source: z.enum(["rankmath", "yoast"]).describe("Plugin to migrate from"),
      settings: z.boolean().optional().describe("Port the global settings instead of the meta (RankMath only, default false)"),
      dry_run: z.boolean().optional().describe("With settings=true: compute but write nothing (default false). Ignored for the meta migration."),
    },
    async ({ site, source, settings, dry_run }) => {
      const wp = forSite(site);
      return jsonResult(await wp.post<Record<string, unknown>>(`${NS}/import/migrate`, defined({ source, settings, dry_run })));
    }
  );
}
