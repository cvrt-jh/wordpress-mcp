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
import { register } from "./mcp-core.js";

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

describe("core tools", () => {
  it("mcp_get_version reads /core/version with no params", async () => {
    get.mockResolvedValue({ wordpress_version: "6.8", multisite: false });
    const out = await tool("mcp_get_version").handler({ site: "a" });
    expect(get).toHaveBeenCalledWith("/mcp/v1/core/version");
    expect(JSON.parse(out.content[0].text).multisite).toBe(false);
  });

  it("mcp_update_core posts an empty body and passes the up-to-date message through", async () => {
    post.mockResolvedValue({ updated: false, message: "WordPress is already up to date" });
    const out = await tool("mcp_update_core").handler({ site: "a" });
    expect(post).toHaveBeenCalledWith("/mcp/v1/core/update", {});
    expect(JSON.parse(out.content[0].text).message).toMatch(/up to date/);
  });
});
