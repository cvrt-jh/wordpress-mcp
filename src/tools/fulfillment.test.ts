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

import { register } from "./fulfillment.js";

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

describe("fulfillment tools", () => {
  beforeEach(() => {
    for (const m of [get, put, post, del]) m.mockReset();
  });

  it("registers one tool per mcp/fulfillment/v1/admin route and none for the removed update-apply", () => {
    expect([...tools().keys()].sort()).toEqual(
      [
        "fulfillment_fulfill_order",
        "fulfillment_get_settings",
        "fulfillment_queue",
        "fulfillment_reprint_job",
        "fulfillment_status",
        "fulfillment_update_check",
        "fulfillment_update_settings",
      ].sort(),
    );
  });

  it("fulfillment_update_settings POSTs only the keys given, including the Slack bot settings", async () => {
    post.mockResolvedValue({ slack_bot_token: { set: true } });

    const result = await tool("fulfillment_update_settings").handler({
      site: "a",
      slack_bot_token: "xoxb-1",
      slack_channel_id: "C0123",
    });

    expect(post).toHaveBeenCalledWith("/mcp/fulfillment/v1/admin/settings", {
      slack_bot_token: "xoxb-1",
      slack_channel_id: "C0123",
    });
    expect(JSON.parse(result.content[0].text)).toEqual({ slack_bot_token: { set: true } });
  });

  it("fulfillment_update_settings passes the __clear sentinel through to delete a secret", async () => {
    post.mockResolvedValue({});
    await tool("fulfillment_update_settings").handler({ site: "a", webhook_secret: "__clear" });
    expect(post).toHaveBeenCalledWith("/mcp/fulfillment/v1/admin/settings", { webhook_secret: "__clear" });
  });

  it("ids are integers", () => {
    expect(z.object(tool("fulfillment_reprint_job").schema).safeParse({ site: "a", job_id: 1.5 }).success).toBe(false);
    expect(z.object(tool("fulfillment_fulfill_order").schema).safeParse({ site: "a", order_id: 12 }).success).toBe(true);
    expect(
      z.object(tool("fulfillment_update_settings").schema).safeParse({ site: "a", clickup_assignee_id: 1.5 }).success,
    ).toBe(false);
  });

  it("job and order tools POST to their routes", async () => {
    post.mockResolvedValue({ ok: true });
    await tool("fulfillment_reprint_job").handler({ site: "a", job_id: 7 });
    expect(post).toHaveBeenLastCalledWith("/mcp/fulfillment/v1/admin/jobs/7/reprint", {});
    await tool("fulfillment_fulfill_order").handler({ site: "a", order_id: 42 });
    expect(post).toHaveBeenLastCalledWith("/mcp/fulfillment/v1/admin/orders/42/fulfill", {});
    await tool("fulfillment_update_check").handler({ site: "a" });
    expect(post).toHaveBeenLastCalledWith("/mcp/fulfillment/v1/admin/update-check", {});
  });

  it.each([
    ["fulfillment_get_settings", "/mcp/fulfillment/v1/admin/settings"],
    ["fulfillment_status", "/mcp/fulfillment/v1/admin/status"],
    ["fulfillment_queue", "/mcp/fulfillment/v1/admin/queue"],
  ])("%s reads %s", async (name, path) => {
    get.mockResolvedValue({ ok: true });
    await tool(name).handler({ site: "a" });
    expect(get).toHaveBeenCalledWith(path);
  });
});
