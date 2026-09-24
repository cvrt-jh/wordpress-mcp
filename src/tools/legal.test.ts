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

describe("legal consent log tools", () => {
  beforeEach(() => {
    get.mockReset();
    put.mockReset();
  });

  it("registers the three consent log tools", () => {
    const names = [...tools().keys()];
    expect(names).toContain("legal_consent_log_get");
    expect(names).toContain("legal_consent_log_stats");
    expect(names).toContain("legal_consent_log_export");
  });

  it("legal_consent_log_get reads by consent_id", async () => {
    const state = {
      consent_id: "11111111-1111-4111-8111-111111111111",
      rows: [
        {
          consent_id: "11111111-1111-4111-8111-111111111111",
          created_at: "2026-09-24 10:00:00",
          action: "accept_all",
          analytics: true,
          external: true,
          banner_version: "1",
          page_path: "/",
          ip_hash: "abc",
        },
      ],
    };
    get.mockResolvedValue(state);

    const result = await tool("legal_consent_log_get").handler({
      site: "a",
      consent_id: "11111111-1111-4111-8111-111111111111",
    });

    expect(get).toHaveBeenCalledWith("/mcp/legal/v1/consent/log", {
      consent_id: "11111111-1111-4111-8111-111111111111",
    });
    expect(JSON.parse(result.content[0].text)).toEqual(state);
  });

  it("legal_consent_log_get schema rejects a non-UUID consent_id", () => {
    const schema = z.object(tool("legal_consent_log_get").schema);

    expect(
      schema.safeParse({ site: "a", consent_id: "11111111-1111-4111-8111-111111111111" }).success,
    ).toBe(true);
    expect(schema.safeParse({ site: "a", consent_id: "not-a-uuid" }).success).toBe(false);
    expect(schema.safeParse({ site: "a" }).success).toBe(false);
  });

  it("legal_consent_log_stats reads with an optional from/to range", async () => {
    const state = { from: "2026-08-25", to: "2026-09-24", rows: [{ action: "accept_all", banner_version: "1", count: 5 }] };
    get.mockResolvedValue(state);

    const result = await tool("legal_consent_log_stats").handler({
      site: "a",
      from: "2026-08-25",
      to: "2026-09-24",
    });

    expect(get).toHaveBeenCalledWith("/mcp/legal/v1/consent/log/stats", {
      from: "2026-08-25",
      to: "2026-09-24",
    });
    expect(JSON.parse(result.content[0].text)).toEqual(state);
  });

  it("legal_consent_log_stats works with no range given", async () => {
    get.mockResolvedValue({ from: "2026-08-25", to: "2026-09-24", rows: [] });

    await tool("legal_consent_log_stats").handler({ site: "a" });

    expect(get).toHaveBeenCalledWith("/mcp/legal/v1/consent/log/stats", {});
  });

  it("legal_consent_log_stats schema rejects a from/to that is not YYYY-MM-DD", () => {
    const schema = z.object(tool("legal_consent_log_stats").schema);

    expect(schema.safeParse({ site: "a" }).success).toBe(true);
    expect(schema.safeParse({ site: "a", from: "2026-08-25", to: "2026-09-24" }).success).toBe(true);
    expect(schema.safeParse({ site: "a", from: "25-08-2026" }).success).toBe(false);
    expect(schema.safeParse({ site: "a", to: "2026/09/24" }).success).toBe(false);
  });

  it("legal_consent_log_export reads the csv text and filename with the same range rules", async () => {
    const state = { filename: "consent-log-2026-08-25-2026-09-24.csv", csv: "consent_id,created_at\n" };
    get.mockResolvedValue(state);

    const result = await tool("legal_consent_log_export").handler({
      site: "a",
      from: "2026-08-25",
      to: "2026-09-24",
    });

    expect(get).toHaveBeenCalledWith("/mcp/legal/v1/consent/log/export", {
      from: "2026-08-25",
      to: "2026-09-24",
    });
    expect(JSON.parse(result.content[0].text)).toEqual(state);
  });

  it("legal_consent_log_export schema rejects a malformed date", () => {
    const schema = z.object(tool("legal_consent_log_export").schema);

    expect(schema.safeParse({ site: "a", from: "2026-8-25" }).success).toBe(false);
  });

  it("legal_put_consent forwards log_enabled", async () => {
    put.mockResolvedValue({ saved: true });

    await tool("legal_put_consent").handler({ site: "a", enabled: true, log_enabled: true });

    expect(put).toHaveBeenCalledWith("/mcp/legal/v1/consent", { enabled: true, log_enabled: true });
  });

  it("legal_put_consent omits log_enabled when not given", async () => {
    put.mockResolvedValue({ saved: true });

    await tool("legal_put_consent").handler({ site: "a", enabled: true });

    expect(put).toHaveBeenCalledWith("/mcp/legal/v1/consent", { enabled: true });
  });
});
