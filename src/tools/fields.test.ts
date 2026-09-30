import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// Every tool resolves its site through forSite; stub it so no env or network
// is needed and the exact REST call can be asserted.
const get = vi.fn();
const put = vi.fn();
const post = vi.fn();
const del = vi.fn();
vi.mock("../client.js", () => ({
  forSite: (id: string) => {
    if (id !== "a") throw new Error(`Unknown site "${id}"`);
    return { get, put, post, delete: del };
  },
}));

import { register } from "./fields.js";

type Handler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>;
interface Tool {
  schema: z.ZodRawShape;
  handler: Handler;
}

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

describe("fields tools", () => {
  beforeEach(() => {
    for (const m of [get, put, post, del]) m.mockReset();
  });

  it("registers one tool per mcp/fields/v1 endpoint", () => {
    expect([...tools().keys()].sort()).toEqual(
      [
        "fields_create_definition",
        "fields_delete_definition",
        "fields_get_definition",
        "fields_get_location_values",
        "fields_get_schema",
        "fields_get_settings",
        "fields_list_definitions",
        "fields_list_types",
        "fields_status",
        "fields_sync_definition",
        "fields_update_definition",
        "fields_update_settings",
      ].sort(),
    );
  });

  it.each([
    ["fields_status", "/mcp/fields/v1/status"],
    ["fields_get_settings", "/mcp/fields/v1/settings"],
    ["fields_list_types", "/mcp/fields/v1/types"],
    ["fields_get_location_values", "/mcp/fields/v1/location-values"],
  ])("%s reads %s", async (name, path) => {
    get.mockResolvedValue({ ok: true });
    const result = await tool(name).handler({ site: "a" });
    expect(get).toHaveBeenCalledWith(path);
    expect(JSON.parse(result.content[0].text)).toEqual({ ok: true });
  });

  it("fields_update_settings PUTs only the keys given", async () => {
    put.mockResolvedValue({ github_token: { set: true } });
    await tool("fields_update_settings").handler({ site: "a", github_token: "ghp_x" });
    expect(put).toHaveBeenCalledWith("/mcp/fields/v1/settings", { github_token: "ghp_x" });

    await tool("fields_update_settings").handler({ site: "a", clear_github_token: true });
    expect(put).toHaveBeenLastCalledWith("/mcp/fields/v1/settings", { clear_github_token: true });
  });

  it("definition tools build kind and key paths", async () => {
    get.mockResolvedValue({});
    put.mockResolvedValue({});
    post.mockResolvedValue({});
    del.mockResolvedValue({});
    const def = { key: "group_event", title: "Event" };

    await tool("fields_get_schema").handler({ site: "a", kind: "post-types" });
    expect(get).toHaveBeenLastCalledWith("/mcp/fields/v1/schemas/post-types");

    await tool("fields_list_definitions").handler({ site: "a", kind: "groups" });
    expect(get).toHaveBeenLastCalledWith("/mcp/fields/v1/groups");

    await tool("fields_get_definition").handler({ site: "a", kind: "groups", key: "group_event" });
    expect(get).toHaveBeenLastCalledWith("/mcp/fields/v1/groups/group_event");

    await tool("fields_create_definition").handler({ site: "a", kind: "groups", definition: def });
    expect(post).toHaveBeenLastCalledWith("/mcp/fields/v1/groups", def);

    await tool("fields_update_definition").handler({ site: "a", kind: "groups", key: "group_event", definition: def });
    expect(put).toHaveBeenLastCalledWith("/mcp/fields/v1/groups/group_event", def);

    await tool("fields_delete_definition").handler({ site: "a", kind: "taxonomies", key: "genre" });
    expect(del).toHaveBeenLastCalledWith("/mcp/fields/v1/taxonomies/genre");

    await tool("fields_sync_definition").handler({ site: "a", kind: "options-pages", key: "site_options" });
    expect(post).toHaveBeenLastCalledWith("/mcp/fields/v1/options-pages/site_options/sync", {});
  });

  it("rejects unknown kinds and keys that could escape the path", () => {
    const schema = z.object(tool("fields_get_definition").schema);
    expect(schema.safeParse({ site: "a", kind: "groups", key: "group_event" }).success).toBe(true);
    expect(schema.safeParse({ site: "a", kind: "users", key: "x" }).success).toBe(false);
    expect(schema.safeParse({ site: "a", kind: "groups", key: "../status" }).success).toBe(false);
    expect(schema.safeParse({ site: "a", kind: "groups", key: "Group" }).success).toBe(false);
  });

  it("surfaces a plugin error instead of swallowing it", async () => {
    put.mockRejectedValue(new Error("WordPress API error 409: cvrt_fields_json_shadowed"));
    await expect(
      tool("fields_update_definition").handler({ site: "a", kind: "groups", key: "g", definition: {} }),
    ).rejects.toThrow(/json_shadowed/);
  });
});
