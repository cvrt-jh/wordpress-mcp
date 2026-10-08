import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const put = vi.fn();
const get = vi.fn();
vi.mock("../client.js", () => ({
  forSite: (id: string) => {
    if (id !== "a") throw new Error(`Unknown site "${id}"`);
    return { get, post: vi.fn(), put, delete: vi.fn() };
  },
}));

import { register } from "./mcp-elementor.js";

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

describe("mcp_update_elementor_element", () => {
  beforeEach(() => put.mockReset());

  it("merges settings by default and sends nothing else", async () => {
    put.mockResolvedValue({ updated: true });

    await tool("mcp_update_elementor_element").handler({ site: "a", id: 77, element_id: "abc123", settings: { title: "x" } });

    expect(put).toHaveBeenCalledWith("/mcp/v1/elementor/posts/77/elements/abc123", { settings: { title: "x" } });
  });

  // cvrt-mcp-endpoints 1.13.0 can replace a widget in place; the tool could not
  // reach it, so a placeholder could not become a V3 html widget through MCP.
  it("passes widget_type and settings_mode through to the endpoint", async () => {
    put.mockResolvedValue({ updated: true });

    await tool("mcp_update_elementor_element").handler({
      site: "a",
      id: 77,
      element_id: "abc123",
      settings: { html: "<b>x</b>" },
      widget_type: "html",
      settings_mode: "replace",
    });

    expect(put).toHaveBeenCalledWith("/mcp/v1/elementor/posts/77/elements/abc123", {
      settings: { html: "<b>x</b>" },
      widget_type: "html",
      settings_mode: "replace",
    });
  });

  it("rejects an unknown settings_mode at the schema", () => {
    const schema = z.object(tool("mcp_update_elementor_element").schema);
    const bad = schema.safeParse({ site: "a", id: 1, element_id: "a", settings: {}, settings_mode: "overwrite" });
    expect(bad.success).toBe(false);
  });
});

describe("mcp_update_elementor_element without settings", () => {
  beforeEach(() => put.mockReset());

  // The endpoint accepts widget_type alone (settings then default to []).
  it("sends widget_type alone when no settings are given", async () => {
    put.mockResolvedValue({ updated: true });
    await tool("mcp_update_elementor_element").handler({ site: "a", id: 7, element_id: "abc123", widget_type: "html" });
    expect(put).toHaveBeenCalledWith("/mcp/v1/elementor/posts/7/elements/abc123", { widget_type: "html" });
  });

  it("refuses a call with neither settings nor widget_type before any request", async () => {
    await expect(tool("mcp_update_elementor_element").handler({ site: "a", id: 7, element_id: "abc123" })).rejects.toThrow(
      "give settings, widget_type, or both"
    );
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects a non-hex element id the route cannot match", () => {
    const schema = z.object(tool("mcp_get_elementor_element").schema);
    expect(schema.safeParse({ site: "a", id: 1, element_id: "abc/../x" }).success).toBe(false);
    expect(schema.safeParse({ site: "a", id: 1, element_id: "1a2b3c4" }).success).toBe(true);
  });
});

describe("elementor read tools send only the given filters", () => {
  beforeEach(() => {
    get.mockReset();
    get.mockResolvedValue({});
  });

  it("mcp_get_elementor_flat omits empty filters", async () => {
    await tool("mcp_get_elementor_flat").handler({ site: "a", id: 3, widget_type: "", el_type: "widget" });
    expect(get).toHaveBeenCalledWith("/mcp/v1/elementor/posts/3/flat", { el_type: "widget" });
  });

  it("mcp_search_elementor sends post_type and per_page only when given", async () => {
    await tool("mcp_search_elementor").handler({ site: "a", contains: "Kontakt" });
    expect(get).toHaveBeenCalledWith("/mcp/v1/elementor/search", { contains: "Kontakt" });

    await tool("mcp_search_elementor").handler({ site: "a", post_type: "page", per_page: 200 });
    expect(get).toHaveBeenLastCalledWith("/mcp/v1/elementor/search", { post_type: "page", per_page: 200 });
  });

  it("mcp_search_elementor caps per_page at the endpoint's 200", () => {
    const schema = z.object(tool("mcp_search_elementor").schema);
    expect(schema.safeParse({ site: "a", per_page: 201 }).success).toBe(false);
  });

  it("mcp_list_elementor_templates sends type only when given", async () => {
    await tool("mcp_list_elementor_templates").handler({ site: "a" });
    expect(get).toHaveBeenCalledWith("/mcp/v1/elementor/templates", {});
  });
});
