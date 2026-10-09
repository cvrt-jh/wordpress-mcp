import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const get = vi.fn();
const post = vi.fn();
vi.mock("../client.js", () => ({ forSite: () => ({ get, post }) }));
import { register } from "./stripe.js";

type Handler = (args: Record<string, unknown>) => Promise<{ content: { text: string }[] }>;
function tool(name: string): { schema: z.ZodRawShape; handler: Handler } {
  let found: { schema: z.ZodRawShape; handler: Handler } | undefined;
  register({ tool: (n: string, _d: string, schema: z.ZodRawShape, handler: Handler) => { if (n === name) found = { schema, handler }; } } as never);
  if (!found) throw new Error(`tool ${name} is not registered`);
  return found;
}
const parse = (name: string, args: Record<string, unknown>) => z.object(tool(name).schema).safeParse(args).success;

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe("stripe tools", () => {
  it("writes refuse to run without confirm:true", () => {
    expect(parse("stripe_recreate_webhook", { site: "a" })).toBe(false);
    expect(parse("stripe_recreate_webhook", { site: "a", confirm: false })).toBe(false);
    expect(parse("stripe_recreate_webhook", { site: "a", confirm: true })).toBe(true);
    const pm = { site: "a", config_id: "pmc_1AbC", method: "klarna", enabled: true };
    expect(parse("stripe_set_payment_method", pm)).toBe(false);
    expect(parse("stripe_set_payment_method", { ...pm, confirm: true })).toBe(true);
  });

  it("stripe_set_payment_method rejects ids and methods that could reach other paths", () => {
    const base = { site: "a", method: "card", enabled: true, confirm: true };
    expect(parse("stripe_set_payment_method", { ...base, config_id: "../account" })).toBe(false);
    expect(parse("stripe_set_payment_method", { ...base, config_id: "pmc_1", method: "card[x]" })).toBe(false);
  });

  it("stripe_set_payment_method posts to the configuration", async () => {
    post.mockResolvedValue({ id: "pmc_1" });
    await tool("stripe_set_payment_method").handler({ site: "a", config_id: "pmc_1", method: "klarna", enabled: false, confirm: true });
    expect(post).toHaveBeenCalledWith("/mcp/v1/stripe/payment-method-configurations/pmc_1", { method: "klarna", enabled: false, confirm: true });
  });

  it("charges cap the limit at 100", () => {
    expect(parse("stripe_list_charges", { site: "a", limit: 101 })).toBe(false);
  });

  it("results are masked even if the site leaked something", async () => {
    get.mockResolvedValue({ mode: "live", settings: { secret_key: "sk_live_" + "Z".repeat(40) } });
    const out = await tool("stripe_get_settings").handler({ site: "a" });
    expect(out.content[0].text).not.toContain("sk_live_");
  });
});
