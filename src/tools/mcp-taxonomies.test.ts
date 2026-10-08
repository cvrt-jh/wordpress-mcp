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

import { register } from "./mcp-taxonomies.js";

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

describe("mcp-taxonomies tools", () => {
  it("mcp_list_terms sends hide_empty as 1/0 only when given", async () => {
    await call("mcp_list_terms", { site: "a", taxonomy: "category" });
    expect(get).toHaveBeenCalledWith("/mcp/v1/taxonomies/category/terms", {});

    await call("mcp_list_terms", { site: "a", taxonomy: "category", hide_empty: false, parent: 0, search: "news" });
    expect(get).toHaveBeenLastCalledWith("/mcp/v1/taxonomies/category/terms", { hide_empty: 0, parent: 0, search: "news" });
  });

  it("mcp_create_term sends name plus only the given fields", async () => {
    await call("mcp_create_term", { site: "a", taxonomy: "product_cat", name: "Shoes" });
    expect(post).toHaveBeenCalledWith("/mcp/v1/taxonomies/product_cat/terms", { name: "Shoes" });
  });

  it("mcp_update_term is a partial update", async () => {
    await call("mcp_update_term", { site: "a", taxonomy: "category", id: 4, description: "d" });
    expect(put).toHaveBeenCalledWith("/mcp/v1/taxonomies/category/terms/4", { description: "d" });
  });

  it("mcp_assign_terms accepts IDs and slugs and omits append when not given", async () => {
    await call("mcp_assign_terms", { site: "a", post_id: 3, taxonomy: "post_tag", terms: [5, "news"] });
    expect(post).toHaveBeenCalledWith("/mcp/v1/taxonomies/assign", { post_id: 3, taxonomy: "post_tag", terms: [5, "news"] });

    await call("mcp_assign_terms", { site: "a", post_id: 3, taxonomy: "post_tag", terms: [], append: true });
    expect(post).toHaveBeenLastCalledWith("/mcp/v1/taxonomies/assign", { post_id: 3, taxonomy: "post_tag", terms: [], append: true });
  });
});
