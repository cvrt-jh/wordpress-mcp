/**
 * WooCommerce tools using wp-pilot-pro plugin
 * Requires: wp-pilot-pro WordPress plugin with WooCommerce module
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { jsonResult } from "../types.js";

export function register(server: McpServer) {
  // ============================================
  // PRODUCTS
  // ============================================

  server.tool(
    "woo_list_products",
    "List WooCommerce products",
    {
      site: z.string().describe("Site id (see list_sites)"),
      status: z.enum(["any", "draft", "pending", "private", "publish", "trash"]).optional().default("any"),
      type: z.enum(["simple", "grouped", "external", "variable", ""]).optional().default(""),
      category: z.number().optional().describe("Category ID"),
      tag: z.number().optional().describe("Tag ID"),
      featured: z.boolean().optional(),
      on_sale: z.boolean().optional(),
      stock_status: z.enum(["", "instock", "outofstock", "onbackorder"]).optional().default(""),
      per_page: z.number().optional().default(20),
      page: z.number().optional().default(1),
      orderby: z.string().optional().default("date"),
      order: z.enum(["asc", "desc"]).optional().default("desc"),
      search: z.string().optional().default(""),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const urlParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== "") {
          urlParams.append(key, String(value));
        }
      });
      const result = await wp.get<{
        products: Array<Record<string, unknown>>;
        count: number;
        page: number;
        per_page: number;
      }>(`/mcp/v1/woo/products?${urlParams}`);
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_get_product",
    "Get WooCommerce product details",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Product ID"),
    },
    async ({ site, id }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        product: Record<string, unknown>;
      }>(`/mcp/v1/woo/products/${id}`);
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_create_product",
    "Create a WooCommerce product",
    {
      site: z.string().describe("Site id (see list_sites)"),
      name: z.string().describe("Product name"),
      type: z.enum(["simple", "grouped", "external", "variable"]).optional().default("simple"),
      status: z.string().optional().default("publish"),
      regular_price: z.string().optional().default(""),
      sale_price: z.string().optional().default(""),
      description: z.string().optional().default(""),
      short_description: z.string().optional().default(""),
      sku: z.string().optional().default(""),
      manage_stock: z.boolean().optional().default(false),
      stock_quantity: z.number().optional(),
      stock_status: z.string().optional().default("instock"),
      categories: z.array(z.number()).optional().default([]),
      tags: z.array(z.number()).optional().default([]),
      images: z.array(z.number()).optional().default([]),
      attributes: z.array(z.record(z.unknown())).optional().default([]),
      meta_data: z.array(z.object({ key: z.string(), value: z.unknown() })).optional().default([]),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        id: number;
        created: boolean;
        product: Record<string, unknown>;
      }>("/mcp/v1/woo/products", params);
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_update_product",
    "Update a WooCommerce product",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Product ID"),
      name: z.string().optional(),
      status: z.string().optional(),
      regular_price: z.string().optional(),
      sale_price: z.string().optional(),
      description: z.string().optional(),
      short_description: z.string().optional(),
      sku: z.string().optional(),
      manage_stock: z.boolean().optional(),
      stock_quantity: z.number().optional(),
      stock_status: z.string().optional(),
      categories: z.array(z.number()).optional(),
      tags: z.array(z.number()).optional(),
      meta_data: z.array(z.object({ key: z.string(), value: z.unknown() })).optional(),
    },
    async ({ site, id, ...params }) => {
      const wp = forSite(site);
      const result = await wp.put<{
        id: number;
        updated: boolean;
        product: Record<string, unknown>;
      }>(`/mcp/v1/woo/products/${id}`, params);
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_delete_product",
    "Delete a WooCommerce product",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Product ID"),
      force: z.boolean().optional().default(false).describe("Force delete (skip trash)"),
    },
    async ({ site, id, force }) => {
      const wp = forSite(site);
      const result = await wp.delete<{
        id: number;
        deleted: boolean;
        force: boolean;
      }>(`/mcp/v1/woo/products/${id}?force=${force}`);
      return jsonResult(result);
    }
  );

  // ============================================
  // PRODUCT VARIATIONS
  // ============================================

  server.tool(
    "woo_list_variations",
    "List variations for a variable product",
    {
      site: z.string().describe("Site id (see list_sites)"),
      product_id: z.number().describe("Parent product ID"),
    },
    async ({ site, product_id }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        product_id: number;
        variations: Array<Record<string, unknown>>;
        count: number;
      }>(`/mcp/v1/woo/products/${product_id}/variations`);
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_create_variation",
    "Create a product variation",
    {
      site: z.string().describe("Site id (see list_sites)"),
      product_id: z.number().describe("Parent product ID"),
      attributes: z.array(z.record(z.string())).describe("Variation attributes"),
      regular_price: z.string().optional().default(""),
      sale_price: z.string().optional().default(""),
      sku: z.string().optional().default(""),
      manage_stock: z.boolean().optional().default(false),
      stock_quantity: z.number().optional(),
      stock_status: z.string().optional().default("instock"),
    },
    async ({ site, product_id, ...params }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        id: number;
        product_id: number;
        created: boolean;
      }>(`/mcp/v1/woo/products/${product_id}/variations`, params);
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_update_variation",
    "Update a product variation",
    {
      site: z.string().describe("Site id (see list_sites)"),
      product_id: z.number().describe("Parent product ID"),
      variation_id: z.number().describe("Variation ID"),
      regular_price: z.string().optional(),
      sale_price: z.string().optional(),
      sku: z.string().optional(),
      manage_stock: z.boolean().optional(),
      stock_quantity: z.number().optional(),
      stock_status: z.string().optional(),
      attributes: z.array(z.record(z.string())).optional(),
    },
    async ({ site, product_id, variation_id, ...params }) => {
      const wp = forSite(site);
      const result = await wp.put<{
        id: number;
        updated: boolean;
      }>(`/mcp/v1/woo/products/${product_id}/variations/${variation_id}`, params);
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_delete_variation",
    "Delete a product variation",
    {
      site: z.string().describe("Site id (see list_sites)"),
      product_id: z.number().describe("Parent product ID"),
      variation_id: z.number().describe("Variation ID"),
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
    "List product attributes",
    {
      site: z.string().describe("Site id (see list_sites)"),
    },
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
    "List terms for an attribute",
    {
      site: z.string().describe("Site id (see list_sites)"),
      attribute_id: z.number().describe("Attribute ID"),
    },
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
    "Create a product attribute",
    {
      site: z.string().describe("Site id (see list_sites)"),
      name: z.string().describe("Attribute name"),
      slug: z.string().optional().default(""),
      type: z.string().optional().default("select"),
      order_by: z.string().optional().default("menu_order"),
      has_archives: z.boolean().optional().default(false),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        id: number;
        created: boolean;
      }>("/mcp/v1/woo/attributes", params);
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_create_attribute_term",
    "Create a term for an attribute",
    {
      site: z.string().describe("Site id (see list_sites)"),
      attribute_id: z.number().describe("Attribute ID"),
      name: z.string().describe("Term name"),
      slug: z.string().optional().default(""),
    },
    async ({ site, attribute_id, ...params }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        id: number;
        created: boolean;
      }>(`/mcp/v1/woo/attributes/${attribute_id}/terms`, params);
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
      site: z.string().describe("Site id (see list_sites)"),
      hide_empty: z.boolean().optional().default(false),
      parent: z.number().optional(),
    },
    async ({ site, hide_empty, parent }) => {
      const wp = forSite(site);
      const params = new URLSearchParams();
      params.append("hide_empty", String(hide_empty));
      if (parent !== undefined) params.append("parent", String(parent));
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
      }>(`/mcp/v1/woo/categories?${params}`);
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_create_category",
    "Create a product category",
    {
      site: z.string().describe("Site id (see list_sites)"),
      name: z.string().describe("Category name"),
      slug: z.string().optional().default(""),
      parent: z.number().optional().default(0),
      description: z.string().optional().default(""),
      image_id: z.number().optional().default(0),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        id: number;
        created: boolean;
      }>("/mcp/v1/woo/categories", params);
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_update_category",
    "Update a product category",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Category ID"),
      name: z.string().optional(),
      slug: z.string().optional(),
      parent: z.number().optional(),
      description: z.string().optional(),
      image_id: z.number().optional(),
    },
    async ({ site, id, ...params }) => {
      const wp = forSite(site);
      const result = await wp.put<{
        id: number;
        updated: boolean;
      }>(`/mcp/v1/woo/categories/${id}`, params);
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_delete_category",
    "Delete a product category",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Category ID"),
    },
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
    "List product tags",
    {
      site: z.string().describe("Site id (see list_sites)"),
    },
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
    "List WooCommerce orders",
    {
      site: z.string().describe("Site id (see list_sites)"),
      status: z.string().optional().default("any"),
      customer: z.number().optional().describe("Customer ID"),
      product: z.number().optional().describe("Product ID"),
      per_page: z.number().optional().default(20),
      page: z.number().optional().default(1),
      after: z.string().optional().describe("Orders after date (YYYY-MM-DD)"),
      before: z.string().optional().describe("Orders before date (YYYY-MM-DD)"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const urlParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== 0 && value !== "") {
          urlParams.append(key, String(value));
        }
      });
      const result = await wp.get<{
        orders: Array<Record<string, unknown>>;
        count: number;
        page: number;
      }>(`/mcp/v1/woo/orders?${urlParams}`);
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_get_order",
    "Get WooCommerce order details",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Order ID"),
    },
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
    "Update order status",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Order ID"),
      status: z.string().describe("New status (pending, processing, on-hold, completed, cancelled, refunded, failed)"),
      note: z.string().optional().default("").describe("Optional status change note"),
    },
    async ({ site, id, status, note }) => {
      const wp = forSite(site);
      const result = await wp.put<{
        id: number;
        status: string;
        updated: boolean;
      }>(`/mcp/v1/woo/orders/${id}/status`, { status, note });
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_add_order_note",
    "Add a note to an order",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Order ID"),
      note: z.string().describe("Note content"),
      customer_note: z.boolean().optional().default(false).describe("Send to customer"),
    },
    async ({ site, id, note, customer_note }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        id: number;
        order_id: number;
        created: boolean;
      }>(`/mcp/v1/woo/orders/${id}/notes`, { note, customer_note });
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_get_order_notes",
    "Get order notes",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Order ID"),
    },
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
    "List WooCommerce customers",
    {
      site: z.string().describe("Site id (see list_sites)"),
      per_page: z.number().optional().default(20),
      page: z.number().optional().default(1),
      search: z.string().optional().default(""),
      role: z.string().optional().default("customer"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const urlParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== "") {
          urlParams.append(key, String(value));
        }
      });
      const result = await wp.get<{
        customers: Array<Record<string, unknown>>;
        count: number;
        page: number;
      }>(`/mcp/v1/woo/customers?${urlParams}`);
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_get_customer",
    "Get customer details",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Customer ID"),
    },
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
      site: z.string().describe("Site id (see list_sites)"),
      email: z.string().describe("Customer email"),
      first_name: z.string().optional().default(""),
      last_name: z.string().optional().default(""),
      username: z.string().optional().default(""),
      password: z.string().optional().default(""),
      billing: z.record(z.string()).optional().default({}),
      shipping: z.record(z.string()).optional().default({}),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        id: number;
        created: boolean;
      }>("/mcp/v1/woo/customers", params);
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_update_customer",
    "Update a customer",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Customer ID"),
      email: z.string().optional(),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      billing: z.record(z.string()).optional(),
      shipping: z.record(z.string()).optional(),
    },
    async ({ site, id, ...params }) => {
      const wp = forSite(site);
      const result = await wp.put<{
        id: number;
        updated: boolean;
      }>(`/mcp/v1/woo/customers/${id}`, params);
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_get_customer_orders",
    "Get customer's order history",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Customer ID"),
    },
    async ({ site, id }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        customer_id: number;
        orders: Array<Record<string, unknown>>;
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
    "List WooCommerce coupons",
    {
      site: z.string().describe("Site id (see list_sites)"),
      per_page: z.number().optional().default(20),
      page: z.number().optional().default(1),
      search: z.string().optional().default(""),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const urlParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== "") {
          urlParams.append(key, String(value));
        }
      });
      const result = await wp.get<{
        coupons: Array<Record<string, unknown>>;
        count: number;
        page: number;
      }>(`/mcp/v1/woo/coupons?${urlParams}`);
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_get_coupon",
    "Get coupon details",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Coupon ID"),
    },
    async ({ site, id }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        coupon: Record<string, unknown>;
      }>(`/mcp/v1/woo/coupons/${id}`);
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_create_coupon",
    "Create a coupon",
    {
      site: z.string().describe("Site id (see list_sites)"),
      code: z.string().describe("Coupon code"),
      discount_type: z.enum(["fixed_cart", "percent", "fixed_product"]).optional().default("fixed_cart"),
      amount: z.string().optional().default("0"),
      individual_use: z.boolean().optional().default(false),
      usage_limit: z.number().optional(),
      usage_limit_per_user: z.number().optional(),
      date_expires: z.string().optional().describe("Expiry date (YYYY-MM-DD)"),
      free_shipping: z.boolean().optional().default(false),
      product_ids: z.array(z.number()).optional().default([]),
      excluded_product_ids: z.array(z.number()).optional().default([]),
      minimum_amount: z.string().optional().default(""),
      maximum_amount: z.string().optional().default(""),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const result = await wp.post<{
        id: number;
        code: string;
        created: boolean;
      }>("/mcp/v1/woo/coupons", params);
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_update_coupon",
    "Update a coupon",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Coupon ID"),
      code: z.string().optional(),
      discount_type: z.string().optional(),
      amount: z.string().optional(),
      individual_use: z.boolean().optional(),
      usage_limit: z.number().optional(),
      usage_limit_per_user: z.number().optional(),
      date_expires: z.string().optional(),
      free_shipping: z.boolean().optional(),
      product_ids: z.array(z.number()).optional(),
      excluded_product_ids: z.array(z.number()).optional(),
      minimum_amount: z.string().optional(),
      maximum_amount: z.string().optional(),
    },
    async ({ site, id, ...params }) => {
      const wp = forSite(site);
      const result = await wp.put<{
        id: number;
        updated: boolean;
      }>(`/mcp/v1/woo/coupons/${id}`, params);
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_delete_coupon",
    "Delete a coupon",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Coupon ID"),
    },
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
    "Get sales report",
    {
      site: z.string().describe("Site id (see list_sites)"),
      period: z.enum(["week", "month", "last_month", "year"]).optional().default("month"),
      date_min: z.string().optional().describe("Start date (YYYY-MM-DD)"),
      date_max: z.string().optional().describe("End date (YYYY-MM-DD)"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const urlParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== "") {
          urlParams.append(key, String(value));
        }
      });
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
      }>(`/mcp/v1/woo/reports/sales?${urlParams}`);
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_top_sellers",
    "Get top selling products",
    {
      site: z.string().describe("Site id (see list_sites)"),
      period: z.string().optional().default("month"),
      limit: z.number().optional().default(10),
    },
    async ({ site, period, limit }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        period: string;
        top_sellers: Array<{
          product_id: number;
          name: string;
          quantity_sold: number;
        }>;
        count: number;
      }>(`/mcp/v1/woo/reports/top-sellers?period=${period}&limit=${limit}`);
      return jsonResult(result);
    }
  );

  server.tool(
    "woo_stock_report",
    "Get stock status report",
    {
      site: z.string().describe("Site id (see list_sites)"),
      status: z.enum(["lowstock", "outofstock", "onbackorder"]).optional().default("lowstock"),
      limit: z.number().optional().default(20),
    },
    async ({ site, status, limit }) => {
      const wp = forSite(site);
      const result = await wp.get<{
        status: string;
        products: Array<{
          id: number;
          name: string;
          sku: string;
          stock_quantity: number;
          stock_status: string;
        }>;
        count: number;
      }>(`/mcp/v1/woo/reports/stock?status=${status}&limit=${limit}`);
      return jsonResult(result);
    }
  );

  // ============================================
  // PRODUCT META
  // ============================================

  server.tool(
    "woo_get_product_meta",
    "Get all product meta data",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Product ID"),
    },
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
    "Update product meta data",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().describe("Product ID"),
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
    "Bulk update product stock",
    {
      site: z.string().describe("Site id (see list_sites)"),
      products: z.array(z.object({
        id: z.number(),
        stock_quantity: z.number().optional(),
        stock_status: z.string().optional(),
      })).describe("Array of products with stock updates"),
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
