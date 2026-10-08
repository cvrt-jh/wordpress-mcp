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

import { register } from "./comments.js";

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

describe("wp_list_comments", () => {
  it("sends post as a list and the extra filters", async () => {
    get.mockResolvedValue([]);
    await call("wp_list_comments", { site: "a", post: [5], status: "hold", type: "comment", author_email: "x@example.com" });
    expect(get).toHaveBeenCalledWith("/wp/v2/comments", {
      per_page: 20,
      page: 1,
      post: "5",
      status: "hold",
      type: "comment",
      author_email: "x@example.com",
    });
  });
});

describe("wp_get_comment", () => {
  it("sends no password unless given", async () => {
    get.mockResolvedValue({ id: 1 });
    await call("wp_get_comment", { site: "a", id: 1 });
    expect(get).toHaveBeenLastCalledWith("/wp/v2/comments/1", {});
    await call("wp_get_comment", { site: "a", id: 1, password: "pw" });
    expect(get).toHaveBeenLastCalledWith("/wp/v2/comments/1", { password: "pw" });
  });
});

describe("wp_create_comment", () => {
  it("sends only the given fields (no parent default)", async () => {
    post.mockResolvedValue({ id: 1 });
    await call("wp_create_comment", { site: "a", post: 5, content: "hi", type: "note", status: "approve" });
    expect(post).toHaveBeenCalledWith("/wp/v2/comments", { post: 5, content: "hi", type: "note", status: "approve" });
  });
});

describe("wp_update_comment", () => {
  it("sends only the given fields and accepts unspam/untrash", async () => {
    put.mockResolvedValue({ id: 1 });
    await call("wp_update_comment", { site: "a", id: 1, status: "untrash" });
    expect(put).toHaveBeenCalledWith("/wp/v2/comments/1", { status: "untrash" });
  });
});

describe("wp_delete_comment", () => {
  it("trashes by default and reports it", async () => {
    del.mockResolvedValue({});
    expect(out(await call("wp_delete_comment", { site: "a", id: 1 }))).toEqual({ deleted: false, trashed: true, id: 1 });
    expect(del).toHaveBeenCalledWith("/wp/v2/comments/1", { force: 0 });
  });
});

describe("wp_moderate_comments", () => {
  it("PUTs the status once per id and reports failures per id", async () => {
    put.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("WordPress API error 404"));
    const r = out(await call("wp_moderate_comments", { site: "a", ids: [1, 2], status: "spam" }));
    expect(put).toHaveBeenCalledWith("/wp/v2/comments/1", { status: "spam" });
    expect(put).toHaveBeenCalledWith("/wp/v2/comments/2", { status: "spam" });
    expect(r.moderated).toEqual([
      { id: 1, success: true },
      { id: 2, success: false, error: "Error: WordPress API error 404" },
    ]);
  });
});
