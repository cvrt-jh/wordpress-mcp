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

import { register } from "./taxonomies.js";

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

describe("wp_list_categories", () => {
  it("sends filters, hide_empty=false included", async () => {
    get.mockResolvedValue([]);
    await call("wp_list_categories", { site: "a", parent: 0, include: [1, 2], orderby: "count", order: "desc" });
    expect(get).toHaveBeenCalledWith("/wp/v2/categories", {
      per_page: 100,
      hide_empty: "false",
      parent: 0,
      include: "1,2",
      orderby: "count",
      order: "desc",
    });
  });
});

describe("wp_list_tags", () => {
  it("has offset and no parent", async () => {
    get.mockResolvedValue([]);
    await call("wp_list_tags", { site: "a", offset: 10, post: 5 });
    expect(get).toHaveBeenCalledWith("/wp/v2/tags", { per_page: 100, hide_empty: "false", offset: 10, post: 5 });
    expect(Object.keys(tool("wp_list_tags").schema.shape)).not.toContain("parent");
  });
});

describe("term create/update", () => {
  it("wp_create_category no longer sends a parent default", async () => {
    post.mockResolvedValue({ id: 1 });
    await call("wp_create_category", { site: "a", name: "News" });
    expect(post).toHaveBeenCalledWith("/wp/v2/categories", { name: "News" });
  });

  it("wp_update_category and wp_update_tag send only the given fields", async () => {
    put.mockResolvedValue({ id: 1 });
    await call("wp_update_category", { site: "a", id: 1, slug: "n" });
    expect(put).toHaveBeenLastCalledWith("/wp/v2/categories/1", { slug: "n" });
    await call("wp_update_tag", { site: "a", id: 2, meta: { k: "v" } });
    expect(put).toHaveBeenLastCalledWith("/wp/v2/tags/2", { meta: { k: "v" } });
  });

  it("wp_create_tag sends meta", async () => {
    post.mockResolvedValue({ id: 3 });
    await call("wp_create_tag", { site: "a", name: "t", meta: { k: 1 } });
    expect(post).toHaveBeenCalledWith("/wp/v2/tags", { name: "t", meta: { k: 1 } });
  });
});

describe("term delete", () => {
  it("always forces (terms cannot be trashed)", async () => {
    del.mockResolvedValue({});
    await call("wp_delete_category", { site: "a", id: 1 });
    expect(del).toHaveBeenLastCalledWith("/wp/v2/categories/1", { force: 1 });
    await call("wp_delete_tag", { site: "a", id: 2 });
    expect(del).toHaveBeenLastCalledWith("/wp/v2/tags/2", { force: 1 });
  });
});
