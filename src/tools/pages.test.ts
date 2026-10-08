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

import { register } from "./pages.js";

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

describe("wp_list_pages", () => {
  it("sends parent as a list and page-only filters", async () => {
    get.mockResolvedValue([]);
    await call("wp_list_pages", { site: "a", parent: [0], menu_order: 2, status: ["any"] });
    expect(get).toHaveBeenCalledWith("/wp/v2/pages", {
      per_page: 20,
      page: 1,
      order: "asc",
      orderby: "menu_order",
      parent: "0",
      menu_order: 2,
      status: "any",
    });
  });
});

describe("wp_get_page", () => {
  it("reads in edit context and returns the raw content", async () => {
    get.mockResolvedValue({ id: 2, content: { raw: "<!-- wp:heading -->", rendered: "<h2></h2>" } });
    const r = out(await call("wp_get_page", { site: "a", id: 2, content: true }));
    expect(get).toHaveBeenCalledWith("/wp/v2/pages/2", { context: "edit" });
    expect(r.content).toBe("<!-- wp:heading -->");
  });
});

describe("wp_create_page", () => {
  it("sends only given fields plus the draft default (no parent/menu_order defaults)", async () => {
    post.mockResolvedValue({ id: 3 });
    await call("wp_create_page", { site: "a", title: "About", template: "page-wide.php", excerpt: "e" });
    expect(post).toHaveBeenCalledWith("/wp/v2/pages", { title: "About", status: "draft", template: "page-wide.php", excerpt: "e" });
  });

  it("has no post-only fields", () => {
    const keys = Object.keys(tool("wp_create_page").schema.shape);
    for (const k of ["sticky", "format", "categories", "tags"]) expect(keys).not.toContain(k);
  });
});

describe("wp_update_page", () => {
  it("sends only the given fields", async () => {
    put.mockResolvedValue({ id: 3 });
    await call("wp_update_page", { site: "a", id: 3, menu_order: 5, featured_media: 0 });
    expect(put).toHaveBeenCalledWith("/wp/v2/pages/3", { menu_order: 5, featured_media: 0 });
  });
});

describe("wp_delete_page", () => {
  it("trashes by default", async () => {
    del.mockResolvedValue({});
    expect(out(await call("wp_delete_page", { site: "a", id: 3 }))).toEqual({ deleted: false, trashed: true, id: 3 });
    expect(del).toHaveBeenCalledWith("/wp/v2/pages/3", { force: 0 });
  });
});
