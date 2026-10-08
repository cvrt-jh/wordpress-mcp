/**
 * WooCommerce tools using wp-pilot-pro plugin
 * Requires: wp-pilot-pro WordPress plugin (1.1.0) with WooCommerce module
 * (modules/class-woocommerce-module.php, namespace mcp/v1, routes /woo/*).
 * Every route needs the manage_woocommerce capability.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { defined, jsonResult } from "../types.js";

const site = z.string().describe("Site id (see list_sites)");
const id = (what: string) => z.number().int().describe(`${what} ID`);

const productStatus = z.enum(["draft", "pending", "private", "publish"]);
const productType = z.enum(["simple", "grouped", "external", "variable"]);
const stockStatus = z.enum(["instock", "outofstock", "onbackorder"]);
const discountType = z.enum(["fixed_cart", "percent", "fixed_product"]);

// WC_Customer setters the endpoint maps billing/shipping keys onto
// (set_billing_{key} / set_shipping_{key}); unknown keys are silently dropped.
const addressFields = {
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  company: z.string().optional(),
  address_1: z.string().optional(),
  address_2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional().describe("State/county code, e.g. BY"),
  postcode: z.string().optional(),
  country: z.string().optional().describe("ISO 3166-1 alpha-2 country code, e.g. DE"),
  phone: z.string().optional(),
};
const billing = z
  .object({ ...addressFields, email: z.string().optional() })
  .strict()
  .describe("Billing address; only the given keys are set");
const shipping = z.object(addressFields).strict().describe("Shipping address; only the given keys are set");

// Variation attribute map: attribute taxonomy (pa_color) or custom attribute
// name -> term slug / option value. Empty value means "any".
const variationAttributes = z
  .record(z.string())
  .describe('Attribute map, e.g. {"pa_color": "red", "size": "XL"} (key: attribute taxonomy or custom attribute name; value: term slug or option; "" = any)');

/** Query params for wp.get/delete: undefined dropped, booleans as "true"/"false". */
function query(params: Record<string, string | number | boolean | undefined>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    out[k] = typeof v === "boolean" ? String(v) : v;
  }
  return out;
}

export interface ProductSlim {
  id: number;
  name: string;
  slug: string;
  type: string;
  status: string;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  stock_status: string;
  stock_quantity: number | null;
  categories: number[];
}

export interface ProductFull extends ProductSlim {
  description: string;
  short_description: string;
  manage_stock: boolean;
  featured: boolean;
  on_sale: boolean;
  purchasable: boolean;
  tags: number[];
  image_id: number | string;
  gallery_image_ids: number[];
  date_created: string | null;
  date_modified: string | null;
  attributes: Array<{ name: string; options: Array<string | number>; visible: boolean; variation: boolean }>;
}

export interface OrderSlim {
  id: number;
  number: string;
  status: string;
  total: string;
  currency: string;
  customer_id: number;
  billing_email: string;
  date_created: string | null;
  item_count: number;
}

export interface CustomerSlim {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  order_count: number;
  total_spent: string;
  date_created: string;
}

export interface CouponSlim {
  id: number;
  code: string;
  discount_type: string;
  amount: string;
  usage_count: number;
  usage_limit: number | null;
  date_expires: string | null;
}

export function register(server: McpServer) {
  // ============================================
  // PRODUCTS
  // ============================================

  server.tool(
    "woo_list_products",
    "List WooCommerce products (slim: id, name, slug, type, status, sku, prices, stock, category ids)",
    {
      site,
      status: z.enum(["any", "draft", "pending", "private", "publish", "trash"]).optional().describe("Post status (default any)"),
      type: productType.optional().describe("Product type (default: all types)"),
      category: z.number().int().optional().describe("Product category ID"),
      tag: z.number().int().optional().describe("Product tag ID"),
      featured: z.boolean().optional().describe("Only featured (true) or only non-featured (false) products"),
      on_sale: z.boolean().optional().describe("Only products on sale (true) or not on sale (false)"),
      stock_status: stockStatus.optional().describe("Stock status filter (default: all)"),
      per_page: z.number().int().optional().describe("Products per page (default 20, -1 for all)"),
      page: z.number().int().optional().describe("Page number (default 1)"),
      orderby: z.string().optional().describe("Sort field: date (default), ID, name, title, type, modified, menu_order, rand, none"),
      order: z.enum(["asc", "desc"]).optional().describe("Sort direction (default desc)"),
      search: z.string().optional().describe("Search term"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        products: ProductSlim[];
        count: number;
        page: number;
        per_page: number;
      }>("/mcp/v1/woo/products", query(params));
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_get_product",
    "Get WooCommerce product details (descriptions, stock, tags, images, attributes, dates)",
    { site, id: id("Product") },
    async ({ site, id }) => {
      const wp = forSite(site);
      const result = await wp.get<{ product: ProductFull }>(`/mcp/v1/woo/products/${id}`);
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_create_product",
    "Create a WooCommerce product",
    {
      site,
      name: z.string().describe("Product name"),
      type: productType.optional().describe("Product type (default simple)"),
      status: productStatus.optional().describe("Status (default publish)"),
      regular_price: z.string().optional().describe('Regular price as decimal string, e.g. "19.90"'),
      sale_price: z.string().optional().describe("Sale price as decimal string"),
      description: z.string().optional().describe("Long description (HTML)"),
      short_description: z.string().optional().describe("Short description (HTML)"),
      sku: z.string().optional().describe("SKU (must be unique)"),
      manage_stock: z.boolean().optional().describe("Track stock quantity (default false)"),
      stock_quantity: z.number().int().optional().describe("Stock quantity (used when manage_stock is true)"),
      stock_status: stockStatus.optional().describe("Stock status (default instock)"),
      categories: z.array(z.number().int()).optional().describe("Product category IDs"),
      tags: z.array(z.number().int()).optional().describe("Product tag IDs"),
      images: z.array(z.number().int()).optional().describe("Attachment IDs; the first is the main image, the rest the gallery"),
      attributes: z
        .array(
          z.object({
            name: z.string().describe("Attribute name (custom) or taxonomy (pa_color)"),
            options: z.array(z.string()).optional().describe("Option values (default [])"),
            visible: z.boolean().optional().describe("Show on the product page (default true)"),
            variation: z.boolean().optional().describe("Used for variations (default false)"),
          })
        )
        .optional()
        .describe("Product attributes"),
      meta_data: z.array(z.object({ key: z.string(), value: z.unknown() })).optional().describe("Custom meta to set"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        id: number;
        created: boolean;
        product: ProductSlim;
      }>("/mcp/v1/woo/products", defined(params));
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_update_product",
    "Update a WooCommerce product; only the given fields change (type, images and attributes cannot be changed here)",
    {
      site,
      id: id("Product"),
      name: z.string().optional().describe("Product name"),
      status: productStatus.optional().describe("Status"),
      regular_price: z.string().optional().describe('Regular price as decimal string, e.g. "19.90"'),
      sale_price: z.string().optional().describe('Sale price as decimal string ("" removes the sale price)'),
      description: z.string().optional().describe("Long description (HTML)"),
      short_description: z.string().optional().describe("Short description (HTML)"),
      sku: z.string().optional().describe("SKU (must be unique)"),
      manage_stock: z.boolean().optional().describe("Track stock quantity"),
      stock_quantity: z.number().int().optional().describe("Stock quantity"),
      stock_status: stockStatus.optional().describe("Stock status"),
      categories: z.array(z.number().int()).optional().describe("Product category IDs (replaces the current set)"),
      tags: z.array(z.number().int()).optional().describe("Product tag IDs (replaces the current set)"),
      meta_data: z.array(z.object({ key: z.string(), value: z.unknown() })).optional().describe("Custom meta to set (merged)"),
    },
    async ({ site, id, ...params }) => {
      const wp = forSite(site);
      const result = await wp.put<{
        id: number;
        updated: boolean;
        product: ProductSlim;
      }>(`/mcp/v1/woo/products/${id}`, defined(params));
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_delete_product",
    "Delete a WooCommerce product (to trash unless force)",
    {
      site,
      id: id("Product"),
      force: z.boolean().optional().default(false).describe("Delete permanently instead of moving to trash (default false)"),
    },
    async ({ site, id, force }) => {
      const wp = forSite(site);
      const result = await wp.delete<{
        id: number;
        deleted: boolean;
        force: boolean;
      }>(`/mcp/v1/woo/products/${id}`, query({ force }));
      return jsonResult(result);
    }
  );

  // ============================================
  // PRODUCT VARIATIONS
  // ============================================

  server.tool(
    "woo_list_variations",
    "List the available (purchasable, visible) variations of a variable product",
    { site, product_id: id("Parent product") },
    async ({ site, product_id }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        product_id: number;
        variations: Array<{
          id: number;
          sku: string;
          price: number;
          regular_price: number;
          attributes: Record<string, string>;
          is_in_stock: boolean;
          stock_quantity: number | null;
        }>;
        count: number;
      }>(`/mcp/v1/woo/products/${product_id}/variations`);
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_create_variation",
    "Create a variation of a variable product. Note: wp-pilot-pro 1.1.0 declares `attributes` as a list and rejects this map with 400 until the plugin declares it as an object",
    {
      site,
      product_id: id("Parent product"),
      attributes: variationAttributes,
      regular_price: z.string().optional().describe("Regular price as decimal string"),
      sale_price: z.string().optional().describe("Sale price as decimal string"),
      sku: z.string().optional().describe("SKU (must be unique)"),
      manage_stock: z.boolean().optional().describe("Track stock quantity (default false)"),
      stock_quantity: z.number().int().optional().describe("Stock quantity"),
      stock_status: stockStatus.optional().describe("Stock status (default instock)"),
    },
    async ({ site, product_id, ...params }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        id: number;
        product_id: number;
        created: boolean;
      }>(`/mcp/v1/woo/products/${product_id}/variations`, defined(params));
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_update_variation",
    "Update a product variation; only the given fields change",
    {
      site,
      product_id: id("Parent product"),
      variation_id: id("Variation"),
      regular_price: z.string().optional().describe("Regular price as decimal string"),
      sale_price: z.string().optional().describe('Sale price as decimal string ("" removes it)'),
      sku: z.string().optional().describe("SKU (must be unique)"),
      manage_stock: z.boolean().optional().describe("Track stock quantity"),
      stock_quantity: z.number().int().optional().describe("Stock quantity"),
      stock_status: stockStatus.optional().describe("Stock status"),
      attributes: variationAttributes.optional(),
    },
    async ({ site, product_id, variation_id, ...params }) => {
      const wp = forSite(site);
      const result = await wp.put<{
        id: number;
        updated: boolean;
      }>(`/mcp/v1/woo/products/${product_id}/variations/${variation_id}`, defined(params));
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_delete_variation",
    "Delete a product variation permanently",
    {
      site,
      product_id: id("Parent product"),
      variation_id: id("Variation"),
    },
    async ({ site, product_id, variation_id }) => {
      const wp = forSite(site);
      const result = await wp.delete<{
        id: number;
        deleted: boolean;
      }>(`/mcp/v1/woo/products/${product_id}/variations/${variation_id}`);
      return jsonResult(result);
    }
  );

  // ============================================
  // ATTRIBUTES
  // ============================================

  server.tool(
    "woo_list_attributes",
    "List global product attributes",
    { site },
    async ({ site }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        attributes: Array<{
          id: number;
          name: string;
          slug: string;
          type: string;
          order_by: string;
          has_archives: boolean;
        }>;
        count: number;
      }>("/mcp/v1/woo/attributes");
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_list_attribute_terms",
    "List terms of a global attribute (including empty ones)",
    { site, attribute_id: id("Attribute") },
    async ({ site, attribute_id }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        attribute_id: number;
        terms: Array<{
          id: number;
          name: string;
          slug: string;
          count: number;
        }>;
        count: number;
      }>(`/mcp/v1/woo/attributes/${attribute_id}/terms`);
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_create_attribute",
    "Create a global product attribute (taxonomy pa_{slug})",
    {
      site,
      name: z.string().describe("Attribute name (label)"),
      slug: z.string().optional().describe("Slug, max 28 chars (default: derived from name)"),
      type: z.string().optional().describe('Attribute type (default "select"; plugins may add others)'),
      order_by: z.enum(["menu_order", "name", "name_num", "id"]).optional().describe("Default term sort order (default menu_order)"),
      has_archives: z.boolean().optional().describe("Enable archive pages for terms (default false)"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        id: number;
        created: boolean;
      }>("/mcp/v1/woo/attributes", defined(params));
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_create_attribute_term",
    "Create a term for a global attribute",
    {
      site,
      attribute_id: id("Attribute"),
      name: z.string().describe("Term name"),
      slug: z.string().optional().describe("Term slug (default: derived from name)"),
    },
    async ({ site, attribute_id, ...params }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        id: number;
        created: boolean;
      }>(`/mcp/v1/woo/attributes/${attribute_id}/terms`, defined(params));
      return jsonResult(result);
    }
  );

  // ============================================
  // CATEGORIES & TAGS
  // ============================================

  server.tool(
    "woo_list_categories",
    "List product categories",
    {
      site,
      hide_empty: z.boolean().optional().describe("Hide categories without products (default false)"),
      parent: z.number().int().optional().describe("Only direct children of this category ID (0 = top level)"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        categories: Array<{
          id: number;
          name: string;
          slug: string;
          parent: number;
          count: number;
          image_id: number | null;
        }>;
        count: number;
      }>("/mcp/v1/woo/categories", query(params));
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_create_category",
    "Create a product category",
    {
      site,
      name: z.string().describe("Category name"),
      slug: z.string().optional().describe("Slug (default: derived from name)"),
      parent: z.number().int().optional().describe("Parent category ID (default 0 = top level)"),
      description: z.string().optional().describe("Description"),
      image_id: z.number().int().optional().describe("Thumbnail attachment ID"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        id: number;
        created: boolean;
      }>("/mcp/v1/woo/categories", defined(params));
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_update_category",
    "Update a product category; only the given fields change",
    {
      site,
      id: id("Category"),
      name: z.string().optional().describe("Category name"),
      slug: z.string().optional().describe("Slug"),
      parent: z.number().int().optional().describe("Parent category ID (0 = top level)"),
      description: z.string().optional().describe("Description"),
      image_id: z.number().int().optional().describe("Thumbnail attachment ID (0 removes it)"),
    },
    async ({ site, id, ...params }) => {
      const wp = forSite(site);
      const result = await wp.put<{
        id: number;
        updated: boolean;
      }>(`/mcp/v1/woo/categories/${id}`, defined(params));
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_delete_category",
    "Delete a product category",
    { site, id: id("Category") },
    async ({ site, id }) => {
      const wp = forSite(site);
      const result = await wp.delete<{
        id: number;
        deleted: boolean;
      }>(`/mcp/v1/woo/categories/${id}`);
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_list_tags",
    "List product tags (including empty ones)",
    { site },
    async ({ site }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        tags: Array<{
          id: number;
          name: string;
          slug: string;
          count: number;
        }>;
        count: number;
      }>("/mcp/v1/woo/tags");
      return jsonResult(result);
    }
  );

  // ============================================
  // ORDERS
  // ============================================

  server.tool(
    "woo_list_orders",
    "List WooCommerce orders (slim)",
    {
      site,
      status: z.string().optional().describe("Order status: any (default), pending, processing, on-hold, completed, cancelled, refunded, failed"),
      customer: z.number().int().optional().describe("Customer (user) ID"),
      per_page: z.number().int().optional().describe("Orders per page (default 20, -1 for all)"),
      page: z.number().int().optional().describe("Page number (default 1)"),
      after: z.string().optional().describe("Only orders created after this date (YYYY-MM-DD). Not combinable with before: before wins"),
      before: z.string().optional().describe("Only orders created before this date (YYYY-MM-DD)"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        orders: OrderSlim[];
        count: number;
        page: number;
      }>("/mcp/v1/woo/orders", query(params));
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_get_order",
    "Get WooCommerce order details (payment, billing, shipping, line items, totals)",
    { site, id: id("Order") },
    async ({ site, id }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        order: Record<string, unknown>;
      }>(`/mcp/v1/woo/orders/${id}`);
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_update_order_status",
    "Update order status (triggers the usual WooCommerce status emails)",
    {
      site,
      id: id("Order"),
      status: z.string().describe("New status: pending, processing, on-hold, completed, cancelled, refunded, failed (or a custom status)"),
      note: z.string().optional().describe("Note added to the status change"),
    },
    async ({ site, id, ...params }) => {
      const wp = forSite(site);
      const result = await wp.put<{
        id: number;
        status: string;
        updated: boolean;
      }>(`/mcp/v1/woo/orders/${id}/status`, defined(params));
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_add_order_note",
    "Add a note to an order",
    {
      site,
      id: id("Order"),
      note: z.string().describe("Note content"),
      customer_note: z.boolean().optional().describe("Customer-facing note, emailed to the customer (default false = private)"),
    },
    async ({ site, id, ...params }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        id: number;
        order_id: number;
        created: boolean;
      }>(`/mcp/v1/woo/orders/${id}/notes`, defined(params));
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_get_order_notes",
    "Get order notes",
    { site, id: id("Order") },
    async ({ site, id }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        order_id: number;
        notes: Array<{
          id: number;
          date: string;
          author: string;
          content: string;
          customer_note: boolean;
        }>;
        count: number;
      }>(`/mcp/v1/woo/orders/${id}/notes`);
      return jsonResult(result);
    }
  );

  // ============================================
  // CUSTOMERS
  // ============================================

  server.tool(
    "woo_list_customers",
    "List WooCommerce customers (users with the given role)",
    {
      site,
      per_page: z.number().int().optional().describe("Customers per page (default 20)"),
      page: z.number().int().optional().describe("Page number (default 1)"),
      search: z.string().optional().describe("Search in login, email, URL, display name (wildcard both sides)"),
      role: z.string().optional().describe("User role (default customer)"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        customers: CustomerSlim[];
        count: number;
        page: number;
      }>("/mcp/v1/woo/customers", query(params));
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_get_customer",
    "Get customer details (incl. billing and shipping address)",
    { site, id: id("Customer") },
    async ({ site, id }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        customer: Record<string, unknown>;
      }>(`/mcp/v1/woo/customers/${id}`);
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_create_customer",
    "Create a customer",
    {
      site,
      email: z.string().describe("Customer email"),
      first_name: z.string().optional().describe("First name"),
      last_name: z.string().optional().describe("Last name"),
      username: z.string().optional().describe("Login name (default: generated by WooCommerce)"),
      password: z.string().optional().describe("Password (write-only, never returned; default: generated by WooCommerce)"),
      billing: billing.optional(),
      shipping: shipping.optional(),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        id: number;
        created: boolean;
      }>("/mcp/v1/woo/customers", defined(params));
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_update_customer",
    "Update a customer; only the given fields (and address keys) change",
    {
      site,
      id: id("Customer"),
      email: z.string().optional().describe("Customer email"),
      first_name: z.string().optional().describe("First name"),
      last_name: z.string().optional().describe("Last name"),
      billing: billing.optional(),
      shipping: shipping.optional(),
    },
    async ({ site, id, ...params }) => {
      const wp = forSite(site);
      const result = await wp.put<{
        id: number;
        updated: boolean;
      }>(`/mcp/v1/woo/customers/${id}`, defined(params));
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_get_customer_orders",
    "Get a customer's latest 20 orders plus total spent and order count",
    { site, id: id("Customer") },
    async ({ site, id }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        customer_id: number;
        orders: OrderSlim[];
        count: number;
        total_spent: string;
        order_count: number;
      }>(`/mcp/v1/woo/customers/${id}/orders`);
      return jsonResult(result);
    }
  );

  // ============================================
  // COUPONS
  // ============================================

  server.tool(
    "woo_list_coupons",
    "List published WooCommerce coupons",
    {
      site,
      per_page: z.number().int().optional().describe("Coupons per page (default 20)"),
      page: z.number().int().optional().describe("Page number (default 1)"),
      search: z.string().optional().describe("Search term"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        coupons: CouponSlim[];
        count: number;
        page: number;
      }>("/mcp/v1/woo/coupons", query(params));
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_get_coupon",
    "Get coupon details",
    { site, id: id("Coupon") },
    async ({ site, id }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        coupon: CouponSlim & {
          individual_use: boolean;
          usage_limit_per_user: number | null;
          free_shipping: boolean;
          product_ids: number[];
          excluded_product_ids: number[];
          minimum_amount: string;
          maximum_amount: string;
          used_by: string[];
        };
      }>(`/mcp/v1/woo/coupons/${id}`);
      return jsonResult(result);
    }
  );

  const couponFields = {
    discount_type: discountType.optional().describe("Discount type (default fixed_cart)"),
    amount: z.string().optional().describe('Discount amount as decimal string (default "0")'),
    individual_use: z.boolean().optional().describe("Cannot be combined with other coupons (default false)"),
    usage_limit: z.number().int().optional().describe("Total usage limit"),
    usage_limit_per_user: z.number().int().optional().describe("Usage limit per customer"),
    date_expires: z.string().optional().describe("Expiry date (YYYY-MM-DD)"),
    free_shipping: z.boolean().optional().describe("Grants free shipping (default false)"),
    product_ids: z.array(z.number().int()).optional().describe("Products the coupon applies to"),
    excluded_product_ids: z.array(z.number().int()).optional().describe("Products the coupon does not apply to"),
    minimum_amount: z.string().optional().describe("Minimum cart subtotal as decimal string"),
    maximum_amount: z.string().optional().describe("Maximum cart subtotal as decimal string"),
  };

  server.tool(
    "woo_create_coupon",
    "Create a coupon",
    {
      site,
      code: z.string().describe("Coupon code"),
      ...couponFields,
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        id: number;
        code: string;
        created: boolean;
      }>("/mcp/v1/woo/coupons", defined(params));
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_update_coupon",
    "Update a coupon; only the given fields change",
    {
      site,
      id: id("Coupon"),
      code: z.string().optional().describe("Coupon code"),
      ...couponFields,
    },
    async ({ site, id, ...params }) => {
      const wp = forSite(site);
      const result = await wp.put<{
        id: number;
        updated: boolean;
      }>(`/mcp/v1/woo/coupons/${id}`, defined(params));
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_delete_coupon",
    "Delete a coupon permanently",
    { site, id: id("Coupon") },
    async ({ site, id }) => {
      const wp = forSite(site);
      const result = await wp.delete<{
        id: number;
        deleted: boolean;
      }>(`/mcp/v1/woo/coupons/${id}`);
      return jsonResult(result);
    }
  );

  // ============================================
  // REPORTS
  // ============================================

  server.tool(
    "woo_sales_report",
    "Get sales report (completed + processing orders)",
    {
      site,
      period: z.enum(["week", "month", "last_month", "year"]).optional().describe("Preset range (default month); ignored when both date_min and date_max are given"),
      date_min: z.string().optional().describe("Start date (YYYY-MM-DD); only used together with date_max"),
      date_max: z.string().optional().describe("End date (YYYY-MM-DD); only used together with date_min"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        period: string;
        date_min: string;
        date_max: string;
        total_sales: number;
        total_orders: number;
        total_items: number;
        total_shipping: number;
        total_tax: number;
        average_order_value: number;
      }>("/mcp/v1/woo/reports/sales", query(params));
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_top_sellers",
    "Get top selling products by quantity (completed + processing orders)",
    {
      site,
      period: z.enum(["week", "month", "year"]).optional().describe("week = last 7 days, month = this month (default), year = this year"),
      limit: z.number().int().optional().describe("Number of products (default 10)"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        period: string;
        top_sellers: Array<{
          product_id: number;
          name: string;
          quantity_sold: number;
        }>;
        count: number;
      }>("/mcp/v1/woo/reports/top-sellers", query(params));
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_stock_report",
    "Get stock status report (stock-managed products, lowest stock first)",
    {
      site,
      status: z.enum(["lowstock", "outofstock", "onbackorder"]).optional().describe("lowstock (default: in stock at or below the low-stock threshold), outofstock, onbackorder"),
      limit: z.number().int().optional().describe("Number of products (default 20)"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        status: string;
        products: Array<{
          id: number;
          name: string;
          sku: string;
          stock_quantity: number | null;
          stock_status: string;
        }>;
        count: number;
      }>("/mcp/v1/woo/reports/stock", query(params));
      return jsonResult(result);
    }
  );

  // ============================================
  // PRODUCT META
  // ============================================

  server.tool(
    "woo_get_product_meta",
    "Get all product meta data plus _regular_price, _sale_price, _price, _stock, _stock_status, _sku",
    { site, id: id("Product") },
    async ({ site, id }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        product_id: number;
        meta: Record<string, unknown>;
      }>(`/mcp/v1/woo/products/${id}/meta`);
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_update_product_meta",
    "Update product meta data (merged; _regular_price, _sale_price, _stock, _stock_status, _sku go through the product setters)",
    {
      site,
      id: id("Product"),
      meta: z.record(z.unknown()).describe("Meta key-value pairs"),
    },
    async ({ site, id, meta }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        product_id: number;
        updated: string[];
      }>(`/mcp/v1/woo/products/${id}/meta`, { meta });
      return jsonResult(result);
    }
  );

  // ============================================
  // INVENTORY
  // ============================================

  server.tool(
    "woo_bulk_update_stock",
    "Bulk update product stock; per product only the given fields change",
    {
      site,
      products: z
        .array(
          z.object({
            id: z.number().int().describe("Product or variation ID"),
            stock_quantity: z.number().int().optional().describe("New stock quantity"),
            stock_status: stockStatus.optional().describe("New stock status"),
          })
        )
        .describe("Products with stock updates"),
    },
    async ({ site, products }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        updated: number[];
        failed: Array<{ id: number; error: string }>;
        updated_count: number;
        failed_count: number;
      }>("/mcp/v1/woo/inventory/bulk-update", { products });
      return jsonResult(result);
    }
  );
}
