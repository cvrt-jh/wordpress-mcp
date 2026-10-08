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

import { register } from "./users.js";

type Handler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;

function tool(name: string): { handler: Handler; schema: z.ZodObject<z.ZodRawShape> } {
  let found: { handler: Handler; schema: z.ZodObject<z.ZodRawShape> } | undefined;
  const server = {
    tool: (n: string, _d: string, s: z.ZodRawShape, handler: Handler) => {
      if (n === name) found = { handler, schema: z.object(s) };
    },
  };
  register(server as never);
  if (!found) throw new Error(`tool ${name} is not registered`);
  return found;
}

// Run a tool the way the MCP SDK does: parse args (applies defaults), then call.
const call = (name: string, args: Record<string, unknown>) => {
  const t = tool(name);
  return t.handler(t.schema.parse(args));
};
const out = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

beforeEach(() => {
  for (const f of [get, post, put, del]) f.mockReset();
});

describe("user reads use context=edit (email and roles are edit-only fields)", () => {
  it("wp_list_users", async () => {
    get.mockResolvedValue([{ id: 1, email: "x@example.com", roles: ["administrator"] }]);
    const r = out(await call("wp_list_users", { site: "a", roles: ["editor", "author"], who: "authors" }));
    expect(get).toHaveBeenCalledWith("/wp/v2/users", {
      per_page: 20,
      page: 1,
      orderby: "name",
      order: "asc",
      roles: "editor,author",
      who: "authors",
      context: "edit",
    });
    expect(r[0]).toMatchObject({ email: "x@example.com", roles: ["administrator"] });
  });

  it("wp_me and wp_get_user", async () => {
    get.mockResolvedValue({ id: 1 });
    await call("wp_me", { site: "a" });
    expect(get).toHaveBeenLastCalledWith("/wp/v2/users/me", { context: "edit" });
    await call("wp_get_user", { site: "a", id: 4 });
    expect(get).toHaveBeenLastCalledWith("/wp/v2/users/4", { context: "edit" });
  });
});

describe("wp_create_user", () => {
  it("sends the profile fields and never echoes the password", async () => {
    post.mockResolvedValue({ id: 9, name: "N" });
    const r = await call("wp_create_user", {
      site: "a",
      username: "u",
      email: "u@example.com",
      password: "pw-123456",
      first_name: "F",
      locale: "de_DE",
    });
    expect(post).toHaveBeenCalledWith("/wp/v2/users", {
      username: "u",
      email: "u@example.com",
      password: "pw-123456",
      first_name: "F",
      locale: "de_DE",
    });
    expect(r.content[0].text).not.toContain("pw-123456");
  });
});

describe("wp_update_user", () => {
  it("sends only the given fields and has no username", async () => {
    put.mockResolvedValue({ id: 9 });
    await call("wp_update_user", { site: "a", id: 9, nickname: "nick" });
    expect(put).toHaveBeenCalledWith("/wp/v2/users/9", { nickname: "nick" });
    expect(Object.keys(tool("wp_update_user").schema.shape)).not.toContain("username");
  });
});

describe("wp_delete_user", () => {
  it("forces and reassigns", async () => {
    del.mockResolvedValue({});
    await call("wp_delete_user", { site: "a", id: 9, reassign: 1 });
    expect(del).toHaveBeenCalledWith("/wp/v2/users/9", { reassign: 1, force: 1 });
  });
});
