/**
 * Order-fulfillment tools using the cvrt-order-fulfillment plugin.
 * Requires: cvrt-order-fulfillment WordPress plugin (v0.2.0+) with the
 * mcp/fulfillment/v1/admin/* API. All routes require the authenticated user to
 * hold the manage_woocommerce capability (satisfied by the app-password used by
 * this MCP server). Secrets are returned masked as { set: boolean }.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { defined, jsonResult } from "../types.js";

const NS = "/mcp/fulfillment/v1/admin";

export function register(server: McpServer) {
  server.tool(
    "fulfillment_get_settings",
    "Get the cvrt-order-fulfillment plugin settings. Secret values are returned as { set: boolean }, never raw.",
    { site: z.string().describe("Site id (see list_sites)") },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Record<string, unknown>>(`${NS}/settings`));
    }
  );

  const secret = (what: string) =>
    z
      .string()
      .optional()
      .describe(`${what}. Write-only (returned as { set }); blank or omitted keeps the stored value, "__clear" deletes it`);

  server.tool(
    "fulfillment_update_settings",
    "Update cvrt-order-fulfillment settings. Only provide the keys you want to change; omitted keys keep their stored value. Secrets are write-only: a blank/omitted secret keeps the stored value (never wipes it), the literal \"__clear\" deletes it. Returns the settings as fulfillment_get_settings does (secrets as { set }).",
    {
      site: z.string().describe("Site id (see list_sites)"),
      clickup_token: secret("ClickUp API token"),
      clickup_list_id: z.string().optional().describe("ClickUp list id the fulfillment tasks are created in"),
      clickup_assignee_id: z.number().int().optional().describe("ClickUp user id the tasks are assigned to"),
      agent_token: secret("Bearer token the print agent authenticates with"),
      webhook_secret: secret("Webhook secret"),
      github_updater_token: secret("GitHub token for plugin updates (falls back to the GITHUB_UPDATER_TOKEN constant)"),
      slack_webhook_url: secret("Slack incoming-webhook URL, the fallback when no bot token is set"),
      slack_bot_token: secret("Slack bot token (xoxb-...), enables threads and reactions; needs slack_channel_id"),
      slack_channel_id: z.string().optional().describe("Slack channel id the bot token posts to"),
    },
    async ({ site, ...args }) => {
      const wp = forSite(site);
      return jsonResult(await wp.post<Record<string, unknown>>(`${NS}/settings`, defined(args)));
    }
  );

  server.tool(
    "fulfillment_status",
    "Pipeline health: which credentials are set, ClickUp list/assignee, when the print agent last polled, and print-queue counts.",
    { site: z.string().describe("Site id (see list_sites)") },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Record<string, unknown>>(`${NS}/status`));
    }
  );

  server.tool(
    "fulfillment_queue",
    "Print-queue state: status counts (pending/printing/printed/failed) and the 20 most recent jobs (id, order_id, type, status, attempts, error, created_at, printed_at).",
    { site: z.string().describe("Site id (see list_sites)") },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Record<string, unknown>>(`${NS}/queue`));
    }
  );

  server.tool(
    "fulfillment_reprint_job",
    "Reset a print job to pending so the agent prints it again. Returns { ok: true }; 404 { ok: false, error } for an unknown job.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      job_id: z.number().int().describe("The print job id (from fulfillment_queue)"),
    },
    async ({ site, job_id }) => {
      const wp = forSite(site);
      return jsonResult(await wp.post<Record<string, unknown>>(`${NS}/jobs/${job_id}/reprint`, {}));
    }
  );

  server.tool(
    "fulfillment_fulfill_order",
    "Manually (force) run fulfillment for an order: renders the packing slip, creates the ClickUp task, notifies Slack. Bypasses the idempotency guard, so it can create a duplicate ClickUp task. Audit-logged.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      order_id: z.number().int().describe("The WooCommerce order id"),
    },
    async ({ site, order_id }) => {
      const wp = forSite(site);
      return jsonResult(await wp.post<Record<string, unknown>>(`${NS}/orders/${order_id}/fulfill`, {}));
    }
  );

  server.tool(
    "fulfillment_update_check",
    "Force an immediate plugin-update check (bypassing PUC's throttle) and report { available, current, remote, error } (plus throttled: true when answered from the cached check, about once per 30s). Read-only: it installs nothing. Apply an update from wp-admin or with mcp_update_plugin (cvrt-mcp-endpoints); the plugin deliberately has no self-update route.",
    { site: z.string().describe("Site id (see list_sites)") },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.post<Record<string, unknown>>(`${NS}/update-check`, {}));
    }
  );
}
