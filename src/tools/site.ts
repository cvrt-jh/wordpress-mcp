import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { defined, jsonResult } from "../types.js";
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
    "Get the WordPress settings exposed by wp/v2/settings (title, tagline, url, email, timezone, date/time format, language, reading and discussion settings, site logo/icon, plus plugin-registered ones)",
    { site: z.string().describe("Site id (see list_sites)") },
    async ({ site }) => {
      const wp = forSite(site);
      const settings = await wp.get<Record<string, unknown>>("/wp/v2/settings");
      return jsonResult(settings);
    }
  );

  // Update site settings
  server.tool(
    "wp_update_settings",
    "Update WordPress site settings (only the given fields change); returns all settings afterwards",
    {
      site: z.string().describe("Site id (see list_sites)"),
      title: z.string().optional().describe("Site title"),
      description: z.string().optional().describe("Site tagline"),
      url: z.string().optional().describe("Site URL (siteurl; single site only - changing it can lock you out)"),
      email: z.string().email().optional().describe("Admin email (single site only)"),
      timezone: z.string().optional().describe("Timezone city, e.g. Europe/Berlin (option timezone_string)"),
      date_format: z.string().optional().describe("PHP date format, e.g. d.m.Y"),
      time_format: z.string().optional().describe("PHP time format, e.g. H:i"),
      start_of_week: z.number().int().min(0).max(6).optional().describe("First day of the week (0 = Sunday, 1 = Monday)"),
      language: z.string().optional().describe("Locale, e.g. de_DE (must be installed; '' = en_US)"),
      use_smilies: z.boolean().optional().describe("Convert emoticons like :-) to graphics"),
      default_category: z.number().int().optional().describe("Default post category ID"),
      default_post_format: z.string().optional().describe("Default post format slug ('0' = standard)"),
      posts_per_page: z.number().int().optional().describe("Blog pages show at most this many posts"),
      show_on_front: z.enum(["posts", "page"]).optional().describe("Front page shows the latest posts or a static page"),
      page_on_front: z.number().int().optional().describe("Page ID shown on the front page (show_on_front=page)"),
      page_for_posts: z.number().int().optional().describe("Page ID that lists the latest posts (show_on_front=page)"),
      default_ping_status: z.enum(["open", "closed"]).optional().describe("Allow pingbacks/trackbacks on new posts"),
      default_comment_status: z.enum(["open", "closed"]).optional().describe("Allow comments on new posts"),
      site_logo: z.number().int().optional().describe("Site logo media ID"),
      site_icon: z.number().int().optional().describe("Site icon (favicon) media ID"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const settings = await wp.post<Record<string, unknown>>("/wp/v2/settings", defined(params));
      return jsonResult(settings);
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
