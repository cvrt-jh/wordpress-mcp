import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const put = vi.fn();
vi.mock("../client.js", () => ({
  forSite: (id: string) => {
    if (id !== "a") throw new Error(`Unknown site "${id}"`);
    return { get: vi.fn(), post: vi.fn(), put, delete: vi.fn() };
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
