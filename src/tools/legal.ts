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
import { defined, jsonResult } from "../types.js";

const NS = "/mcp/legal/v1";

const site = z.string().describe("Site id (see list_sites)");
const doc = z
  .enum(["impressum", "datenschutz", "agb", "widerruf", "barrierefreiheit"])
  .describe("Document type");

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("YYYY-MM-DD");

const level = z.number().int().min(2).max(3).describe("Heading level, 2 (H2) or 3 (H3); default 2");

const sectionSchema = z.object({
  slug: z
    .string()
    .optional()
    .describe("Stable slug; derived from the heading when omitted, de-duplicated against the other sections"),
  heading: z.string().describe("Section heading (plain text)"),
  body: z.string().describe("HTML body, filtered through wp_kses_post"),
  level: level.optional(),
});

const generatedDoc = z
  .enum(["impressum", "datenschutz", "barrierefreiheit"])
  .describe("Generated document: impressum, datenschutz or barrierefreiheit (BFSG statement, cvrt-legal 0.9.0+)");

const flags = z.record(z.boolean());

/** Tool keys of the accessibility panel (Cvrt_Legal_Accessibility::tools()). */
const A11Y_TOOLS = [
  "bigger-text",
  "bigger-line-height",
  "text-align",
  "readable-font",
  "grayscale",
  "contrast",
  "highlight-links",
  "focus-outline",
  "reading-mask",
  "hide-images",
  "pause-animations",
  "page-structure",
  "sitemap",
] as const;

/** Markup repair rule keys (Cvrt_Legal_Repair::rules(), cvrt-legal 0.9.0+). */
const REPAIR_RULES = [
  "link-names",
  "image-alt",
  "iframe-title",
  "form-labels",
  "skip-link",
  "lang",
  "zoom",
  "new-tab",
  "duplicate-ids",
] as const;

/**
 * A strict {key: boolean} map over a fixed key set: every key optional (the
 * plugin merges, an omitted key keeps its value), an unknown key refused here
 * because the plugin would silently ignore it.
 */
function switches(keys: readonly string[]) {
  return z.object(Object.fromEntries(keys.map((k) => [k, z.boolean().optional()]))).strict();
}

/** Empty (clears the field) or the given pattern. */
const idOrEmpty = (re: RegExp, example: string) =>
  z.string().regex(new RegExp(`^(${re.source})?$`), `must look like ${example}, or be empty to clear`);

const serviceNames = z
  .array(z.string().max(80))
  .max(20)
  .describe("Plain-text service names, at most 20 of 80 characters; tags are stripped, duplicates dropped");

/**
 * The body of a large import: inline, or read from a local JSON file. A
 * 120 KB Datenschutz library is not something to paste into a tool call; the
 * file is what websites/bin/legal-v4 builds anyway.
 */
async function jsonBody(
  inline: Record<string, unknown> | null | undefined,
  file: string | null | undefined,
  name: string
): Promise<Record<string, unknown>> {
  if (inline != null && file != null) {
    throw new Error(`Give ${name} or ${name}_file, not both`);
  }
  if (inline != null) {
    return inline;
  }
  if (file == null) {
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
    "Replace a whole legal document (every section not listed is gone). Sections are ordered; omit slug to derive it from the heading. The linked page's post_content is rewritten at once. The plugin ships no legal prose - it stores and renders what it is given. Returns { saved: true }.",
    {
      site,
      doc,
      title: z.string().optional().describe("Document title, rendered as the H1; defaults to the document type's label (e.g. Impressum)"),
      sections: z.array(sectionSchema).describe("Ordered sections"),
    },
    async ({ site, doc, title, sections }) => {
      const wp = forSite(site);
      return jsonResult(
        await wp.put<Record<string, unknown>>(`${NS}/documents/${doc}`, defined({ title, sections }))
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
    "Append a section to a legal document (creates the document if it is still empty). On a generated document the section is kept across regenerations. Returns { slug }, the resolved slug, which is what shortcodes address.",
    {
      site,
      doc,
      heading: z.string().describe("Section heading (plain text)"),
      body: z.string().describe("HTML body, filtered through wp_kses_post"),
      level: level.optional(),
      slug: z.string().optional().describe("Stable slug; derived from the heading when omitted, de-duplicated against existing sections"),
    },
    async ({ site, doc, ...args }) => {
      const wp = forSite(site);
      const body = defined(args);
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
      heading: z.string().optional().describe("New heading (plain text)"),
      body: z.string().optional().describe("New HTML body, filtered through wp_kses_post"),
      level: level.optional(),
    },
    async ({ site, doc, slug, ...args }) => {
      const wp = forSite(site);
      const body = defined(args);
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
    "Get the cookie consent banner configuration: enabled, gtm_id, loader_url, ga4_id, ahrefs_key, ads_id, gtm_services { analytics, marketing }, privacy_page, imprint_page, log_enabled, backdrop. Change it with legal_put_consent.",
    { site },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Record<string, unknown>>(`${NS}/consent`));
    }
  );

  server.tool(
    "legal_put_consent",
    "Configure the consent banner and every tracking credential the site uses. Merges: only the keys given change, an omitted key keeps its stored value, an empty string clears an id. Nothing is handed to the browser until the visitor accepts - this plugin owns GTM, GA4, Google Ads and Ahrefs Web Analytics precisely because it owns the gate. Search-engine verification meta tags are NOT here; those belong to cvrt-seo-manager because they fire no request. Returns { saved: true }; read the result back with legal_get_consent.",
    {
      site,
      enabled: z
        .boolean()
        .optional()
        .describe("Banner on/off. Off also switches every consent gate off, so nothing tracked loads at all"),
      gtm_id: idOrEmpty(/GTM-[A-Z0-9]+/, "GTM-XXXXXXX")
        .optional()
        .describe("GTM container id GTM-XXXXXXX, loaded only after consent; empty clears it"),
      loader_url: z
        .string()
        .optional()
        .describe(
          "Optional first-party GTM loader URL. Leave empty to load straight from googletagmanager.com (the default on all our sites)"
        ),
      ga4_id: idOrEmpty(/G-[A-Z0-9]+/, "G-XXXXXXXXXX")
        .optional()
        .describe(
          "GA4 measurement id G-XXXXXXXXXX. Without a GTM container gtag.js loads it after Statistik consent; with a container it names the property the container loads, which the banner keeps off until Statistik consent. Empty clears it."
        ),
      ads_id: idOrEmpty(/AW-[0-9]+/, "AW-123456789")
        .optional()
        .describe(
          "Google Ads conversion id AW-123456789 (cvrt-legal 0.10.0+). On a GA4-direct site (no GTM container) gtag configures it after Marketing consent; with a container it only documents the account (the container fires Ads) and makes the banner list Google Ads under Marketing. Empty clears it."
        ),
      gtm_services: z
        .object({
          analytics: serviceNames.describe("Services the container fires under Statistik, e.g. [\"Microsoft Clarity\"]"),
          marketing: serviceNames.describe("Services the container fires under Marketing, e.g. [\"Meta Pixel\", \"LinkedIn Insight Tag\"]"),
        })
        .strict()
        .optional()
        .describe(
          "What the GTM container fires, per category, for the banner's service list only (cvrt-legal 0.10.0+); what the container actually runs is configured in GTM. Replaces both lists as a whole: send [] to empty a category. Only shown while gtm_id is set."
        ),
      ahrefs_key: idOrEmpty(/[A-Za-z0-9_\/+-]+={0,2}/, "an Ahrefs Web Analytics data-key")
        .optional()
        .describe(
          "Ahrefs Web Analytics data-key. Cookieless but still a third-party request, so it is consent-gated and must be named in the Datenschutz text before enabling. Empty clears it."
        ),
      privacy_page: z.number().int().nonnegative().optional().describe("Page id of the Datenschutz page (banner link); 0 = none"),
      imprint_page: z.number().int().nonnegative().optional().describe("Page id of the Impressum page (banner link); 0 = none"),
      log_enabled: z
        .boolean()
        .optional()
        .describe(
          "Turn the consent decision log on or off. Stays off (the default) until a 'einwilligungsnachweis' section exists in the Datenschutz document - set it only after that section is in place. Switching it rewrites a generated Datenschutz."
        ),
      backdrop: z
        .boolean()
        .optional()
        .describe(
          "Dim and block the page behind the banner until the visitor decides (default true). Never applied on the privacy, imprint or any linked legal page."
        ),
    },
    async ({ site, ...args }) => {
      const wp = forSite(site);
      return jsonResult(await wp.put<Record<string, unknown>>(`${NS}/consent`, defined(args)));
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
    "Set the banner theme preset and/or individual CSS custom properties. All or nothing: one invalid name or value rejects the whole request (400, names in data.invalid). Returns { saved: true }.",
    {
      site,
      preset: z.enum(["default", "dark"]).optional().describe("Theme preset; an unknown preset renders as default"),
      vars: z
        .record(
          z.string().regex(/^--cvrt-consent-[a-z-]+$/, "must be a --cvrt-consent-* property"),
          z.string().max(200)
        )
        .optional()
        .describe(
          "--cvrt-consent-* overrides (bg, fg, accent, radius, font, shadow, link, title, backdrop). REPLACES the stored overrides as a whole: send every override you want to keep, {} clears them. Values are plain CSS (no ; { } < \\ or comments, max 200 chars)."
        ),
    },
    async ({ site, ...args }) => {
      const wp = forSite(site);
      const body = defined(args);
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
    "Aggregate consent decision counts by action and banner_version over a day range [from, to) (both optional, default the last 30 days including today; at most 366 days). Returns { from, to, rows: [{ action, banner_version, count }] }. Requires manage_options. Logging itself stays off until legal_put_consent's log_enabled is set, which should only happen after the Datenschutz document has an 'einwilligungsnachweis' section describing it. Requires cvrt-legal 0.5.0+.",
    {
      site,
      from: dateSchema.optional().describe("First day counted (inclusive). Defaults to 30 days before to; must be before to."),
      to: dateSchema.optional().describe("First day NOT counted (exclusive, the range is [from, to)). Defaults to tomorrow, so today is included."),
    },
    async ({ site, ...args }) => {
      const wp = forSite(site);
      const params = defined(args) as Record<string, string>;
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
      from: dateSchema.optional().describe("First day counted (inclusive). Defaults to 30 days before to; must be before to."),
      to: dateSchema.optional().describe("First day NOT counted (exclusive, the range is [from, to)). Defaults to tomorrow, so today is included."),
    },
    async ({ site, ...args }) => {
      const wp = forSite(site);
      const params = defined(args) as Record<string, string>;
      return jsonResult(
        await wp.get<Record<string, unknown>>(`${NS}/consent/log/export`, params)
      );
    }
  );
  server.tool(
    "legal_update_settings",
    "Update cvrt-legal settings. github_token (PUC auto-updates on a private repo) is write-only: a blank value keeps the stored one. required_override forces a document required or not ({agb: false}). Returns the settings as legal_get_settings does (secrets as { set }).",
    {
      site,
      github_token: z.string().optional().describe("GitHub token for plugin updates (write-only, never returned); blank keeps the stored one"),
      required_override: z
        .record(z.enum(["impressum", "datenschutz", "agb", "widerruf", "barrierefreiheit"]), z.boolean())
        .optional()
        .describe("doc => required, overriding the built-in rule (shop documents are required while WooCommerce is active). REPLACES the stored map as a whole; {} removes every override."),
    },
    async ({ site, ...args }) => {
      const wp = forSite(site);
      return jsonResult(await wp.post<Record<string, unknown>>(`${NS}/settings`, defined(args)));
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
    "Set Impressum fields. Merges: only the keys given change; an empty string clears a field. An unknown key, a value outside a select field's options or an invalid email is refused (400); a checkbox field stores \"ja\" or empty. Needs an imported Impressum library (409 otherwise). Regenerates every generated document and returns the new state as legal_get_facts does. Requires cvrt-legal 0.7.0+.",
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
    "Tick or untick modules and options, then regenerate the document (the Datenschutz tab over the API). Merges into the stored selection; unknown module or option keys are refused (400). Needs the library imported (409), and for datenschutz the required Impressum facts filled (409). Returns the new state as legal_get_generator does. Sections tied to a switch (Einwilligungsnachweis, Barrierefreiheits-Werkzeug) follow that switch and are not ticked here. Requires cvrt-legal 0.7.0+.",
    {
      site,
      doc: generatedDoc,
      enabled: flags.optional().describe("module (section) key => on/off; merged into the stored selection"),
      options: z.record(flags).optional().describe("module key => { option key => on/off }; merged into the stored selection"),
      keep: z
        .array(z.string())
        .optional()
        .describe("Slugs of sections added through the API that survive regeneration. REPLACES the stored list; omit to keep it"),
    },
    async ({ site, doc, ...args }) => {
      const wp = forSite(site);
      return jsonResult(await wp.put<Record<string, unknown>>(`${NS}/generator/${doc}`, defined(args)));
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
    "Switch social networks and set their profile URLs (plain https only), then rewrite the Datenschutz social-media section; with nothing on, the section is removed. NOT a merge: every network missing from networks is switched off, so always send the full set you want on. Needs the modules imported and a Datenschutz document (409 otherwise). Returns the new state as legal_get_social does. Requires cvrt-legal 0.6.0+.",
    {
      site,
      networks: z
        .record(
          z.object({
            enabled: z.boolean().describe("Network on/off; on needs at least one URL"),
            urls: z.array(z.string()).optional().describe("Profile URLs, plain https; blanks are dropped"),
          })
        )
        .describe("network key (as legal_get_social lists under available) => { enabled, urls }"),
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
      enabled: z.boolean().optional().describe("Show the accessibility panel (default off)"),
      position: z
        .enum(["bottom-right", "bottom-left", "top-right", "top-left"])
        .optional()
        .describe("Launcher position, default bottom-right"),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe("Launcher colour, #rrggbb (default #1d4ed8)"),
      tools: switches(A11Y_TOOLS)
        .optional()
        .describe(
          `Panel tool => on/off, merged (omitted tools keep their value). Keys: ${A11Y_TOOLS.join(", ")}. All on by default except sitemap. See available_tools in legal_get_accessibility`
        ),
      repairs: switches(REPAIR_RULES)
        .optional()
        .describe(
          `Markup repair rule => on/off, merged (omitted rules keep their value; all off by default). cvrt-legal 0.9.0+. Keys: ${REPAIR_RULES.join(", ")}. Server-side, works with or without the panel, never invents or overwrites; duplicate-ids only reports. See available_repairs in legal_get_accessibility`
        ),
      statement_page: z.number().int().nonnegative().optional().describe("Page id of the accessibility statement; 0 = none"),
      statement_url: z.string().optional().describe("https URL of an external statement; the page wins"),
      sitemap_url: z.string().optional().describe("https URL for the Sitemap tool; empty = /wp-sitemap.xml"),
    },
    async ({ site, ...args }) => {
      const wp = forSite(site);
      return jsonResult(await wp.put<Record<string, unknown>>(`${NS}/accessibility`, defined(args)));
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
