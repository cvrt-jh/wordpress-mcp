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

import { register } from "./site.js";

type Handler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;

function tool(name: string): { handler: Handler; schema: z.ZodObject<z.ZodRawShape> } {
  let found: { handler: Handler; schema: z.ZodObject<z.ZodRawShape> } | undefined;
  const server = {
    tool: (n: string, _d: string, s: z.ZodRawShape, handler: Handler) => {
      if (n === name) found = { handler, schema: z.object(s) };
    },
  };
  register(server as never);
  if (!found) throw new Error(`tool ${name} is not registered`);
  return found;
}

// Run a tool the way the MCP SDK does: parse args (applies defaults), then call.
const call = (name: string, args: Record<string, unknown>) => {
  const t = tool(name);
  return t.handler(t.schema.parse(args));
};
const out = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

beforeEach(() => {
  for (const f of [get, post, put, del]) f.mockReset();
});

describe("wp_update_settings", () => {
  it("sends timezone (the REST name), not timezone_string", async () => {
    post.mockResolvedValue({ title: "T", timezone: "Europe/Berlin" });
    const r = out(await call("wp_update_settings", { site: "a", timezone: "Europe/Berlin" }));
    expect(post).toHaveBeenCalledWith("/wp/v2/settings", { timezone: "Europe/Berlin" });
    expect(r.timezone).toBe("Europe/Berlin");
    expect(Object.keys(tool("wp_update_settings").schema.shape)).not.toContain("timezone_string");
  });

  it("sends only the given fields, falsy values included", async () => {
    post.mockResolvedValue({});
    await call("wp_update_settings", { site: "a", description: "", use_smilies: false, show_on_front: "page", page_on_front: 2 });
    expect(post).toHaveBeenCalledWith("/wp/v2/settings", {
      description: "",
      use_smilies: false,
      show_on_front: "page",
      page_on_front: 2,
    });
  });
});

describe("wp_get_settings", () => {
  it("returns the settings as WP names them (timezone, not the undefined timezone_string)", async () => {
    get.mockResolvedValue({ title: "T", timezone: "Europe/Berlin", show_on_front: "posts" });
    const r = out(await call("wp_get_settings", { site: "a" }));
    expect(r).toEqual({ title: "T", timezone: "Europe/Berlin", show_on_front: "posts" });
  });
});
