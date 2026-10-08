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
import { register } from "./mcp-widgets.js";

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

beforeEach(() => {
  for (const m of [get, post, put, del]) m.mockReset();
});

describe("mcp_add_widget", () => {
  it("omits position when not given (server appends)", async () => {
    post.mockResolvedValue({ widget_id: "text-3", created: true });
    await tool("mcp_add_widget").handler({ site: "a", sidebar_id: "sidebar-1", widget_type: "text", settings: { title: "Hi" } });
    expect(post).toHaveBeenCalledWith("/mcp/v1/widgets", { sidebar_id: "sidebar-1", widget_type: "text", settings: { title: "Hi" } });
  });

  it("sends position 0 (falsy) when given", async () => {
    post.mockResolvedValue({});
    await tool("mcp_add_widget").handler({ site: "a", sidebar_id: "s", widget_type: "search", settings: {}, position: 0 });
    expect(post).toHaveBeenCalledWith("/mcp/v1/widgets", { sidebar_id: "s", widget_type: "search", settings: {}, position: 0 });
  });

  it("rejects a negative or fractional position at the schema", () => {
    const schema = z.object(tool("mcp_add_widget").schema);
    expect(schema.safeParse({ site: "a", sidebar_id: "s", widget_type: "t", position: -1 }).success).toBe(false);
    expect(schema.safeParse({ site: "a", sidebar_id: "s", widget_type: "t", position: 1.5 }).success).toBe(false);
  });
});

describe("mcp_move_widget", () => {
  it("sends only sidebar_id when no position is given", async () => {
    post.mockResolvedValue({ moved: true });
    await tool("mcp_move_widget").handler({ site: "a", widget_id: "text-2", sidebar_id: "footer" });
    expect(post).toHaveBeenCalledWith("/mcp/v1/widgets/text-2/move", { sidebar_id: "footer" });
  });

  it("sends the position when given", async () => {
    post.mockResolvedValue({ moved: true });
    await tool("mcp_move_widget").handler({ site: "a", widget_id: "text-2", sidebar_id: "footer", position: 2 });
    expect(post).toHaveBeenCalledWith("/mcp/v1/widgets/text-2/move", { sidebar_id: "footer", position: 2 });
  });
});

describe("mcp_update_widget", () => {
  it("PUTs the settings to merge", async () => {
    put.mockResolvedValue({ updated: true });
    await tool("mcp_update_widget").handler({ site: "a", widget_id: "text-2", settings: { title: "New" } });
    expect(put).toHaveBeenCalledWith("/mcp/v1/widgets/text-2", { settings: { title: "New" } });
  });
});
