import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
const del = vi.fn();
vi.mock("../client.js", () => ({
  forSite: (id: string) => {
    if (id !== "a") throw new Error(`Unknown site "${id}"`);
    return { get, post, put, delete: del };
  },
}));
import { register, containsMask } from "./mcp-options.js";

type Handler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>;

function tool(name: string): { schema: z.ZodRawShape; handler: Handler } {
  let found: { schema: z.ZodRawShape; handler: Handler } | undefined;
  const server = {
    tool: (n: string, _d: string, schema: z.ZodRawShape, handler: Handler) => {
      if (n === name) found = { schema, handler };
    },
  };
  register(server as never);
  if (!found) throw new Error(`tool ${name} is not registered`);
  return found;
}

beforeEach(() => {
  for (const m of [get, post, put, del]) m.mockReset();
});

describe("mcp_set_option", () => {
  it("posts value and autoload to the option route", async () => {
    post.mockResolvedValue({ key: "blogname", value: "X", created: false });
    await tool("mcp_set_option").handler({ site: "a", key: "blogname", value: "X", autoload: false });
    expect(post).toHaveBeenCalledWith("/mcp/v1/options/blogname", { value: "X", autoload: false });
  });

  it("refuses to write the read mask back, also nested", async () => {
    const t = tool("mcp_set_option");
    await expect(t.handler({ site: "a", key: "my_api_key", value: "[masked]", autoload: true })).rejects.toThrow(/masked/);
    await expect(
      t.handler({ site: "a", key: "my_plugin", value: { url: "u", api_key: "[masked]" }, autoload: true })
    ).rejects.toThrow(/masked/);
    expect(post).not.toHaveBeenCalled();
  });

  it("refuses a missing value", async () => {
    await expect(tool("mcp_set_option").handler({ site: "a", key: "x", autoload: true })).rejects.toThrow(/value is required/);
    expect(post).not.toHaveBeenCalled();
  });

  it("allows falsy values like false, 0 and empty string", async () => {
    post.mockResolvedValue({});
    for (const value of [false, 0, ""]) {
      await tool("mcp_set_option").handler({ site: "a", key: "x", value, autoload: true });
    }
    expect(post).toHaveBeenCalledTimes(3);
  });

  it("rejects an option name the route cannot match", () => {
    const schema = z.object(tool("mcp_set_option").schema);
    expect(schema.safeParse({ site: "a", key: "a.b", value: 1 }).success).toBe(false);
    expect(schema.safeParse({ site: "a", key: "my_opt-1", value: 1 }).success).toBe(true);
  });
});

describe("containsMask", () => {
  it("finds the mask anywhere and nothing else", () => {
    expect(containsMask("[masked]")).toBe(true);
    expect(containsMask([1, ["[masked]"]])).toBe(true);
    expect(containsMask({ a: { b: "[masked]" } })).toBe(true);
    expect(containsMask("not [masked] exactly")).toBe(false);
    expect(containsMask({ a: null, b: 0, c: "x" })).toBe(false);
  });
});

describe("mcp_list_options", () => {
  it("sends prefix only when given", async () => {
    get.mockResolvedValue({ options: [], count: 0 });
    await tool("mcp_list_options").handler({ site: "a", per_page: 20 });
    expect(get).toHaveBeenLastCalledWith("/mcp/v1/options", { per_page: 20 });
    await tool("mcp_list_options").handler({ site: "a", per_page: 20, prefix: "woocommerce_" });
    expect(get).toHaveBeenLastCalledWith("/mcp/v1/options", { per_page: 20, prefix: "woocommerce_" });
  });
});
