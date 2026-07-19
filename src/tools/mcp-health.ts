/**
 * Health and diagnostics tools using cvrt-mcp-endpoints plugin
 * Requires: cvrt-mcp-endpoints WordPress plugin
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { jsonResult } from "../types.js";

export function register(server: McpServer) {
  // Get health status
  server.tool(
    "mcp_get_health",
    "Get site health status and score",
    {
      site: z.string().describe("Site id (see list_sites)"),
    },
    async ({ site }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        status: string;
        score: number;
        wordpress: { version: string; update_available: boolean };
        php: { version: string; memory_limit: string };
        database: { version: string; prefix: string };
        updates: { total: number; plugins: number; themes: number };
        debug: { wp_debug: boolean; wp_debug_log: boolean; wp_debug_display: boolean };
        ssl: boolean;
        multisite: boolean;
        issues: string[];
      }>("/mcp/v1/health");
      return jsonResult(result);
    }
  );

  // Get debug info
  server.tool(
    "mcp_get_debug_info",
    "Get detailed debug information",
    {
      site: z.string().describe("Site id (see list_sites)"),
    },
    async ({ site }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        wordpress: Record<string, unknown>;
        server: Record<string, unknown>;
        database: Record<string, unknown>;
        paths: Record<string, string>;
        constants: Record<string, boolean>;
      }>("/mcp/v1/health/debug");
      return jsonResult(result);
    }
  );

  // Get PHP info
  server.tool(
    "mcp_get_php_info",
    "Get PHP configuration details",
    {
      site: z.string().describe("Site id (see list_sites)"),
    },
    async ({ site }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        version: string;
        sapi: string;
        memory_limit: string;
        max_execution_time: string;
        upload_max_filesize: string;
        post_max_size: string;
        extensions: string[];
        disabled_functions: string[];
      }>("/mcp/v1/health/php");
      return jsonResult(result);
    }
  );

  // Get plugins health
  server.tool(
    "mcp_get_plugins_health",
    "Get plugin health status and available updates",
    {
      site: z.string().describe("Site id (see list_sites)"),
    },
    async ({ site }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        plugins: Array<{
          file: string;
          name: string;
          version: string;
          active: boolean;
          update_available: boolean;
          new_version: string | null;
        }>;
        total: number;
        active: number;
        inactive: number;
        updates_available: number;
      }>("/mcp/v1/health/plugins");
      return jsonResult(result);
    }
  );

  // Get cron status
  server.tool(
    "mcp_get_cron_status",
    "Get WordPress cron jobs status",
    {
      site: z.string().describe("Site id (see list_sites)"),
    },
    async ({ site }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        cron_disabled: boolean;
        schedules: Record<string, { interval: number; display: string }>;
        events: Array<{
          hook: string;
          timestamp: number;
          next_run: string;
          schedule: string;
          interval: number | null;
        }>;
        total_events: number;
      }>("/mcp/v1/health/cron");
      return jsonResult(result);
    }
  );

  // Run cron job
  server.tool(
    "mcp_run_cron",
    "Manually trigger a cron hook",
    {
      site: z.string().describe("Site id (see list_sites)"),
      hook: z.string().describe("Cron hook name to run"),
    },
    async ({ site, hook }) => {
      const wp = forSite(site);
      const result = await wp.post<{ hook: string; executed: boolean }>(
        "/mcp/v1/health/cron/run",
        { hook }
      );
      return jsonResult(result);
    }
  );
}
