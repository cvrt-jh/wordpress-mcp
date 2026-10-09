import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const get = vi.fn();
const put = vi.fn();
vi.mock("../client.js", () => ({ forSite: () => ({ get, put }) }));
import { register } from "./woo-helper.js";

type Handler = (args: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
function tool(name: string): { schema: z.ZodRawShape; handler: Handler } {
  let found: { schema: z.ZodRawShape; handler: Handler } | undefined;
  register({ tool: (n: string, _d: string, schema: z.ZodRawShape, handler: Handler) => { if (n === name) found = { schema, handler }; } } as never);
  if (!found) throw new Error(`tool ${name} is not registered`);
  return found;
}

beforeEach(() => {
  get.mockReset();
  put.mockReset();
});

describe("woo-helper tools", () => {
  it("woo_helper_update_stripe sends only the keys given", async () => {
    put.mockResolvedValue({});
    await tool("woo_helper_update_stripe").handler({ site: "a", scripts_checkout_only: true, locations: { apple_google_pay: ["checkout"] } });
    expect(put).toHaveBeenCalledWith("/mcp/woo-helper/v1/stripe", { scripts_checkout_only: true, locations: { apple_google_pay: ["checkout"] } });
  });

  it("woo_helper_update_stripe refuses unknown pages and button types", () => {
    const schema = z.object(tool("woo_helper_update_stripe").schema);
    expect(schema.safeParse({ site: "a", locations: { apple_google_pay: ["home"] } }).success).toBe(false);
    expect(schema.safeParse({ site: "a", locations: { paypal: ["cart"] } }).success).toBe(false);
    expect(schema.safeParse({ site: "a", locations: { link: ["product", "cart"] } }).success).toBe(true);
  });

  it("woo_helper_update_settings never sends an unset token", async () => {
    put.mockResolvedValue({});
    await tool("woo_helper_update_settings").handler({ site: "a", clear_github_token: true });
    expect(put).toHaveBeenCalledWith("/mcp/woo-helper/v1/settings", { clear_github_token: true });
  });

  it("woo_helper_stripe_status masks anything secret-looking on the way out", async () => {
    get.mockResolvedValue({ mode: "live", webhook: { secret: "whsec_" + "a".repeat(30) } });
    const out = await tool("woo_helper_stripe_status").handler({ site: "a" });
    expect(out.content[0].text).not.toContain("whsec_");
  });
});
