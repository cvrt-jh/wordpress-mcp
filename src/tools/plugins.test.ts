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

import { register } from "./plugins.js";

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

describe("wp_list_plugins", () => {
  it("sends status as a list and search", async () => {
    get.mockResolvedValue([]);
    await call("wp_list_plugins", { site: "a", status: ["active", "network-active"], search: "seo" });
    expect(get).toHaveBeenCalledWith("/wp/v2/plugins", { status: "active,network-active", search: "seo" });
  });
});

describe("wp_get_plugin", () => {
  it("strips .php for the core route", async () => {
    get.mockResolvedValue({ plugin: "akismet/akismet" });
    await call("wp_get_plugin", { site: "a", plugin: "akismet/akismet.php" });
    expect(get).toHaveBeenCalledWith("/wp/v2/plugins/akismet/akismet");
  });
});
