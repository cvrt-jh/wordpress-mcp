/**
 * Stripe proxy tools (cvrt-mcp-endpoints 1.17.0+, mcp/v1/stripe/*) and the
 * WooCommerce gateway status. The site's Stripe key never leaves WordPress:
 * the mu-plugin calls Stripe with the key the gateway stores and returns only
 * whitelisted fields. Writes need confirm:true and are audit-logged on the site.
 * Express checkout and where Stripe.js loads are cvrt-woo-helper's (woo_helper_*).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { defined, jsonResult } from "../types.js";

const NS = "/mcp/v1/stripe";
const site = z.string().describe("Site id (see list_sites)");
const confirm = z.literal(true).describe("Must be true: this changes the live Stripe account");
const limit = z.number().int().min(1).max(100).optional().describe("How many, newest first (1-100, default 20)");
type Json = Record<string, unknown>;

export function register(server: McpServer) {
  server.tool(
    "stripe_get_settings",
    "WooCommerce Stripe Gateway settings, secrets masked, plus the active mode (live/test).",
    { site },
    async ({ site: id }) => jsonResult(await forSite(id).get<Json>(`${NS}/settings`))
  );

  server.tool(
    "stripe_get_account",
    "The Stripe account behind the gateway: country, default currency, charges/payouts enabled, details submitted, requirements (currently_due, past_due, disabled_reason).",
    { site },
    async ({ site: id }) => jsonResult(await forSite(id).get<Json>(`${NS}/account`))
  );

  server.tool(
    "stripe_list_webhooks",
    "Webhook endpoints of the Stripe account: id, url, status, api_version, number of events; configured:true marks the endpoint that delivers to this site's gateway URL.",
    { site },
    async ({ site: id }) => jsonResult(await forSite(id).get<Json>(`${NS}/webhooks`))
  );

  server.tool(
    "stripe_recreate_webhook",
    "Recreate this site's Stripe webhook with the gateway's own routine: a new endpoint is created first, then older endpoints for this site's URL are deleted, and the new signing secret is stored on the site (never returned). Use when stripe_list_webhooks shows no enabled configured endpoint. Needs confirm:true; audit-logged.",
    { site, confirm },
    async ({ site: id, confirm: c }) => jsonResult(await forSite(id).post<Json>(`${NS}/webhooks/recreate`, { confirm: c }))
  );

  server.tool(
    "stripe_list_payment_method_configs",
    "Stripe payment method configurations: per configuration every payment method with available, preference (what was chosen) and value (what is in effect).",
    { site },
    async ({ site: id }) => jsonResult(await forSite(id).get<Json>(`${NS}/payment-method-configurations`))
  );

  server.tool(
    "stripe_set_payment_method",
    "Turn one payment method of a Stripe payment method configuration on or off (display preference). The method must exist in that configuration (see stripe_list_payment_method_configs). Needs confirm:true; audit-logged.",
    {
      site,
      config_id: z.string().regex(/^pmc_[A-Za-z0-9]+$/).describe("Payment method configuration id (pmc_...)"),
      method: z.string().regex(/^[a-z][a-z0-9_]*$/).describe("Payment method key, e.g. card, klarna, sofort"),
      enabled: z.boolean().describe("true = on, false = off"),
      confirm,
    },
    async ({ site: id, config_id, method, enabled, confirm: c }) =>
      jsonResult(
        await forSite(id).post<Json>(`${NS}/payment-method-configurations/${config_id}`, { method, enabled, confirm: c })
      )
  );

  server.tool(
    "stripe_list_charges",
    "Recent Stripe charges: id, amount, currency, status, created, paid/refunded, payment method type, outcome, failure code/message, WooCommerce order_id. No customer personal data or card details.",
    { site, limit },
    async ({ site: id, limit: n }) => jsonResult(await forSite(id).get<Json>(`${NS}/charges`, defined({ limit: n })))
  );

  server.tool(
    "stripe_list_refunds",
    "Recent Stripe refunds: id, amount, currency, status, created, charge, reason, WooCommerce order_id. Read-only; refunds are not created here.",
    { site, limit },
    async ({ site: id, limit: n }) => jsonResult(await forSite(id).get<Json>(`${NS}/refunds`, defined({ limit: n })))
  );

  server.tool(
    "woo_gateway_status",
    "WooCommerce payment gateways for a customer country: id, title, enabled, available (offered at checkout, WooCommerce's own check for an empty cart, so minimum-total gateways show unavailable), plus cvrt-woo-helper's Stripe status (express checkout, where Stripe.js loads) when that plugin is active. cvrt-mcp-endpoints 1.17.0+.",
    {
      site,
      country: z.string().regex(/^[A-Za-z]{2}$/).optional().describe("ISO country code (default DE)"),
    },
    async ({ site: id, country }) =>
      jsonResult(await forSite(id).get<Json>("/mcp/v1/payments/gateways", defined({ country })))
  );
}
