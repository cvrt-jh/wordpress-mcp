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

import { register } from "./mcp-menus.js";

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

describe("mcp_update_menu_item", () => {
  beforeEach(() => put.mockReset());

  // The kdg.dj incident (2026-09-30): sending only position used to reset the
  // item. The plugin merges since 1.14.2; the tool must not send other keys.
  it("sends only the given field for a partial update", async () => {
    put.mockResolvedValue({ id: 5, updated: true, changed: ["position"] });

    const result = await tool("mcp_update_menu_item").handler({ site: "a", item_id: 5, position: 3 });

    expect(put).toHaveBeenCalledWith("/mcp/v1/menus/items/5", { position: 3 });
    expect(JSON.parse(result.content[0].text)).toEqual({ id: 5, updated: true, changed: ["position"] });
  });

  it("sends every field the endpoint accepts when all are given", async () => {
    put.mockResolvedValue({ updated: true });
    const fields = {
      title: "Kontakt",
      url: "https://example.com/kontakt/",
      parent: 0,
      position: 2,
      target: "_blank",
      classes: "btn highlight",
      xfn: "nofollow",
      attr_title: "Schreib uns",
      description: "Kontaktformular",
      status: "draft",
    };

    await tool("mcp_update_menu_item").handler({ site: "a", item_id: 9, ...fields });

    expect(put).toHaveBeenCalledWith("/mcp/v1/menus/items/9", fields);
  });

  it("passes empty strings and 0 through (clear target, move to top level)", async () => {
    put.mockResolvedValue({ updated: true });

    await tool("mcp_update_menu_item").handler({ site: "a", item_id: 9, target: "", parent: 0, classes: "" });

    expect(put).toHaveBeenCalledWith("/mcp/v1/menus/items/9", { target: "", parent: 0, classes: "" });
  });

  it("validates target and status against the endpoint's enums", () => {
    const schema = z.object(tool("mcp_update_menu_item").schema);
    expect(schema.safeParse({ site: "a", item_id: 1, target: "_self" }).success).toBe(false);
    expect(schema.safeParse({ site: "a", item_id: 1, status: "private" }).success).toBe(false);
    expect(schema.safeParse({ site: "a", item_id: 1, target: "_blank", status: "publish" }).success).toBe(true);
  });

  it("does not offer type/object/object_id, which the endpoint cannot change", () => {
    const keys = Object.keys(tool("mcp_update_menu_item").schema);
    expect(keys).not.toContain("object");
    expect(keys).not.toContain("object_id");
    expect(keys).not.toContain("type");
  });
});

describe("mcp_add_menu_item", () => {
  beforeEach(() => post.mockReset());

  it("sends only the given fields; the plugin applies its defaults", async () => {
    post.mockResolvedValue({ id: 11, menu_id: 3, created: true });

    await tool("mcp_add_menu_item").handler({ site: "a", menu_id: 3, title: "Blog", url: "https://example.com/blog/" });

    expect(post).toHaveBeenCalledWith("/mcp/v1/menus/3/items", { title: "Blog", url: "https://example.com/blog/" });
  });

  it("sends a page item with object_type, object and object_id", async () => {
    post.mockResolvedValue({ id: 12, menu_id: 3, created: true });

    await tool("mcp_add_menu_item").handler({
      site: "a",
      menu_id: 3,
      title: "",
      object_type: "post_type",
      object: "page",
      object_id: 42,
      parent: 11,
      position: 4,
    });

    expect(post).toHaveBeenCalledWith("/mcp/v1/menus/3/items", {
      title: "",
      object_type: "post_type",
      object: "page",
      object_id: 42,
      parent: 11,
      position: 4,
    });
  });
});

describe("other menu tools", () => {
  beforeEach(() => {
    put.mockReset();
    post.mockReset();
    del.mockReset();
  });

  it("mcp_update_menu PUTs only the name", async () => {
    put.mockResolvedValue({ id: 3, updated: true });
    await tool("mcp_update_menu").handler({ site: "a", id: 3, name: "Footer" });
    expect(put).toHaveBeenCalledWith("/mcp/v1/menus/3", { name: "Footer" });
  });

  it("mcp_update_menu refuses an empty name before calling the site", () => {
    const schema = z.object(tool("mcp_update_menu").schema);
    expect(schema.safeParse({ site: "a", id: 3, name: "" }).success).toBe(false);
  });

  it("mcp_assign_menu_location sends menu_id 0 to unassign", async () => {
    post.mockResolvedValue({ location: "footer", menu_id: 0, assigned: true });
    await tool("mcp_assign_menu_location").handler({ site: "a", menu_id: 0, location: "footer" });
    expect(post).toHaveBeenCalledWith("/mcp/v1/menus/locations/assign", { menu_id: 0, location: "footer" });
  });

  it("mcp_delete_menu_item returns the reparented children", async () => {
    del.mockResolvedValue({ id: 5, deleted: true, reparented: [6, 7] });
    const result = await tool("mcp_delete_menu_item").handler({ site: "a", item_id: 5 });
    expect(del).toHaveBeenCalledWith("/mcp/v1/menus/items/5");
    expect(JSON.parse(result.content[0].text).reparented).toEqual([6, 7]);
  });
});
