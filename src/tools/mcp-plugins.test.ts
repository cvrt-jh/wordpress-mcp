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
import { register } from "./mcp-plugins.js";

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

describe("mcp_install_plugin_zip", () => {
  const url = "https://api.github.com/repos/o/r/releases/assets/1";

  it("sends the token for a private GitHub release asset", async () => {
    post.mockResolvedValue({ installed: true });
    await tool("mcp_install_plugin_zip").handler({ site: "a", url, activate: true, overwrite: false, token: "ghp_secret" });
    expect(post).toHaveBeenCalledWith("/mcp/v1/plugins/install-zip", {
      url,
      activate: true,
      overwrite: false,
      token: "ghp_secret",
    });
  });

  it("omits an absent or blank token so the site falls back to its stored one", async () => {
    post.mockResolvedValue({ installed: true });
    await tool("mcp_install_plugin_zip").handler({ site: "a", url, activate: false, overwrite: true });
    await tool("mcp_install_plugin_zip").handler({ site: "a", url, activate: false, overwrite: true, token: "  " });
    for (const call of post.mock.calls) expect(call[1]).not.toHaveProperty("token");
  });

  it("never echoes the token, also not in an error", async () => {
    post.mockResolvedValue({ installed: true, source: url });
    const ok = await tool("mcp_install_plugin_zip").handler({ site: "a", url, token: "ghp_secret" });
    expect(ok.content[0].text).not.toContain("ghp_secret");

    post.mockRejectedValue(new Error("WordPress API error 400: bad token ghp_secret"));
    const err = await tool("mcp_install_plugin_zip")
      .handler({ site: "a", url, token: "ghp_secret" })
      .catch((e: Error) => e);
    expect((err as Error).message).toBe("WordPress API error 400: bad token [redacted]");
  });

  it("passes other errors through unchanged", async () => {
    const boom = new Error("WordPress API error 500: x");
    post.mockRejectedValue(boom);
    await expect(tool("mcp_install_plugin_zip").handler({ site: "a", url })).rejects.toBe(boom);
  });
});

describe("mcp_search_plugins", () => {
  it("rejects a fractional per_page at the schema", () => {
    const schema = z.object(tool("mcp_search_plugins").schema);
    expect(schema.safeParse({ site: "a", search: "seo", per_page: 2.5 }).success).toBe(false);
    expect(schema.parse({ site: "a", search: "seo" }).per_page).toBe(10);
  });

  it("mcp_update_plugin sends refresh only when set", async () => {
    post.mockResolvedValue({ updated: true });
    await tool("mcp_update_plugin").handler({ site: "a", plugin: "x/x.php" });
    await tool("mcp_update_plugin").handler({ site: "a", plugin: "x/x.php", refresh: true });
    expect(post.mock.calls).toEqual([
      ["/mcp/v1/plugins/update", { plugin: "x/x.php" }],
      ["/mcp/v1/plugins/update", { plugin: "x/x.php", refresh: true }],
    ]);
  });

  it("mcp_check_plugin_updates posts the optional plugin", async () => {
    post.mockResolvedValue({ puc_checked: [], updates: [] });
    await tool("mcp_check_plugin_updates").handler({ site: "a" });
    await tool("mcp_check_plugin_updates").handler({ site: "a", plugin: "x/x.php" });
    expect(post.mock.calls).toEqual([
      ["/mcp/v1/plugins/check-updates", {}],
      ["/mcp/v1/plugins/check-updates", { plugin: "x/x.php" }],
    ]);
  });
});
