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

import { register } from "./media.js";

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

describe("wp_list_media", () => {
  it("sends media_type and mime_type as lists", async () => {
    get.mockResolvedValue([]);
    await call("wp_list_media", { site: "a", media_type: ["image", "text"], mime_type: ["image/webp"], parent: [0] });
    expect(get).toHaveBeenCalledWith("/wp/v2/media", {
      per_page: 20,
      page: 1,
      order: "desc",
      orderby: "date",
      media_type: "image,text",
      mime_type: "image/webp",
      parent: "0",
    });
  });
});

describe("wp_update_media", () => {
  it("sends only the given fields, including the attachment post", async () => {
    put.mockResolvedValue({ id: 4 });
    await call("wp_update_media", { site: "a", id: 4, alt_text: "A", post: 12 });
    expect(put).toHaveBeenCalledWith("/wp/v2/media/4", { alt_text: "A", post: 12 });
  });
});

describe("wp_delete_media", () => {
  it("forces by default", async () => {
    del.mockResolvedValue({});
    await call("wp_delete_media", { site: "a", id: 4 });
    expect(del).toHaveBeenCalledWith("/wp/v2/media/4", { force: 1 });
  });
});
