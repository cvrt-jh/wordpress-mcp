import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { jsonResult } from "../types.js";
import { slimSiteInfo } from "../slim.js";

export function register(server: McpServer) {
  // Get site info
  server.tool(
    "wp_site_info",
    "Get WordPress site information (name, description, URL, timezone)",
    { site: z.string().describe("Site id (see list_sites)") },
    async ({ site }) => {
      const wp = forSite(site);
      const info = await wp.get<Record<string, unknown>>("/");
      return jsonResult(slimSiteInfo(info));
    }
  );

  // Get site settings (requires authentication)
  server.tool(
    "wp_get_settings",
    "Get WordPress site settings (title, tagline, timezone, date format)",
    { site: z.string().describe("Site id (see list_sites)") },
    async ({ site }) => {
      const wp = forSite(site);
      const settings = await wp.get<Record<string, unknown>>("/wp/v2/settings");
      return jsonResult({
        title: settings.title,
        description: settings.description,
        timezone: settings.timezone_string,
        date_format: settings.date_format,
        time_format: settings.time_format,
        posts_per_page: settings.posts_per_page,
      });
    }
  );

  // Update site settings
  server.tool(
    "wp_update_settings",
    "Update WordPress site settings",
    {
      site: z.string().describe("Site id (see list_sites)"),
      title: z.string().optional().describe("Site title"),
      description: z.string().optional().describe("Site tagline/description"),
      timezone_string: z.string().optional().describe("Timezone (e.g., Europe/Berlin)"),
    },
    async ({ site, title, description, timezone_string }) => {
      const wp = forSite(site);
      const body: Record<string, unknown> = {};
      if (title) body.title = title;
      if (description) body.description = description;
      if (timezone_string) body.timezone_string = timezone_string;

      const settings = await wp.post<Record<string, unknown>>("/wp/v2/settings", body);
      return jsonResult({
        title: settings.title,
        description: settings.description,
        timezone: settings.timezone_string,
      });
    }
  );

  // Get available REST API namespaces
  server.tool(
    "wp_get_namespaces",
    "List available REST API namespaces (plugins may add custom endpoints)",
    { site: z.string().describe("Site id (see list_sites)") },
    async ({ site }) => {
      const wp = forSite(site);
      const info = await wp.get<{ namespaces: string[] }>("/");
      return jsonResult({ namespaces: info.namespaces });
    }
  );
}
