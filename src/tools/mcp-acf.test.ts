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

import { register } from "./mcp-acf.js";

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

describe("mcp-acf tools", () => {
  it("acf_create_field_group sends only the given fields", async () => {
    await call("acf_create_field_group", { site: "a", title: "Hero", fields: [{ name: "headline" }] });
    expect(post).toHaveBeenCalledWith("/mcp/v1/acf/field-groups", { title: "Hero", fields: [{ name: "headline" }] });
  });

  it("acf_create_field_group drops field keys the endpoint ignores", async () => {
    await call("acf_create_field_group", {
      site: "a",
      title: "Hero",
      fields: [{ name: "headline", type: "text", bogus: 1 }],
      location: [[{ param: "post_type", operator: "==", value: "page" }]],
    });
    expect(post).toHaveBeenCalledWith("/mcp/v1/acf/field-groups", {
      title: "Hero",
      fields: [{ name: "headline", type: "text" }],
      location: [[{ param: "post_type", operator: "==", value: "page" }]],
    });
  });

  it("acf_update_field_group exposes the endpoint's extra group settings and is partial", async () => {
    await call("acf_update_field_group", { site: "a", key: "group_1", label_placement: "left", show_in_rest: false, menu_order: 3 });
    expect(put).toHaveBeenCalledWith("/mcp/v1/acf/field-groups/group_1", { label_placement: "left", show_in_rest: false, menu_order: 3 });

    await call("acf_update_field_group", { site: "a", key: "group_1", title: "New" });
    expect(put).toHaveBeenLastCalledWith("/mcp/v1/acf/field-groups/group_1", { title: "New" });
  });

  it("acf_update_field_group rejects invalid placements", () => {
    const schema = z.object(tool("acf_update_field_group").schema);
    expect(schema.safeParse({ site: "a", key: "group_1", instruction_placement: "top" }).success).toBe(false);
  });

  it("acf_get_post_fields sends format only when given", async () => {
    await call("acf_get_post_fields", { site: "a", post_id: 4 });
    expect(get).toHaveBeenCalledWith("/mcp/v1/acf/posts/4/fields", {});

    await call("acf_get_post_fields", { site: "a", post_id: 4, format: "raw" });
    expect(get).toHaveBeenLastCalledWith("/mcp/v1/acf/posts/4/fields", { format: "raw" });
  });

  it("acf_update_post_field sends null to clear, refuses a missing value", async () => {
    await call("acf_update_post_field", { site: "a", post_id: 4, field: "headline", value: null });
    expect(put).toHaveBeenCalledWith("/mcp/v1/acf/posts/4/fields/headline", { value: null });

    await expect(call("acf_update_post_field", { site: "a", post_id: 4, field: "headline" })).rejects.toThrow("value is required");
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("acf_import_field_groups wraps groups", async () => {
    await call("acf_import_field_groups", { site: "a", groups: [{ key: "group_1", title: "T", fields: [] }] });
    expect(post).toHaveBeenCalledWith("/mcp/v1/acf/import", { groups: [{ key: "group_1", title: "T", fields: [] }] });
  });
});
