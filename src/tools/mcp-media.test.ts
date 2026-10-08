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

import { register } from "./mcp-media.js";

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

describe("mcp-media tools", () => {
  it("mcp_list_media sends only the given query params", async () => {
    await call("mcp_list_media", { site: "a" });
    expect(get).toHaveBeenCalledWith("/mcp/v1/media", {});

    await call("mcp_list_media", { site: "a", mime_type: "image", page: 2 });
    expect(get).toHaveBeenLastCalledWith("/mcp/v1/media", { mime_type: "image", page: 2 });
  });

  it("mcp_sideload_media passes description through and omits unset fields", async () => {
    await call("mcp_sideload_media", { site: "a", url: "https://example.com/a.png", description: "d" });
    expect(post).toHaveBeenCalledWith("/mcp/v1/media/sideload", { url: "https://example.com/a.png", description: "d" });
  });

  it("mcp_update_media is a partial update", async () => {
    await call("mcp_update_media", { site: "a", id: 8, alt: "A dog" });
    expect(put).toHaveBeenCalledWith("/mcp/v1/media/8", { alt: "A dog" });
  });

  it("mcp_delete_media leaves force to the server default unless given", async () => {
    await call("mcp_delete_media", { site: "a", id: 8 });
    expect(del).toHaveBeenCalledWith("/mcp/v1/media/8", undefined);

    await call("mcp_delete_media", { site: "a", id: 8, force: false });
    expect(del).toHaveBeenLastCalledWith("/mcp/v1/media/8", { force: 0 });
  });

  it("mcp_bulk_delete_media sends ids and force only when given", async () => {
    await call("mcp_bulk_delete_media", { site: "a", ids: [1, 2] });
    expect(post).toHaveBeenCalledWith("/mcp/v1/media/bulk-delete", { ids: [1, 2] });
  });
});
