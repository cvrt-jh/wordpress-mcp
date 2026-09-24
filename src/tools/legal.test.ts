import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// Every tool resolves its site through forSite; stub it so no env or network
// is needed and the exact REST call can be asserted.
const get = vi.fn();
const put = vi.fn();
vi.mock("../client.js", () => ({
  forSite: (id: string) => {
    if (id !== "a") throw new Error(`Unknown site "${id}"`);
    return { get, put, post: vi.fn(), delete: vi.fn() };
  },
}));

import { register } from "./legal.js";

type Handler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>;
interface Tool {
  schema: z.ZodRawShape;
  handler: Handler;
}

// Capture what register() hands to server.tool(name, description, schema, handler).
function tools(): Map<string, Tool> {
  const out = new Map<string, Tool>();
  const server = {
    tool: (name: string, _description: string, schema: z.ZodRawShape, handler: Handler) => {
      out.set(name, { schema, handler });
    },
  };
  register(server as never);
  return out;
}

function tool(name: string): Tool {
  const t = tools().get(name);
  if (!t) throw new Error(`tool ${name} is not registered`);
  return t;
}

describe("legal page tools", () => {
  beforeEach(() => {
    get.mockReset();
    put.mockReset();
  });

  it("registers legal_get_page and legal_link_page", () => {
    const names = [...tools().keys()];
    expect(names).toContain("legal_get_page");
    expect(names).toContain("legal_link_page");
  });

  it("legal_get_page reads the document's page link", async () => {
    const state = { linked: true, page_id: 42, status: "publish", ok: true };
    get.mockResolvedValue(state);

    const result = await tool("legal_get_page").handler({ site: "a", doc: "impressum" });

    expect(get).toHaveBeenCalledWith("/mcp/legal/v1/documents/impressum/page");
    expect(JSON.parse(result.content[0].text)).toEqual(state);
  });

  it("legal_link_page PUTs the page id and returns the plugin's answer", async () => {
    const state = { linked: true, page_id: 42, status: "publish", ok: true, mirrored: true, banner_linked: true };
    put.mockResolvedValue(state);

    const result = await tool("legal_link_page").handler({ site: "a", doc: "datenschutz", page_id: 42 });

    expect(put).toHaveBeenCalledWith("/mcp/legal/v1/documents/datenschutz/page", { page_id: 42 });
    expect(JSON.parse(result.content[0].text)).toEqual(state);
  });

  it("legal_link_page sends page_id 0 through, which unlinks", async () => {
    put.mockResolvedValue({ linked: false, page_id: 0, status: "missing", ok: false, mirrored: false });

    await tool("legal_link_page").handler({ site: "a", doc: "impressum", page_id: 0 });

    expect(put).toHaveBeenCalledWith("/mcp/legal/v1/documents/impressum/page", { page_id: 0 });
  });

  it("legal_link_page schema accepts only a non-negative integer page id", () => {
    const schema = z.object(tool("legal_link_page").schema);

    expect(schema.safeParse({ site: "a", doc: "impressum", page_id: 42 }).success).toBe(true);
    expect(schema.safeParse({ site: "a", doc: "impressum", page_id: 0 }).success).toBe(true);
    expect(schema.safeParse({ site: "a", doc: "impressum", page_id: -1 }).success).toBe(false);
    expect(schema.safeParse({ site: "a", doc: "impressum", page_id: 4.5 }).success).toBe(false);
    expect(schema.safeParse({ site: "a", doc: "impressum" }).success).toBe(false);
  });

  it("both page tools reject an unknown document type", () => {
    for (const name of ["legal_get_page", "legal_link_page"]) {
      const schema = z.object(tool(name).schema);
      expect(schema.safeParse({ site: "a", doc: "nope", page_id: 1 }).success).toBe(false);
    }
  });

  it("surfaces a plugin error instead of swallowing it", async () => {
    put.mockRejectedValue(new Error("WordPress API error 404: unknown_page"));

    await expect(
      tool("legal_link_page").handler({ site: "a", doc: "impressum", page_id: 999 }),
    ).rejects.toThrow(/unknown_page/);
  });
});
