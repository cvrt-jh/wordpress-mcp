/**
 * Extended theme tools using cvrt-mcp-endpoints plugin
 * Requires: cvrt-mcp-endpoints WordPress plugin
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { jsonResult } from "../types.js";
import { readFileSync, realpathSync, statSync } from "node:fs";

/** Same cap as cvrt-mcp-endpoints 1.20.0 (413 above it). */
const MAX_ZIP_BYTES = 64 * 1024 * 1024;

/** Read a local theme zip after checking it is a real .zip file within the upload cap. */
function readThemeZip(filePath: string): Buffer {
  let real: string;
  try {
    real = realpathSync(filePath);
  } catch {
    throw new Error(`file_path not found: ${filePath}`);
  }
  const stat = statSync(real);
  if (!stat.isFile()) throw new Error(`file_path is not a regular file: ${filePath}`);
  if (!real.toLowerCase().endsWith(".zip")) throw new Error(`file_path must be a .zip file: ${filePath}`);
  if (stat.size > MAX_ZIP_BYTES) {
    throw new Error(`file_path is ${stat.size} bytes, over the 64 MB upload limit: ${filePath}`);
  }
  const bytes = readFileSync(real);
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    throw new Error(`file_path is not a zip archive (missing PK\\x03\\x04 header): ${filePath}`);
  }
  return bytes;
}

export function register(server: McpServer) {
  // Search WordPress.org themes
  server.tool(
    "mcp_search_themes",
    "Search the WordPress.org theme repository. Returns { total, themes: [{ name, slug, version, author, rating, description }] }.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      search: z.string().describe("Search query"),
      per_page: z.number().int().positive().optional().default(10).describe("Results per page (default 10)"),
    },
    async ({ site, search, per_page }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        total: number;
        themes: Array<{
          name: string;
          slug: string;
          version: string;
          author: string;
          rating: number;
          description: string;
        }>;
      }>("/mcp/v1/themes/search", { search, per_page });
      return jsonResult(result);
    }
  );

  // Install theme from WordPress.org
  server.tool(
    "mcp_install_theme",
    "Install a theme from WordPress.org by slug",
    {
      site: z.string().describe("Site id (see list_sites)"),
      slug: z.string().describe("Theme slug from WordPress.org"),
      activate: z.boolean().optional().default(false).describe("Switch to the theme after install (default false)"),
    },
    async ({ site, slug, activate }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        installed: boolean;
        activated: boolean;
        stylesheet: string;
        name: string;
        version: string;
      }>("/mcp/v1/themes/install", { slug, activate });
      return jsonResult(result);
    }
  );

  // Update single theme
  server.tool(
    "mcp_update_theme",
    "Update a single theme to latest version",
    {
      site: z.string().describe("Site id (see list_sites)"),
      stylesheet: z.string().describe("Theme stylesheet (folder name)"),
    },
    async ({ site, stylesheet }) => {
      const wp = forSite(site);
      const result = await wp.post<{ updated: boolean; stylesheet: string }>(
        "/mcp/v1/themes/update",
        { stylesheet }
      );
      return jsonResult(result);
    }
  );

  // Update all themes
  server.tool(
    "mcp_update_all_themes",
    "Update all themes with available updates",
    {
      site: z.string().describe("Site id (see list_sites)"),
    },
    async ({ site }) => {
      const wp = forSite(site);
      const result = await wp.post<{ updated: string[]; failed?: string[]; message?: string }>(
        "/mcp/v1/themes/update-all",
        {}
      );
      return jsonResult(result);
    }
  );

  // Delete theme
  server.tool(
    "mcp_delete_theme",
    "Delete an inactive theme (the active theme is refused)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      stylesheet: z.string().describe("Theme stylesheet (folder name)"),
    },
    async ({ site, stylesheet }) => {
      const wp = forSite(site);
      const result = await wp.delete<{ deleted: boolean; stylesheet: string }>(
        "/mcp/v1/themes/delete",
        { stylesheet }
      );
      return jsonResult(result);
    }
  );

  // Install theme from ZIP URL
  server.tool(
    "mcp_install_theme_zip",
    "Install a theme from a ZIP, either a public URL (url, must end in .zip) or a local file (file_path, absolute path to a .zip, max 64 MB). Give exactly one of them. file_path uploads the file from this machine, so it works for private or locally built themes and, with overwrite, can replace the ACTIVE theme; it needs cvrt-mcp-endpoints >= 1.20.0 on the site. url keeps working on older versions, but has no GitHub token support: private release assets cannot be installed that way.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      url: z.string().optional().describe("URL to the theme ZIP file (must end in .zip). Not together with file_path."),
      file_path: z
        .string()
        .optional()
        .describe("Absolute local path to a theme .zip to upload (max 64 MB). Not together with url."),
      activate: z.boolean().optional().default(false).describe("Switch to the theme after install (default false)"),
      overwrite: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          "Replace the theme folder if it already exists (default true). With url the active theme is never overwritten; with file_path on cvrt-mcp-endpoints >= 1.20.0 it is replaced too."
        ),
    },
    async ({ site, url, file_path, activate, overwrite }) => {
      if ((url === undefined) === (file_path === undefined)) {
        throw new Error("mcp_install_theme_zip needs exactly one of url or file_path");
      }
      const wp = forSite(site);
      type Installed = {
        installed: boolean;
        activated: boolean;
        stylesheet: string;
        name: string;
        version: string;
        source: string;
        replaced?: boolean;
      };
      if (url !== undefined) {
        return jsonResult(await wp.post<Installed>("/mcp/v1/themes/install-zip", { url, activate, overwrite }));
      }
      const zip = readThemeZip(file_path as string);
      try {
        const result = await wp.postRaw<Installed>("/mcp/v1/themes/install-zip", zip, "application/zip", {
          activate: String(activate ?? false),
          overwrite: String(overwrite ?? true),
        });
        return jsonResult(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/rest_no_route|rest_missing_callback_param|missing parameter\(s\): url/i.test(msg)) {
          throw new Error(
            `The site does not support uploading a theme zip: it needs cvrt-mcp-endpoints >= 1.20.0 (site said: ${msg})`
          );
        }
        throw e;
      }
    }
  );
}
