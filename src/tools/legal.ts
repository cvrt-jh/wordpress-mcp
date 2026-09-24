/**
 * Legal document and cookie consent tools using the cvrt-legal plugin.
 * Requires: cvrt-legal WordPress plugin (v0.2.0+) with the mcp/legal/v1 API.
 * All routes require the authenticated user to hold manage_options (satisfied
 * by the app-password used by this MCP server). Secrets are returned masked as
 * { set: boolean }.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { jsonResult } from "../types.js";

const NS = "/mcp/legal/v1";

const site = z.string().describe("Site id (see list_sites)");
const doc = z
  .enum(["impressum", "datenschutz", "agb", "widerruf"])
  .describe("Document type");

const sectionSchema = z.object({
  slug: z
    .string()
    .optional()
    .describe("Stable slug; derived from the heading when omitted"),
  heading: z.string(),
  body: z.string().describe("HTML body"),
  level: z.number().optional().describe("2 or 3, default 2"),
});

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
    "Configure the consent banner. GTM is injected only after the visitor accepts - nothing reaches Google before consent.",
    {
      site,
      enabled: z.boolean(),
      gtm_id: z.string().optional().describe("GTM-XXXXXXX"),
      loader_url: z
        .string()
        .optional()
        .describe(
          "First-party GTM loader, e.g. a Stape endpoint. Defaults to googletagmanager.com"
        ),
      privacy_page: z.number().optional().describe("Page id of the Datenschutz page"),
      imprint_page: z.number().optional().describe("Page id of the Impressum page"),
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
}
