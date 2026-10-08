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

import { register } from "./mcp-users.js";

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

describe("mcp-users tools", () => {
  it("mcp_list_users sends only the given query params", async () => {
    await call("mcp_list_users", { site: "a" });
    expect(get).toHaveBeenCalledWith("/mcp/v1/users", {});

    await call("mcp_list_users", { site: "a", role: "editor", orderby: "email" });
    expect(get).toHaveBeenLastCalledWith("/mcp/v1/users", { role: "editor", orderby: "email" });
  });

  it("mcp_create_user omits unset optionals so server defaults apply", async () => {
    await call("mcp_create_user", { site: "a", username: "jo", email: "jo@example.com" });
    expect(post).toHaveBeenCalledWith("/mcp/v1/users", { username: "jo", email: "jo@example.com" });
  });

  it("mcp_create_user never echoes the password in an error", async () => {
    post.mockRejectedValue(new Error("WordPress API error 400: bad pass S3cret!x"));
    await expect(
      call("mcp_create_user", { site: "a", username: "jo", email: "jo@example.com", password: "S3cret!x" })
    ).rejects.toThrow("bad pass [redacted]");
    expect(post).toHaveBeenCalledWith("/mcp/v1/users", { username: "jo", email: "jo@example.com", password: "S3cret!x" });
  });

  it("mcp_update_user exposes display_name, description and url and sends only given fields", async () => {
    await call("mcp_update_user", { site: "a", id: 2, display_name: "Jo", url: "https://example.com" });
    expect(put).toHaveBeenCalledWith("/mcp/v1/users/2", { display_name: "Jo", url: "https://example.com" });

    await call("mcp_update_user", { site: "a", id: 2, description: "bio" });
    expect(put).toHaveBeenLastCalledWith("/mcp/v1/users/2", { description: "bio" });
  });

  it("mcp_update_user redacts the password from errors", async () => {
    put.mockRejectedValue(new Error("echo hunter22"));
    await expect(call("mcp_update_user", { site: "a", id: 2, password: "hunter22" })).rejects.toThrow("echo [redacted]");
  });

  it("mcp_delete_user sends reassign only when given", async () => {
    await call("mcp_delete_user", { site: "a", id: 5 });
    expect(del).toHaveBeenCalledWith("/mcp/v1/users/5", undefined);

    await call("mcp_delete_user", { site: "a", id: 5, reassign: 1 });
    expect(del).toHaveBeenLastCalledWith("/mcp/v1/users/5", { reassign: 1 });
  });

  it("mcp_change_user_role PUTs the role", async () => {
    await call("mcp_change_user_role", { site: "a", id: 5, role: "editor" });
    expect(put).toHaveBeenCalledWith("/mcp/v1/users/5/role", { role: "editor" });
  });
});
