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
import { register } from "./mcp-database.js";

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

describe("mcp_search_replace", () => {
  it("sends only the given fields (tables omitted = all tables)", async () => {
    post.mockResolvedValue({ total_changes: 0 });
    await tool("mcp_search_replace").handler({ site: "a", search: "http://old", replace: "https://new", dry_run: true });
    expect(post).toHaveBeenCalledWith("/mcp/v1/db/search-replace", {
      search: "http://old",
      replace: "https://new",
      dry_run: true,
    });
  });

  it("passes a table list and dry_run false through", async () => {
    post.mockResolvedValue({ total_changes: 3 });
    await tool("mcp_search_replace").handler({ site: "a", search: "a", replace: "b", tables: ["wp_posts"], dry_run: false });
    expect(post).toHaveBeenCalledWith("/mcp/v1/db/search-replace", {
      search: "a",
      replace: "b",
      tables: ["wp_posts"],
      dry_run: false,
    });
  });

  it("defaults dry_run to true at the schema", () => {
    const schema = z.object(tool("mcp_search_replace").schema);
    expect(schema.parse({ site: "a", search: "a", replace: "b" }).dry_run).toBe(true);
  });
});

describe("mcp_clean_revisions", () => {
  it("accepts keep 0 and rejects negative or fractional values", () => {
    const schema = z.object(tool("mcp_clean_revisions").schema);
    expect(schema.safeParse({ site: "a", keep: 0 }).success).toBe(true);
    expect(schema.safeParse({ site: "a", keep: -1 }).success).toBe(false);
    expect(schema.safeParse({ site: "a", keep: 1.5 }).success).toBe(false);
  });
});
