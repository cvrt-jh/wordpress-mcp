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
import { register } from "./mcp-themes.js";

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

describe("mcp_install_theme_zip", () => {
  it("sends url, activate, overwrite and no token (the endpoint has none)", async () => {
    post.mockResolvedValue({ installed: true });
    await tool("mcp_install_theme_zip").handler({ site: "a", url: "https://x.test/t.zip", activate: true, overwrite: false });
    expect(post).toHaveBeenCalledWith("/mcp/v1/themes/install-zip", {
      url: "https://x.test/t.zip",
      activate: true,
      overwrite: false,
    });
    expect(Object.keys(tool("mcp_install_theme_zip").schema)).not.toContain("token");
  });
});

describe("mcp_delete_theme", () => {
  it("sends the stylesheet as a DELETE query param", async () => {
    del.mockResolvedValue({ deleted: true });
    await tool("mcp_delete_theme").handler({ site: "a", stylesheet: "twentytwenty" });
    expect(del).toHaveBeenCalledWith("/mcp/v1/themes/delete", { stylesheet: "twentytwenty" });
  });
});

describe("mcp_search_themes", () => {
  it("rejects a fractional per_page at the schema", () => {
    const schema = z.object(tool("mcp_search_themes").schema);
    expect(schema.safeParse({ site: "a", search: "x", per_page: 1.5 }).success).toBe(false);
  });
});
