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

import { register, toQuery } from "./posts.js";

type Handler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>;

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

describe("toQuery", () => {
  it("drops undefined, joins arrays, stringifies booleans", () => {
    expect(toQuery({ a: undefined, b: [1, 2], c: true, d: false, e: "x", f: 3 })).toEqual({
      b: "1,2",
      c: "true",
      d: "false",
      e: "x",
      f: 3,
    });
  });
});

describe("wp_list_posts", () => {
  it("sends list filters as WP query params", async () => {
    get.mockResolvedValue([]);
    await call("wp_list_posts", {
      site: "a",
      status: ["draft", "publish"],
      categories: [3, 4],
      tags_exclude: [9],
      sticky: true,
      after: "2026-01-01T00:00:00",
      search_columns: ["post_title"],
    });
    expect(get).toHaveBeenCalledWith("/wp/v2/posts", {
      per_page: 10,
      page: 1,
      order: "desc",
      orderby: "date",
      status: "draft,publish",
      categories: "3,4",
      tags_exclude: "9",
      sticky: "true",
      after: "2026-01-01T00:00:00",
      search_columns: "post_title",
    });
  });
});

describe("wp_get_post", () => {
  it("reads in edit context and returns the raw content", async () => {
    get.mockResolvedValue({ id: 5, title: { rendered: "T" }, content: { raw: "<!-- wp:paragraph -->x", rendered: "<p>x</p>" } });
    const r = out(await call("wp_get_post", { site: "a", id: 5, content: true }));
    expect(get).toHaveBeenCalledWith("/wp/v2/posts/5", { context: "edit" });
    expect(r.content).toBe("<!-- wp:paragraph -->x");
  });

  it("leaves content out unless asked", async () => {
    get.mockResolvedValue({ id: 5, content: { raw: "x" } });
    const r = out(await call("wp_get_post", { site: "a", id: 5 }));
    expect(r.content).toBeUndefined();
  });
});

describe("wp_create_post", () => {
  it("sends the new writable fields and defaults status to draft", async () => {
    post.mockResolvedValue({ id: 1 });
    await call("wp_create_post", {
      site: "a",
      title: "Hi",
      sticky: true,
      format: "aside",
      date: "2026-12-01T10:00:00",
      comment_status: "closed",
      template: "single-wide.php",
      meta: { foo: 1 },
    });
    expect(post).toHaveBeenCalledWith("/wp/v2/posts", {
      title: "Hi",
      status: "draft",
      sticky: true,
      format: "aside",
      date: "2026-12-01T10:00:00",
      comment_status: "closed",
      template: "single-wide.php",
      meta: { foo: 1 },
    });
  });

  it("rejects the trash status (not writable)", () => {
    expect(() => tool("wp_create_post").schema.parse({ site: "a", title: "x", status: "trash" })).toThrow();
  });

  it("never echoes the post password", async () => {
    post.mockResolvedValue({ id: 1, password: "s3cret" });
    const r = await call("wp_create_post", { site: "a", title: "x", password: "s3cret" });
    expect(r.content[0].text).not.toContain("s3cret");
  });
});

describe("wp_update_post", () => {
  it("sends only the given fields", async () => {
    put.mockResolvedValue({ id: 7 });
    await call("wp_update_post", { site: "a", id: 7, slug: "new-slug" });
    expect(put).toHaveBeenCalledWith("/wp/v2/posts/7", { slug: "new-slug" });
  });
});

describe("wp_delete_post", () => {
  it("reports trashed vs deleted", async () => {
    del.mockResolvedValue({ id: 7, status: "trash" });
    expect(out(await call("wp_delete_post", { site: "a", id: 7 }))).toMatchObject({ deleted: false, trashed: true });
    expect(del).toHaveBeenCalledWith("/wp/v2/posts/7", { force: 0 });

    del.mockResolvedValue({ deleted: true, previous: { id: 7 } });
    expect(out(await call("wp_delete_post", { site: "a", id: 7, force: true }))).toMatchObject({ deleted: true, trashed: false });
    expect(del).toHaveBeenLastCalledWith("/wp/v2/posts/7", { force: 1 });
  });
});

describe("wp_search_posts", () => {
  it("passes search, per_page and page", async () => {
    get.mockResolvedValue([]);
    await call("wp_search_posts", { site: "a", search: "foo", page: 2 });
    expect(get).toHaveBeenCalledWith("/wp/v2/posts", { search: "foo", per_page: 10, page: 2 });
  });
});
