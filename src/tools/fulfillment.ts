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
import { jsonResult } from "../types.js";

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

  server.tool(
    "fulfillment_update_settings",
    "Update cvrt-order-fulfillment settings. Only provide the keys you want to change. A blank/omitted secret keeps the stored value (never wipes it). Keys: clickup_token, clickup_list_id, clickup_assignee_id, agent_token, webhook_secret, github_updater_token, slack_webhook_url.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      clickup_token: z.string().optional(),
      clickup_list_id: z.string().optional(),
      clickup_assignee_id: z.number().optional(),
      agent_token: z.string().optional(),
      webhook_secret: z.string().optional(),
      github_updater_token: z.string().optional(),
      slack_webhook_url: z.string().optional(),
    },
    async ({ site, ...args }) => {
      const wp = forSite(site);
      const body = Object.fromEntries(
        Object.entries(args).filter(([, v]) => v !== undefined)
      );
      return jsonResult(await wp.post<Record<string, unknown>>(`${NS}/settings`, body));
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
    "Print-queue state: status counts (pending/printing/printed/failed) and the recent jobs with their errors.",
    { site: z.string().describe("Site id (see list_sites)") },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.get<Record<string, unknown>>(`${NS}/queue`));
    }
  );

  server.tool(
    "fulfillment_reprint_job",
    "Reset a print job to pending so the agent prints it again.",
    {
      site: z.string().describe("Site id (see list_sites)"),
      job_id: z.number().describe("The print job id (from fulfillment_queue)"),
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
      order_id: z.number().describe("The WooCommerce order id"),
    },
    async ({ site, order_id }) => {
      const wp = forSite(site);
      return jsonResult(await wp.post<Record<string, unknown>>(`${NS}/orders/${order_id}/fulfill`, {}));
    }
  );

  server.tool(
    "fulfillment_update_check",
    "Force an immediate plugin-update check (bypassing PUC's throttle) and report whether a newer version is available. Throttled to about once per 30s.",
    { site: z.string().describe("Site id (see list_sites)") },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.post<Record<string, unknown>>(`${NS}/update-check`, {}));
    }
  );

  server.tool(
    "fulfillment_update_apply",
    "Install a pending cvrt-order-fulfillment update via WordPress's own upgrader (same code path as the wp-admin one-click update). Reports { applied, from, to }. Audit-logged.",
    { site: z.string().describe("Site id (see list_sites)") },
    async ({ site }) => {
      const wp = forSite(site);
      return jsonResult(await wp.post<Record<string, unknown>>(`${NS}/update-apply`, {}));
    }
  );
}
