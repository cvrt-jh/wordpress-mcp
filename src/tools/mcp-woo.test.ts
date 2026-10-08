import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// Every tool resolves its site through forSite; stub it so no env or network
// is needed and the exact REST call can be asserted.
const get = vi.fn();
const put = vi.fn();
const post = vi.fn();
const del = vi.fn();
vi.mock("../client.js", () => ({
  forSite: (id: string) => {
    if (id !== "a") throw new Error(`Unknown site "${id}"`);
    return { get, put, post, delete: del };
  },
}));

import { register } from "./mcp-woo.js";

type Handler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>;
interface Tool {
  schema: z.ZodRawShape;
  handler: Handler;
}

function tools(): Map<string, Tool> {
  const out = new Map<string, Tool>();
  const server = {
    tool: (name: string, _description: string, schema: z.ZodRawShape, handler: Handler) => {
      out.set(name, { schema, handler });
    },
  };
  register(server as never);
  return out;
}

function tool(name: string): Tool {
  const t = tools().get(name);
  if (!t) throw new Error(`tool ${name} is not registered`);
  return t;
}

// Run args through the tool's zod schema first, like the MCP SDK does, so
// defaults and validation apply exactly as in production.
async function call(name: string, args: Record<string, unknown>) {
  const t = tool(name);
  const parsed = z.object(t.schema).parse(args);
  return t.handler(parsed);
}

describe("woo tools", () => {
  beforeEach(() => {
    for (const fn of [get, put, post, del]) {
      fn.mockReset();
      fn.mockResolvedValue({ ok: true });
    }
  });

  describe("woo_list_products", () => {
    it("sends only the given filters, booleans as strings", async () => {
      await call("woo_list_products", { site: "a", featured: false, stock_status: "outofstock", per_page: 5 });
      expect(get).toHaveBeenCalledWith("/mcp/v1/woo/products", {
        featured: "false",
        stock_status: "outofstock",
        per_page: 5,
      });
    });

    it("sends no filters when none are given (server defaults apply)", async () => {
      await call("woo_list_products", { site: "a" });
      expect(get).toHaveBeenCalledWith("/mcp/v1/woo/products", {});
    });

    it("rejects the empty type and stock_status the server enum does not accept", () => {
      const schema = z.object(tool("woo_list_products").schema);
      expect(schema.safeParse({ site: "a", type: "" }).success).toBe(false);
      expect(schema.safeParse({ site: "a", stock_status: "" }).success).toBe(false);
    });
  });

  describe("products", () => {
    it("woo_create_product sends only the given fields", async () => {
      await call("woo_create_product", {
        site: "a",
        name: "Shirt",
        regular_price: "19.90",
        attributes: [{ name: "Size", options: ["S", "M"], variation: true }],
      });
      expect(post).toHaveBeenCalledWith("/mcp/v1/woo/products", {
        name: "Shirt",
        regular_price: "19.90",
        attributes: [{ name: "Size", options: ["S", "M"], variation: true }],
      });
    });

    it("woo_create_product rejects an unknown stock_status and a non-integer stock", () => {
      const schema = z.object(tool("woo_create_product").schema);
      expect(schema.safeParse({ site: "a", name: "x", stock_status: "low" }).success).toBe(false);
      expect(schema.safeParse({ site: "a", name: "x", stock_quantity: 1.5 }).success).toBe(false);
    });

    it("woo_update_product is a partial update", async () => {
      await call("woo_update_product", { site: "a", id: 12, sale_price: "", stock_status: "onbackorder" });
      expect(put).toHaveBeenCalledWith("/mcp/v1/woo/products/12", { sale_price: "", stock_status: "onbackorder" });
    });

    it("woo_delete_product sends force (default false) as a query param", async () => {
      await call("woo_delete_product", { site: "a", id: 3 });
      expect(del).toHaveBeenCalledWith("/mcp/v1/woo/products/3", { force: "false" });
      await call("woo_delete_product", { site: "a", id: 3, force: true });
      expect(del).toHaveBeenLastCalledWith("/mcp/v1/woo/products/3", { force: "true" });
    });
  });

  describe("variations", () => {
    it("woo_create_variation sends attributes as a map", async () => {
      await call("woo_create_variation", { site: "a", product_id: 9, attributes: { pa_color: "red" }, sku: "S-R" });
      expect(post).toHaveBeenCalledWith("/mcp/v1/woo/products/9/variations", {
        attributes: { pa_color: "red" },
        sku: "S-R",
      });
    });

    it("woo_update_variation sends attributes as a map and only the given fields", async () => {
      await call("woo_update_variation", { site: "a", product_id: 9, variation_id: 10, attributes: { size: "XL" } });
      expect(put).toHaveBeenCalledWith("/mcp/v1/woo/products/9/variations/10", { attributes: { size: "XL" } });
    });

    it("woo_update_variation rejects the old list-of-records attribute shape", () => {
      const schema = z.object(tool("woo_update_variation").schema);
      expect(schema.safeParse({ site: "a", product_id: 1, variation_id: 2, attributes: [{ size: "XL" }] }).success).toBe(false);
    });
  });

  describe("attributes and categories", () => {
    it("woo_create_attribute validates order_by and sends only given fields", async () => {
      const schema = z.object(tool("woo_create_attribute").schema);
      expect(schema.safeParse({ site: "a", name: "Color", order_by: "random" }).success).toBe(false);
      await call("woo_create_attribute", { site: "a", name: "Color", order_by: "name_num" });
      expect(post).toHaveBeenCalledWith("/mcp/v1/woo/attributes", { name: "Color", order_by: "name_num" });
    });

    it("woo_list_categories sends parent 0 (top level) and omits unset hide_empty", async () => {
      await call("woo_list_categories", { site: "a", parent: 0 });
      expect(get).toHaveBeenCalledWith("/mcp/v1/woo/categories", { parent: 0 });
    });

    it("woo_update_category is a partial update", async () => {
      await call("woo_update_category", { site: "a", id: 4, image_id: 0 });
      expect(put).toHaveBeenCalledWith("/mcp/v1/woo/categories/4", { image_id: 0 });
    });
  });

  describe("orders", () => {
    it("woo_list_orders no longer exposes product (the server ignores it)", () => {
      expect(Object.keys(tool("woo_list_orders").schema)).not.toContain("product");
    });

    it("woo_list_orders sends customer and dates", async () => {
      await call("woo_list_orders", { site: "a", customer: 5, after: "2026-01-01" });
      expect(get).toHaveBeenCalledWith("/mcp/v1/woo/orders", { customer: 5, after: "2026-01-01" });
    });

    it("woo_update_order_status sends note only when given", async () => {
      await call("woo_update_order_status", { site: "a", id: 7, status: "completed" });
      expect(put).toHaveBeenCalledWith("/mcp/v1/woo/orders/7/status", { status: "completed" });
    });

    it("woo_add_order_note sends customer_note when given", async () => {
      await call("woo_add_order_note", { site: "a", id: 7, note: "Shipped", customer_note: true });
      expect(post).toHaveBeenCalledWith("/mcp/v1/woo/orders/7/notes", { note: "Shipped", customer_note: true });
    });
  });

  describe("customers", () => {
    it("woo_create_customer sends structured addresses and never echoes the password", async () => {
      post.mockResolvedValue({ id: 50, created: true });
      const result = await call("woo_create_customer", {
        site: "a",
        email: "c@example.com",
        password: "s3cret-pw",
        billing: { city: "Berlin", country: "DE", email: "b@example.com" },
      });
      expect(post).toHaveBeenCalledWith("/mcp/v1/woo/customers", {
        email: "c@example.com",
        password: "s3cret-pw",
        billing: { city: "Berlin", country: "DE", email: "b@example.com" },
      });
      expect(result.content[0].text).not.toContain("s3cret-pw");
    });

    it("rejects address keys the endpoint has no setter for", () => {
      const schema = z.object(tool("woo_update_customer").schema);
      expect(schema.safeParse({ site: "a", id: 1, billing: { street: "x" } }).success).toBe(false);
      expect(schema.safeParse({ site: "a", id: 1, shipping: { email: "x@example.com" } }).success).toBe(false);
    });

    it("woo_update_customer is a partial update", async () => {
      await call("woo_update_customer", { site: "a", id: 8, shipping: { postcode: "10115" } });
      expect(put).toHaveBeenCalledWith("/mcp/v1/woo/customers/8", { shipping: { postcode: "10115" } });
    });
  });

  describe("coupons", () => {
    it("woo_create_coupon sends only the given fields", async () => {
      await call("woo_create_coupon", { site: "a", code: "SALE10", discount_type: "percent", amount: "10" });
      expect(post).toHaveBeenCalledWith("/mcp/v1/woo/coupons", { code: "SALE10", discount_type: "percent", amount: "10" });
    });

    it("woo_update_coupon validates discount_type and is partial", async () => {
      const schema = z.object(tool("woo_update_coupon").schema);
      expect(schema.safeParse({ site: "a", id: 1, discount_type: "bogus" }).success).toBe(false);
      await call("woo_update_coupon", { site: "a", id: 2, usage_limit: 100 });
      expect(put).toHaveBeenCalledWith("/mcp/v1/woo/coupons/2", { usage_limit: 100 });
    });
  });

  describe("reports and inventory", () => {
    it("woo_top_sellers only offers the periods the server distinguishes", async () => {
      const schema = z.object(tool("woo_top_sellers").schema);
      expect(schema.safeParse({ site: "a", period: "last_month" }).success).toBe(false);
      await call("woo_top_sellers", { site: "a", period: "week" });
      expect(get).toHaveBeenCalledWith("/mcp/v1/woo/reports/top-sellers", { period: "week" });
    });

    it("woo_sales_report sends a custom range", async () => {
      await call("woo_sales_report", { site: "a", date_min: "2026-01-01", date_max: "2026-01-31" });
      expect(get).toHaveBeenCalledWith("/mcp/v1/woo/reports/sales", { date_min: "2026-01-01", date_max: "2026-01-31" });
    });

    it("woo_stock_report sends status and limit when given", async () => {
      await call("woo_stock_report", { site: "a", status: "outofstock", limit: 5 });
      expect(get).toHaveBeenCalledWith("/mcp/v1/woo/reports/stock", { status: "outofstock", limit: 5 });
    });

    it("woo_bulk_update_stock validates stock_status per product", async () => {
      const schema = z.object(tool("woo_bulk_update_stock").schema);
      expect(schema.safeParse({ site: "a", products: [{ id: 1, stock_status: "low" }] }).success).toBe(false);
      await call("woo_bulk_update_stock", { site: "a", products: [{ id: 1, stock_quantity: 3 }] });
      expect(post).toHaveBeenCalledWith("/mcp/v1/woo/inventory/bulk-update", { products: [{ id: 1, stock_quantity: 3 }] });
    });
  });
});
