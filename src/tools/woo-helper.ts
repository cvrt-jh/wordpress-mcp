/**
 * cvrt-woo-helper tools (mcp/woo-helper/v1): the plugin that owns WooCommerce
 * Stripe express checkout and where Stripe.js loads. Every route needs
 * manage_woocommerce; secrets come back masked or as { set }.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { defined, jsonResult } from "../types.js";

const NS = "/mcp/woo-helper/v1";
const site = z.string().describe("Site id (see list_sites)");
const pages = z.array(z.enum(["product", "cart", "checkout"]));

export function register(server: McpServer) {
  server.tool(
    "woo_helper_status",
    "cvrt-woo-helper status: plugin version, WooCommerce and Stripe Gateway active/version, whether the CVRT hub is on, GitHub token { set }.",
    { site },
    async ({ site: id }) => jsonResult(await forSite(id).get<Record<string, unknown>>(`${NS}/status`))
  );

  server.tool(
    "woo_helper_get_settings",
    "cvrt-woo-helper settings (secrets as { set }, never raw).",
    { site },
    async ({ site: id }) => jsonResult(await forSite(id).get<Record<string, unknown>>(`${NS}/settings`))
  );

  server.tool(
    "woo_helper_update_settings",
    "Update cvrt-woo-helper settings. github_token is write-only (blank or omitted keeps the stored one); clear_github_token:true deletes it.",
    {
      site,
      github_token: z.string().optional().describe("GitHub token for plugin updates (write-only)"),
      clear_github_token: z.boolean().optional().describe("Delete the stored GitHub token"),
    },
    async ({ site: id, ...fields }) =>
      jsonResult(await forSite(id).put<Record<string, unknown>>(`${NS}/settings`, defined(fields)))
  );

  server.tool(
    "woo_helper_get_stripe",
    "The Stripe express-checkout settings cvrt-woo-helper manages: express checkout on/off, button locations per type and what they mean per page, and whether Stripe.js loads only on the checkout (scripts_checkout_only, so it does not load before consent on product pages).",
    { site },
    async ({ site: id }) => jsonResult(await forSite(id).get<Record<string, unknown>>(`${NS}/stripe`))
  );

  server.tool(
    "woo_helper_update_stripe",
    "Change Stripe express checkout through cvrt-woo-helper. Only the keys given change. locations maps a button type (apple_google_pay, link, amazon_pay) to the pages it shows on (product, cart, checkout). 409 when the Stripe Gateway plugin is inactive.",
    {
      site,
      express_checkout: z.boolean().optional().describe("Express checkout buttons on/off"),
      locations: z
        .object({ apple_google_pay: pages.optional(), link: pages.optional(), amazon_pay: pages.optional() })
        .strict()
        .optional()
        .describe("Pages per button type"),
      scripts_checkout_only: z.boolean().optional().describe("Load Stripe.js only on the checkout page"),
    },
    async ({ site: id, locations, ...rest }) =>
      jsonResult(
        await forSite(id).put<Record<string, unknown>>(
          `${NS}/stripe`,
          defined({ ...rest, locations: locations ? defined(locations) : undefined })
        )
      )
  );

  server.tool(
    "woo_helper_stripe_status",
    "Read-only WooCommerce Stripe Gateway status from cvrt-woo-helper (recursively masked): mode, enabled methods, express checkout and Stripe.js loading per page.",
    { site },
    async ({ site: id }) => jsonResult(await forSite(id).get<Record<string, unknown>>(`${NS}/stripe/status`))
  );
}
