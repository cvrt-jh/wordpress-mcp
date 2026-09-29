/**
 * Legal document and cookie consent tools using the cvrt-legal plugin.
 * Requires: cvrt-legal WordPress plugin (v0.2.0+) with the mcp/legal/v1 API.
 * All routes require the authenticated user to hold manage_options (satisfied
 * by the app-password used by this MCP server). Secrets are returned masked as
 * { set: boolean }.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { forSite } from "../client.js";
import { jsonResult } from "../types.js";

const NS = "/mcp/legal/v1";

const site = z.string().describe("Site id (see list_sites)");
const doc = z
  .enum(["impressum", "datenschutz", "agb", "widerruf", "barrierefreiheit"])
  .describe("Document type");

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("YYYY-MM-DD");

const sectionSchema = z.object({
  slug: z
    .string()
    .optional()
    .describe("Stable slug; derived from the heading when omitted"),
  heading: z.string(),
  body: z.string().describe("HTML body"),
  level: z.number().optional().describe("2 or 3, default 2"),
});

const generatedDoc = z
  .enum(["impressum", "datenschutz", "barrierefreiheit"])
  .describe("Generated document: impressum, datenschutz or barrierefreiheit (BFSG statement, cvrt-legal 0.9.0+)");

const flags = z.record(z.boolean());

/** Drop the keys a caller left out, so the plugin's merge keeps their values. */
function given(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
}

/**
 * The body of a large import: inline, or read from a local JSON file. A
 * 120 KB Datenschutz library is not something to paste into a tool call; the
 * file is what websites/bin/legal-v4 builds anyway.
 */
async function jsonBody(
  inline: Record<string, unknown> | undefined,
  file: string | undefined,
  name: string
): Promise<Record<string, unknown>> {
  if (inline !== undefined && file !== undefined) {
    throw new Error(`Give ${name} or ${name}_file, not both`);
  }
  if (inline !== undefined) {
    return inline;
  }
  if (file === undefined) {
    throw new Error(`Give ${name} or ${name}_file`);
  }
  if (!file.endsWith(".json")) {
    throw new Error(`${name}_file must be a .json file: ${file}`);
  }
  const text = await readFile(file, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`${file} is not valid JSON: ${(e as Error).message}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${file} must hold a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

export function register(server: McpServer) {
  server.tool(
    "legal_status",
    "Legal document status for a site: which documents are required, filled and published, plus a single compliant flag. Impressum and Datenschutz are always required; AGB and Widerruf become required when WooCommerce is active.",
    { site },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Record<string, unknown>>(`${NS}/status`));
    }
  );

  server.tool(
    "legal_list_documents",
    "List all legal document types with their required/filled state and linked page.",
    { site },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Record<string, unknown>>(`${NS}/documents`));
    }
  );

  server.tool(
    "legal_get_document",
    "Get one legal document including its ordered sections.",
    { site, doc },
    async ({ site, doc }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Record<string, unknown>>(`${NS}/documents/${doc}`));
    }
  );

  server.tool(
    "legal_put_document",
    "Replace a legal document. Sections are ordered; omit slug to derive it from the heading. The plugin ships no legal prose - it stores and renders what it is given.",
    {
      site,
      doc,
      title: z.string().describe("Document title, rendered as the H1"),
      sections: z.array(sectionSchema).describe("Ordered sections"),
    },
    async ({ site, doc, title, sections }) => {
      const wp = forSite(site);
      return jsonResult(
        await wp.put<Record<string, unknown>>(`${NS}/documents/${doc}`, { title, sections })
      );
    }
  );

  server.tool(
    "legal_render_document",
    "Render a document to normalized HTML without saving. Useful to preview the heading hierarchy and slug ids before writing.",
    { site, doc },
    async ({ site, doc }) => {
      const wp = forSite(site);
      return jsonResult(
        await wp.get<Record<string, unknown>>(`${NS}/documents/${doc}/render`)
      );
    }
  );

  server.tool(
    "legal_get_page",
    "Get which page a legal document is linked to: linked, page_id, the page's post status, and ok (linked AND published). A required document only counts as reachable, and legal_status only turns compliant, when ok is true. Requires cvrt-legal 0.4.2+.",
    { site, doc },
    async ({ site, doc }) => {
      const wp = forSite(site);
      return jsonResult(
        await wp.get<Record<string, unknown>>(`${NS}/documents/${doc}/page`)
      );
    }
  );

  server.tool(
    "legal_link_page",
    "Link a legal document to its WordPress page (post type page only; posts and products are refused). The rendered document is written into the page's post_content at once (mirrored: true, false while the document is empty) and on every later save, so a deactivated plugin still leaves the text on the page. Linking impressum/datenschutz also fills the consent banner's imprint/privacy link if that is still unset (banner_linked). page_id 0 unlinks. Requires cvrt-legal 0.4.2+.",
    {
      site,
      doc,
      page_id: z
        .number()
        .int()
        .min(0)
        .describe("Page id to link, 0 to unlink"),
    },
    async ({ site, doc, page_id }) => {
      const wp = forSite(site);
      return jsonResult(
        await wp.put<Record<string, unknown>>(`${NS}/documents/${doc}/page`, { page_id })
      );
    }
  );

  server.tool(
    "legal_add_section",
    "Append a section to a legal document. Returns the resolved slug, which is what shortcodes address.",
    {
      site,
      doc,
      heading: z.string(),
      body: z.string().describe("HTML body"),
      level: z.number().optional().describe("2 or 3, default 2"),
      slug: z.string().optional(),
    },
    async ({ site, doc, ...args }) => {
      const wp = forSite(site);
      const body = Object.fromEntries(
        Object.entries(args).filter(([, v]) => v !== undefined)
      );
      return jsonResult(
        await wp.post<Record<string, unknown>>(`${NS}/documents/${doc}/sections`, body)
      );
    }
  );

  server.tool(
    "legal_update_section",
    "Update a section. The slug is never rewritten, so shortcodes already placed on a page keep working when a heading is renamed.",
    {
      site,
      doc,
      slug: z.string().describe("Section slug"),
      heading: z.string().optional(),
      body: z.string().optional(),
      level: z.number().optional(),
    },
    async ({ site, doc, slug, ...args }) => {
      const wp = forSite(site);
      const body = Object.fromEntries(
        Object.entries(args).filter(([, v]) => v !== undefined)
      );
      return jsonResult(
        await wp.put<Record<string, unknown>>(`${NS}/documents/${doc}/sections/${slug}`, body)
      );
    }
  );

  server.tool(
    "legal_delete_section",
    "Delete a section from a legal document.",
    { site, doc, slug: z.string().describe("Section slug") },
    async ({ site, doc, slug }) => {
      const wp = forSite(site);
      return jsonResult(
        await wp.delete<Record<string, unknown>>(`${NS}/documents/${doc}/sections/${slug}`)
      );
    }
  );

  server.tool(
    "legal_get_consent",
    "Get the cookie consent banner configuration.",
    { site },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Record<string, unknown>>(`${NS}/consent`));
    }
  );

  server.tool(
    "legal_put_consent",
    "Configure the consent banner and every tracking credential the site uses. Nothing is handed to the browser until the visitor accepts - this plugin owns GTM, GA4 and Ahrefs Web Analytics precisely because it owns the gate. Search-engine verification meta tags are NOT here; those belong to cvrt-seo-manager because they fire no request.",
    {
      site,
      enabled: z.boolean(),
      gtm_id: z.string().optional().describe("GTM-XXXXXXX"),
      loader_url: z
        .string()
        .optional()
        .describe(
          "Optional first-party GTM loader URL. Leave empty to load straight from googletagmanager.com (the default on all our sites)"
        ),
      ga4_id: z
        .string()
        .optional()
        .describe(
          "GA4 measurement id G-XXXXXXXXXX, for a site running GA4 WITHOUT a GTM container. Ignored when gtm_id is set, since loading both double-counts every hit."
        ),
      ahrefs_key: z
        .string()
        .optional()
        .describe(
          "Ahrefs Web Analytics data-key. Cookieless but still a third-party request, so it is consent-gated and must be named in the Datenschutz text before enabling."
        ),
      privacy_page: z.number().optional().describe("Page id of the Datenschutz page"),
      imprint_page: z.number().optional().describe("Page id of the Impressum page"),
      log_enabled: z
        .boolean()
        .optional()
        .describe(
          "Turn the consent decision log on or off. Stays off (the default) until a 'einwilligungsnachweis' section exists in the Datenschutz document - set it only after that section is in place."
        ),
    },
    async ({ site, ...args }) => {
      const wp = forSite(site);
      const body = Object.fromEntries(
        Object.entries(args).filter(([, v]) => v !== undefined)
      );
      return jsonResult(await wp.put<Record<string, unknown>>(`${NS}/consent`, body));
    }
  );

  server.tool(
    "legal_get_theme",
    "Get the banner theme: preset name, CSS custom property overrides and the rendered CSS.",
    { site },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Record<string, unknown>>(`${NS}/consent/theme`));
    }
  );

  server.tool(
    "legal_put_theme",
    "Set the banner theme preset and/or individual CSS custom properties. Only --cvrt-consent-* properties are accepted.",
    {
      site,
      preset: z.string().optional().describe("default or dark"),
      vars: z.record(z.string()).optional().describe("--cvrt-consent-* overrides"),
    },
    async ({ site, ...args }) => {
      const wp = forSite(site);
      const body = Object.fromEntries(
        Object.entries(args).filter(([, v]) => v !== undefined)
      );
      return jsonResult(await wp.put<Record<string, unknown>>(`${NS}/consent/theme`, body));
    }
  );

  server.tool(
    "legal_get_settings",
    "Get cvrt-legal settings. Secret values are returned as { set: boolean }, never raw.",
    { site },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Record<string, unknown>>(`${NS}/settings`));
    }
  );

  server.tool(
    "legal_consent_log_get",
    "Get every logged consent decision for one consent_id (the banner's own record of what it asked and what the visitor chose). Requires manage_options. Logging itself stays off until legal_put_consent's log_enabled is set, which should only happen after the Datenschutz document has an 'einwilligungsnachweis' section describing it. Requires cvrt-legal 0.5.0+.",
    {
      site,
      consent_id: z.string().uuid().describe("The consent_id the banner generated for one visitor"),
    },
    async ({ site, consent_id }) => {
      const wp = forSite(site);
      return jsonResult(
        await wp.get<Record<string, unknown>>(`${NS}/consent/log`, { consent_id })
      );
    }
  );

  server.tool(
    "legal_consent_log_stats",
    "Aggregate consent decision counts by action and banner_version over a day range (both from and to are optional, default the last 30 days; the range cannot exceed 366 days). Requires manage_options. Logging itself stays off until legal_put_consent's log_enabled is set, which should only happen after the Datenschutz document has an 'einwilligungsnachweis' section describing it. Requires cvrt-legal 0.5.0+.",
    {
      site,
      from: dateSchema.optional().describe("Range start, inclusive. Defaults to 30 days before to."),
      to: dateSchema.optional().describe("Range end, inclusive. Defaults to today."),
    },
    async ({ site, ...args }) => {
      const wp = forSite(site);
      const params = Object.fromEntries(
        Object.entries(args).filter(([, v]) => v !== undefined)
      ) as Record<string, string>;
      return jsonResult(
        await wp.get<Record<string, unknown>>(`${NS}/consent/log/stats`, params)
      );
    }
  );

  server.tool(
    "legal_consent_log_export",
    "Export the raw consent decision log as CSV for a day range (same optional from/to rules as legal_consent_log_stats). Returns { filename, csv }; the csv is the full file text, ready to write out as-is. Requires manage_options. Logging itself stays off until legal_put_consent's log_enabled is set, which should only happen after the Datenschutz document has an 'einwilligungsnachweis' section describing it. Requires cvrt-legal 0.5.0+.",
    {
      site,
      from: dateSchema.optional().describe("Range start, inclusive. Defaults to 30 days before to."),
      to: dateSchema.optional().describe("Range end, inclusive. Defaults to today."),
    },
    async ({ site, ...args }) => {
      const wp = forSite(site);
      const params = Object.fromEntries(
        Object.entries(args).filter(([, v]) => v !== undefined)
      ) as Record<string, string>;
      return jsonResult(
        await wp.get<Record<string, unknown>>(`${NS}/consent/log/export`, params)
      );
    }
  );
  server.tool(
    "legal_update_settings",
    "Update cvrt-legal settings. github_token (PUC auto-updates on a private repo) is write-only: a blank value keeps the stored one. required_override forces a document required or not ({agb: false}).",
    {
      site,
      github_token: z.string().optional().describe("GitHub token for plugin updates; blank keeps the stored one"),
      required_override: z.record(z.boolean()).optional().describe("doc => required, overriding the WooCommerce rule"),
    },
    async ({ site, ...args }) => {
      const wp = forSite(site);
      return jsonResult(await wp.post<Record<string, unknown>>(`${NS}/settings`, given(args)));
    }
  );

  server.tool(
    "legal_get_facts",
    "Get the Impressum fields (company, address, register, VAT id, ...) the generator fills into both Impressum and Datenschutz, plus which required ones are missing. Requires cvrt-legal 0.7.0+.",
    { site },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Record<string, unknown>>(`${NS}/facts`));
    }
  );

  server.tool(
    "legal_put_facts",
    "Set Impressum fields. Merges: only the keys given change; an empty string clears a field. Regenerates every generated document. Requires cvrt-legal 0.7.0+.",
    {
      site,
      facts: z.record(z.string()).describe("field key => value, keys as legal_get_facts lists them"),
    },
    async ({ site, facts }) => {
      const wp = forSite(site);
      return jsonResult(await wp.put<Record<string, unknown>>(`${NS}/facts`, facts));
    }
  );

  server.tool(
    "legal_get_generator",
    "Get a generated document's state: active, library loaded, the selection (ticked modules, options, kept custom sections) and the sections it writes. Requires cvrt-legal 0.7.0+.",
    { site, doc: generatedDoc },
    async ({ site, doc }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Record<string, unknown>>(`${NS}/generator/${doc}`));
    }
  );

  server.tool(
    "legal_put_generator",
    "Tick or untick modules and options, then regenerate the document (the Datenschutz tab over the API). Merges into the stored selection; unknown module or option keys are refused. Sections tied to a switch (Einwilligungsnachweis, Barrierefreiheits-Werkzeug) follow that switch and are not ticked here. Requires cvrt-legal 0.7.0+.",
    {
      site,
      doc: generatedDoc,
      enabled: flags.optional().describe("module key => on/off"),
      options: z.record(flags).optional().describe("module key => { option key => on/off }"),
      keep: z.array(z.string()).optional().describe("slugs of sections added through the API that survive regeneration"),
    },
    async ({ site, doc, ...args }) => {
      const wp = forSite(site);
      return jsonResult(await wp.put<Record<string, unknown>>(`${NS}/generator/${doc}`, given(args)));
    }
  );

  server.tool(
    "legal_get_generator_library",
    "Get the imported text library of a generated document (the texts come from websites/bin/legal-v4/privacy, the plugin ships none). Requires cvrt-legal 0.7.0+.",
    { site, doc: generatedDoc },
    async ({ site, doc }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<unknown>(`${NS}/generator/${doc}/library`));
    }
  );

  server.tool(
    "legal_put_generator_library",
    "Import the text library of a generated document and regenerate it if active. Give the library inline or as library_file, a local .json path (e.g. websites/bin/legal-v4/privacy/library-datenschutz.json). A library using the 'accessibility' flag needs cvrt-legal 0.8.0+ on the site first.",
    {
      site,
      doc: generatedDoc,
      library: z.record(z.unknown()).optional().describe("Library object as library.py emits it"),
      library_file: z.string().optional().describe("Absolute path to a local .json library file"),
    },
    async ({ site, doc, library, library_file }) => {
      const body = await jsonBody(library, library_file, "library");
      const wp = forSite(site);
      return jsonResult(await wp.put<Record<string, unknown>>(`${NS}/generator/${doc}/library`, body));
    }
  );

  server.tool(
    "legal_restore_generator",
    "Restore a generated document to how it was before the generator first wrote it, and stop generating it. Requires cvrt-legal 0.7.0+.",
    { site, doc: generatedDoc },
    async ({ site, doc }) => {
      const wp = forSite(site);
      return jsonResult(await wp.post<Record<string, unknown>>(`${NS}/generator/${doc}/restore`, {}));
    }
  );

  server.tool(
    "legal_get_social",
    "Get the social-media section configurator: networks on offer, which are switched on with their profile URLs, and the rendered preview. Requires cvrt-legal 0.6.0+.",
    { site },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Record<string, unknown>>(`${NS}/social`));
    }
  );

  server.tool(
    "legal_put_social",
    "Switch social networks and set their profile URLs (https only), then rewrite the Datenschutz social-media section; with nothing on, the section is removed. Requires cvrt-legal 0.6.0+.",
    {
      site,
      networks: z
        .record(z.object({ enabled: z.boolean(), urls: z.array(z.string()).optional() }))
        .describe("network key => { enabled, urls }"),
    },
    async ({ site, networks }) => {
      const wp = forSite(site);
      return jsonResult(await wp.put<Record<string, unknown>>(`${NS}/social`, { networks }));
    }
  );

  server.tool(
    "legal_get_social_modules",
    "Get the imported social-media text modules. Requires cvrt-legal 0.6.0+.",
    { site },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<unknown>(`${NS}/social/modules`));
    }
  );

  server.tool(
    "legal_put_social_modules",
    "Import the social-media text modules, inline or as modules_file (websites/bin/legal-v4/social-media/library.json). Careful: importing while nothing is ticked removes an existing section; call legal_put_social with the current networks right after. Requires cvrt-legal 0.6.0+.",
    {
      site,
      modules: z.record(z.unknown()).optional().describe("Modules object as social-media/library.py emits it"),
      modules_file: z.string().optional().describe("Absolute path to a local .json modules file"),
    },
    async ({ site, modules, modules_file }) => {
      const body = await jsonBody(modules, modules_file, "modules");
      const wp = forSite(site);
      return jsonResult(await wp.put<Record<string, unknown>>(`${NS}/social/modules`, body));
    }
  );

  server.tool(
    "legal_get_accessibility",
    "Get the self-hosted accessibility tool's settings (enabled, position, colour, tools, statement link) and the tools on offer. Requires cvrt-legal 0.8.0+.",
    { site },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Record<string, unknown>>(`${NS}/accessibility`));
    }
  );

  server.tool(
    "legal_put_accessibility",
    "Configure the self-hosted accessibility tool (replaces the Ally widget; no third-party request, needs no consent). Merges: omitted keys keep their value. Switching enabled rewrites a generated Datenschutz (section Barrierefreiheits-Werkzeug). Returns the stored settings. Requires cvrt-legal 0.8.0+.",
    {
      site,
      enabled: z.boolean().optional(),
      position: z.enum(["bottom-right", "bottom-left", "top-right", "top-left"]).optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe("Launcher colour, #rrggbb"),
      tools: flags.optional().describe("tool key => on/off (see available_tools in legal_get_accessibility)"),
      repairs: flags
        .optional()
        .describe(
          "Markup repair rule => on/off (cvrt-legal 0.9.0+): link-names, image-alt, iframe-title, form-labels, skip-link, lang, zoom, new-tab, duplicate-ids. Server-side, never invents or overwrites; see available_repairs"
        ),
      statement_page: z.number().int().nonnegative().optional().describe("Page id of the accessibility statement; 0 = none"),
      statement_url: z.string().optional().describe("https URL of an external statement; the page wins"),
      sitemap_url: z.string().optional().describe("https URL for the Sitemap tool; empty = /wp-sitemap.xml"),
    },
    async ({ site, ...args }) => {
      const wp = forSite(site);
      return jsonResult(await wp.put<Record<string, unknown>>(`${NS}/accessibility`, given(args)));
    }
  );

  server.tool(
    "legal_get_accessibility_report",
    "Get the markup repair report: totals per rule (fixed / open) and per page what was repaired and what is still open, i.e. what the site's own markup must fix. Each page is recorded at most once a day, newest 100 pages. Requires cvrt-legal 0.9.0+.",
    { site },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Record<string, unknown>>(`${NS}/accessibility/report`));
    }
  );

  server.tool(
    "legal_reset_accessibility_report",
    "Clear the markup repair report, e.g. after fixing the source, so new page views record afresh. Requires cvrt-legal 0.9.0+.",
    { site },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.delete<Record<string, unknown>>(`${NS}/accessibility/report`));
    }
  );
}
