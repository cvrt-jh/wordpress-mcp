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
import { register } from "./mcp-health.js";

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

describe("health tools", () => {
  it("mcp_run_cron posts only the hook", async () => {
    post.mockResolvedValue({ hook: "wp_version_check", executed: true });
    await tool("mcp_run_cron").handler({ site: "a", hook: "wp_version_check" });
    expect(post).toHaveBeenCalledWith("/mcp/v1/health/cron/run", { hook: "wp_version_check" });
  });

  it("mcp_get_cron_status passes event args through", async () => {
    get.mockResolvedValue({ events: [{ hook: "h", args: [1] }], total_events: 1 });
    const out = await tool("mcp_get_cron_status").handler({ site: "a" });
    expect(get).toHaveBeenCalledWith("/mcp/v1/health/cron");
    expect(JSON.parse(out.content[0].text).events[0].args).toEqual([1]);
  });

  it("mcp_run_action_scheduler sends only the set filters", async () => {
    post.mockResolvedValue({ processed: 1, failed: 0, remaining: 0 });
    await tool("mcp_run_action_scheduler").handler({ site: "a", hook: "woocommerce_deliver_webhook_async" });
    expect(post).toHaveBeenCalledWith("/mcp/v1/health/action-scheduler/run", { hook: "woocommerce_deliver_webhook_async" });
  });

  it("mcp_run_action_scheduler caps batch_size at 50", () => {
    const schema = z.object(tool("mcp_run_action_scheduler").schema);
    expect(schema.safeParse({ site: "a", batch_size: 51 }).success).toBe(false);
    expect(schema.safeParse({ site: "a", batch_size: 50 }).success).toBe(true);
  });

  it("mcp_scan_uploads and mcp_get_action_scheduler are plain GETs", async () => {
    get.mockResolvedValue({});
    await tool("mcp_scan_uploads").handler({ site: "a" });
    await tool("mcp_get_action_scheduler").handler({ site: "a" });
    expect(get.mock.calls).toEqual([["/mcp/v1/health/uploads-scan"], ["/mcp/v1/health/action-scheduler"]]);
  });

  it("mcp_get_audit_log passes the limit", async () => {
    get.mockResolvedValue({ count: 0, entries: [] });
    await tool("mcp_get_audit_log").handler({ site: "a", limit: 5 });
    expect(get).toHaveBeenCalledWith("/mcp/v1/health/audit", { limit: 5 });
  });
});
