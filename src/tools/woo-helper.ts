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
const color = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "#rgb or #rrggbb");

// The WooCommerce email settings cvrt-woo-helper 0.2.0 manages (PUT /emails and the
// unsaved overrides of POST /emails/test take the same keys).
const emailSettings = {
  logo_id: z.number().int().min(0).optional().describe("Media library attachment id of the logo; 0 removes it"),
  logo_width: z.number().int().min(40).max(200).optional().describe("Logo width in px (40-200)"),
  base_color: color.optional().describe("Base (accent) colour"),
  background_color: color.optional().describe("Email background colour"),
  body_background_color: color.optional().describe("Body background colour"),
  text_color: color.optional().describe("Body text colour"),
  footer_text_color: color.optional().describe("Footer text colour"),
  link_color: z.union([color, z.literal("")]).optional().describe("Link colour; empty = WooCommerce's default"),
  footer_text: z
    .string()
    .optional()
    .describe("Footer text; placeholders {site_title} {site_url} {store_address} {store_email} {year}"),
  product_images: z.enum(["off", "small"]).optional().describe("Product images in order emails"),
  certificate_link_once: z
    .boolean()
    .optional()
    .describe("Show the certificate download link only once (needs wp-woo-pdf-builder 1.7.6+)"),
};

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

  server.tool(
    "woo_helper_get_emails",
    "WooCommerce email look managed by cvrt-woo-helper 0.2.0+: logo (id, url, warning for unsafe formats), logo width, colours, footer text, product images, certificate link once, plus the environment (WooCommerce version, email template improved/classic/block_editor, PDF builder).",
    { site },
    async ({ site: id }) => jsonResult(await forSite(id).get<Record<string, unknown>>(`${NS}/emails`))
  );

  server.tool(
    "woo_helper_update_emails",
    "Change the WooCommerce email look through cvrt-woo-helper 0.2.0+. Only the keys given change; an invalid value is a 400 naming the field and nothing is written. Returns the settings as woo_helper_get_emails does.",
    { site, ...emailSettings },
    async ({ site: id, ...fields }) =>
      jsonResult(await forSite(id).put<Record<string, unknown>>(`${NS}/emails`, defined(fields)))
  );

  server.tool(
    "woo_helper_send_test_email",
    "SENDS A REAL EMAIL: a WooCommerce order-email preview to `to`. settings (same keys as woo_helper_update_emails) are applied to this one email only and NOT saved, to try a look before saving it. Rate limited (30 s per user, 10 per hour per site; 429). Needs WooCommerce 9.6+ (409) and cvrt-woo-helper 0.2.0+.",
    {
      site,
      to: z.string().email().describe("Recipient address"),
      settings: z.object(emailSettings).strict().optional().describe("Unsaved overrides for this test email"),
    },
    async ({ site: id, to, settings }) =>
      jsonResult(
        await forSite(id).post<Record<string, unknown>>(`${NS}/emails/test`, defined({ to, settings: settings ? defined(settings) : undefined }))
      )
  );
}
