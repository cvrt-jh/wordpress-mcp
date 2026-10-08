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

import { register } from "./mcp-cpt.js";

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

// Parse like the MCP SDK does, then call the handler.
async function call(name: string, args: Record<string, unknown>) {
  const t = tool(name);
  return t.handler(z.object(t.schema).parse(args) as Record<string, unknown>);
}

beforeEach(() => {
  for (const f of [get, post, put, del]) {
    f.mockReset();
    f.mockResolvedValue({ ok: true });
  }
});

describe("mcp-cpt tools", () => {
  it("mcp_list_cpt_posts sends only the given query params (server defaults apply otherwise)", async () => {
    await call("mcp_list_cpt_posts", { site: "a", type: "product" });
    expect(get).toHaveBeenCalledWith("/mcp/v1/cpt/product/posts", {});

    await call("mcp_list_cpt_posts", { site: "a", type: "product", per_page: 5, orderby: "title", order: "ASC" });
    expect(get).toHaveBeenLastCalledWith("/mcp/v1/cpt/product/posts", { per_page: 5, orderby: "title", order: "ASC" });
  });

  it("mcp_list_cpt_posts rejects an orderby the endpoint cannot honor", () => {
    const schema = z.object(tool("mcp_list_cpt_posts").schema);
    expect(schema.safeParse({ site: "a", type: "post", orderby: "ID" }).success).toBe(false);
  });

  it("mcp_create_cpt_post sends title plus only the given optional fields", async () => {
    await call("mcp_create_cpt_post", { site: "a", type: "testimonial", title: "Hi" });
    expect(post).toHaveBeenCalledWith("/mcp/v1/cpt/testimonial/posts", { title: "Hi" });

    await call("mcp_create_cpt_post", { site: "a", type: "testimonial", title: "Hi", status: "publish", meta: { stars: 5 } });
    expect(post).toHaveBeenLastCalledWith("/mcp/v1/cpt/testimonial/posts", { title: "Hi", status: "publish", meta: { stars: 5 } });
  });

  it("mcp_create_cpt_post rejects an unknown status", () => {
    const schema = z.object(tool("mcp_create_cpt_post").schema);
    expect(schema.safeParse({ site: "a", type: "post", title: "x", status: "published" }).success).toBe(false);
  });

  it("mcp_update_cpt_post is a partial update", async () => {
    await call("mcp_update_cpt_post", { site: "a", type: "product", id: 9, status: "draft" });
    expect(put).toHaveBeenCalledWith("/mcp/v1/cpt/product/posts/9", { status: "draft" });
  });

  it("mcp_delete_cpt_post sends force only when given", async () => {
    await call("mcp_delete_cpt_post", { site: "a", type: "product", id: 9 });
    expect(del).toHaveBeenCalledWith("/mcp/v1/cpt/product/posts/9", undefined);

    await call("mcp_delete_cpt_post", { site: "a", type: "product", id: 9, force: true });
    expect(del).toHaveBeenLastCalledWith("/mcp/v1/cpt/product/posts/9", { force: 1 });
  });

  it("rejects a post type the route cannot match", () => {
    const schema = z.object(tool("mcp_get_post_type").schema);
    expect(schema.safeParse({ site: "a", type: "../users" }).success).toBe(false);
  });
});
