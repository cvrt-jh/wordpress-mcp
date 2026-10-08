/**
 * Health and diagnostics tools using cvrt-mcp-endpoints plugin
 * Requires: cvrt-mcp-endpoints WordPress plugin
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { defined, jsonResult } from "../types.js";

export function register(server: McpServer) {
  // Get health status
  server.tool(
    "mcp_get_health",
    "Get a quick site health status and score (100 minus 20 per issue: WP_DEBUG on, no HTTPS, pending updates)",
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
    "Get debug information: WordPress settings, server, database (name, prefix, charset), paths and debug constants",
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
        max_input_vars: string;
        display_errors: string;
        error_reporting: number;
        opcache: { enabled: boolean };
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
    "Get WordPress cron status: schedules and the next 50 events (total_events counts all)",
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
          args: unknown[];
        }>;
        total_events: number;
      }>("/mcp/v1/health/cron");
      return jsonResult(result);
    }
  );

  // Run cron job
  server.tool(
    "mcp_run_cron",
    "Run the earliest scheduled event of a cron hook now, like `wp cron event run`: a recurring event moves to its next slot, a single event is unscheduled, then the hook fires (404 if not scheduled). Returns next_run_timestamp (null for a single event). Audit-logged. cvrt-mcp-endpoints 1.16.0+; older versions leave the event due.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      hook: z.string().describe("Cron hook name to run"),
    },
    async ({ site, hook }) => {
      const wp = forSite(site);
      const result = await wp.post<{ hook: string; executed: boolean; schedule?: string; next_run_timestamp?: number | null }>(
        "/mcp/v1/health/cron/run",
        { hook }
      );
      return jsonResult(result);
    }
  );

  server.tool(
    "mcp_get_action_scheduler",
    "Action Scheduler queue (WooCommerce emails, webhooks, PDF jobs): counts per status, past_due pending actions and the 10 most recent failures with their last log message (secret-masked). available:false when Action Scheduler is not loaded. cvrt-mcp-endpoints 1.16.0+.",
    {
      site: z.string().describe("Site id (see list_sites)"),
    },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Record<string, unknown>>("/mcp/v1/health/action-scheduler"));
    }
  );

  server.tool(
    "mcp_run_action_scheduler",
    "Run due (past-due pending) Action Scheduler actions now through Action Scheduler's own runner, oldest first. Optional hook/group filters. Returns processed, failed, remaining. 501 when Action Scheduler is not active. Audit-logged. cvrt-mcp-endpoints 1.16.0+.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      batch_size: z.number().int().min(1).max(50).optional().describe("How many due actions to run (1-50, default 25)"),
      hook: z.string().optional().describe("Only actions of this hook"),
      group: z.string().optional().describe("Only actions of this group"),
    },
    async ({ site, ...filters }) => {
      const wp = forSite(site);
      return jsonResult(
        await wp.post<{ processed: number; failed: number; remaining: number }>(
          "/mcp/v1/health/action-scheduler/run",
          defined(filters)
        )
      );
    }
  );

  server.tool(
    "mcp_scan_uploads",
    "Scan the uploads directory for executable files (.php, .phtml, .phar, .pht, .phps, .shtml, .cgi, also double extensions like x.php.jpg). Read-only; symlinks are not followed. Each finding has path, size, modified, sha256 and benign (a code-free 'Silence is golden' index.php). Caps: 500 findings, 200000 files (truncated says so). cvrt-mcp-endpoints 1.16.0+.",
    {
      site: z.string().describe("Site id (see list_sites)"),
    },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Record<string, unknown>>("/mcp/v1/health/uploads-scan"));
    }
  );

  server.tool(
    "mcp_get_audit_log",
    "Audit trail of state-changing MCP calls on this site (cron runs, Action Scheduler runs, update checks), newest first: time, action, user, context (secret-masked). The site keeps the newest 200. cvrt-mcp-endpoints 1.16.0+.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      limit: z.number().int().min(1).max(200).optional().describe("How many entries (default 50)"),
    },
    async ({ site, limit }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Record<string, unknown>>("/mcp/v1/health/audit", defined({ limit })));
    }
  );
}
