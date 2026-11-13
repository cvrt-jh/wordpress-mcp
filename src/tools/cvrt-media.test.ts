import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// Every tool resolves its site through forSite; stub it so no env or network
// is needed and the exact REST call can be asserted.
const get = vi.fn();
const post = vi.fn();
vi.mock("../client.js", () => ({
  forSite: (id: string) => {
    if (id !== "a") throw new Error(`Unknown site "${id}"`);
    return { get, post };
  },
}));

import { register } from "./cvrt-media.js";

type Handler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>;
interface Tool {
  description: string;
  schema: z.ZodRawShape;
  handler: Handler;
}

function tools(): Map<string, Tool> {
  const out = new Map<string, Tool>();
  const server = {
    tool: (name: string, description: string, schema: z.ZodRawShape, handler: Handler) => {
      out.set(name, { description, schema, handler });
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

const NS = "/mcp/media/v1";

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  get.mockResolvedValue({ ok: true });
  post.mockResolvedValue({ ok: true });
});

describe("cvrt-media tools: registration", () => {
  it("registers exactly the 21 tools, each with a site argument", () => {
    const all = tools();
    expect([...all.keys()].sort()).toEqual(
      [
        "media_get_status",
        "media_get_settings",
        "media_update_settings",
        "media_get_stats",
        "media_list_attachments",
        "media_get_attachment",
        "media_optimize_attachment",
        "media_restore_attachment",
        "media_reoptimize_attachment",
        "media_undo_replace",
        "media_get_bulk",
        "media_bulk_action",
        "media_bulk_step",
        "media_bulk_restore",
        "media_get_backups",
        "media_cleanup_backups",
        "media_eio_dry_run",
        "media_eio_run",
        "media_eio_cleanup",
        "media_svg_backfill",
        "media_scan_urls",
      ].sort()
    );
    for (const [name, t] of all) expect(t.schema.site, `${name} site`).toBeDefined();
  });

  it("does not collide with the existing mcp_*_media tools", () => {
    for (const name of tools().keys()) expect(name.startsWith("mcp_")).toBe(false);
  });
});

describe("cvrt-media tools: read routes", () => {
  const reads: [string, string, Record<string, unknown>?][] = [
    ["media_get_status", `${NS}/status`],
    ["media_get_settings", `${NS}/settings`],
    ["media_get_stats", `${NS}/stats`],
    ["media_get_attachment", `${NS}/attachments/42`, { id: 42 }],
    ["media_get_bulk", `${NS}/bulk`],
    ["media_get_backups", `${NS}/backups`],
    ["media_eio_dry_run", `${NS}/migration/eio`],
  ];
  for (const [name, path, args] of reads) {
    it(`${name} GETs ${path}`, async () => {
      await tool(name).handler({ site: "a", ...args });
      expect(get).toHaveBeenCalledWith(path);
      expect(post).not.toHaveBeenCalled();
    });
  }

  it("media_list_attachments passes only the given query args", async () => {
    await tool("media_list_attachments").handler({ site: "a", page: 2, per_page: 50, status: "failed" });
    expect(get).toHaveBeenCalledWith(`${NS}/attachments`, { page: 2, per_page: 50, status: "failed" });
    get.mockClear();
    await tool("media_list_attachments").handler({ site: "a" });
    expect(get).toHaveBeenCalledWith(`${NS}/attachments`, {});
  });

  it("media_scan_urls passes limit", async () => {
    await tool("media_scan_urls").handler({ site: "a", limit: 300 });
    expect(get).toHaveBeenCalledWith(`${NS}/scan`, { limit: 300 });
  });

  it("an unknown site is refused", async () => {
    await expect(tool("media_get_status").handler({ site: "zz" })).rejects.toThrow(/Unknown site/);
  });
});

describe("cvrt-media tools: attachment actions", () => {
  const actions: [string, string][] = [
    ["media_optimize_attachment", "optimize"],
    ["media_reoptimize_attachment", "reoptimize"],
    ["media_undo_replace", "replace/undo"],
  ];
  for (const [name, suffix] of actions) {
    it(`${name} POSTs /attachments/{id}/${suffix}`, async () => {
      await tool(name).handler({ site: "a", id: 7 });
      expect(post).toHaveBeenCalledWith(`${NS}/attachments/7/${suffix}`, {});
    });
  }

  it("media_restore_attachment sends force only when given", async () => {
    await tool("media_restore_attachment").handler({ site: "a", id: 7 });
    expect(post).toHaveBeenLastCalledWith(`${NS}/attachments/7/restore`, {});
    await tool("media_restore_attachment").handler({ site: "a", id: 7, force: true });
    expect(post).toHaveBeenLastCalledWith(`${NS}/attachments/7/restore`, { force: true });
  });

  it("the attachment id must be a positive integer", () => {
    const id = tool("media_get_attachment").schema.id as z.ZodTypeAny;
    expect(id.safeParse(0).success).toBe(false);
    expect(id.safeParse(1.5).success).toBe(false);
    expect(id.safeParse(3).success).toBe(true);
  });

  it("there is no replace tool (file upload stays in WP-CLI)", () => {
    expect([...tools().keys()].filter((n) => n.includes("replace") && n !== "media_undo_replace")).toEqual([]);
  });
});

describe("cvrt-media tools: bulk", () => {
  it("media_bulk_action start sends type and include_restored", async () => {
    await tool("media_bulk_action").handler({ site: "a", action: "start", type: "reoptimize", include_restored: true });
    expect(post).toHaveBeenCalledWith(`${NS}/bulk/start`, { type: "reoptimize", include_restored: true });
  });

  for (const action of ["pause", "resume", "cancel", "retry"]) {
    it(`media_bulk_action ${action} POSTs /bulk/${action} with no body fields`, async () => {
      await tool("media_bulk_action").handler({ site: "a", action, type: "reoptimize", include_restored: true });
      expect(post).toHaveBeenCalledWith(`${NS}/bulk/${action}`, {});
    });
  }

  it("media_bulk_action refuses an unknown action", () => {
    const action = tool("media_bulk_action").schema.action as z.ZodTypeAny;
    expect(action.safeParse("start").success).toBe(true);
    expect(action.safeParse("delete").success).toBe(false);
  });

  it("media_bulk_step POSTs /bulk/step", async () => {
    await tool("media_bulk_step").handler({ site: "a" });
    expect(post).toHaveBeenCalledWith(`${NS}/bulk/step`, {});
  });
});

describe("cvrt-media tools: confirm-gated destructive tools", () => {
  const gated: [string, string, Record<string, unknown>, Record<string, unknown>][] = [
    ["media_bulk_restore", `${NS}/bulk/restore`, {}, {}],
    ["media_eio_run", `${NS}/migration/eio/run`, { limit: 100 }, { limit: 100 }],
    ["media_eio_cleanup", `${NS}/migration/eio/cleanup`, {}, {}],
  ];
  for (const [name, path, args, extra] of gated) {
    it(`${name} sends confirm: true only when the caller passed true`, async () => {
      await tool(name).handler({ site: "a", ...args, confirm: true });
      expect(post).toHaveBeenLastCalledWith(path, { ...extra, confirm: true });

      await tool(name).handler({ site: "a", ...args, confirm: false });
      expect(post).toHaveBeenLastCalledWith(path, extra);

      await tool(name).handler({ site: "a", ...args });
      expect(post).toHaveBeenLastCalledWith(path, extra);
    });

    it(`${name} describes its consequence and the confirm flag`, () => {
      const d = tool(name).description;
      expect(d).toMatch(/confirm/);
      expect(d).toMatch(/true/);
    });
  }

  it("media_bulk_restore says it replaces optimized files with the originals", () => {
    expect(tool("media_bulk_restore").description).toMatch(/original/i);
  });

  it("media_eio_run limit is bounded to 500", () => {
    const limit = tool("media_eio_run").schema.limit as z.ZodTypeAny;
    expect(limit.safeParse(500).success).toBe(true);
    expect(limit.safeParse(501).success).toBe(false);
    expect(limit.safeParse(0).success).toBe(false);
  });
});

describe("cvrt-media tools: media_cleanup_backups", () => {
  const call = (args: Record<string, unknown>) => tool("media_cleanup_backups").handler({ site: "a", ...args });

  it("sends each single scope", async () => {
    await call({ older_than_days: 30 });
    expect(post).toHaveBeenLastCalledWith(`${NS}/backups/cleanup`, { older_than_days: 30 });
    await call({ ids: [1, 2] });
    expect(post).toHaveBeenLastCalledWith(`${NS}/backups/cleanup`, { ids: [1, 2] });
    await call({ all: true });
    expect(post).toHaveBeenLastCalledWith(`${NS}/backups/cleanup`, { all: true });
  });

  it("accepts older_than_days 0 as a scope", async () => {
    await call({ older_than_days: 0 });
    expect(post).toHaveBeenLastCalledWith(`${NS}/backups/cleanup`, { older_than_days: 0 });
  });

  it("refuses no scope, and sends nothing", async () => {
    await expect(call({})).rejects.toThrow(/exactly one/);
    await expect(call({ all: false })).rejects.toThrow(/exactly one/);
    expect(post).not.toHaveBeenCalled();
  });

  it("refuses two scopes, and sends nothing", async () => {
    await expect(call({ older_than_days: 30, all: true })).rejects.toThrow(/exactly one/);
    await expect(call({ ids: [1], all: true })).rejects.toThrow(/exactly one/);
    await expect(call({ ids: [1], older_than_days: 3 })).rejects.toThrow(/exactly one/);
    expect(post).not.toHaveBeenCalled();
  });

  it("refuses an empty ids list as no scope", async () => {
    await expect(call({ ids: [] })).rejects.toThrow(/exactly one/);
    expect(post).not.toHaveBeenCalled();
  });

  it("treats an empty ids list next to older_than_days as that one scope and does not send ids", async () => {
    await call({ ids: [], older_than_days: 30 });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenLastCalledWith(`${NS}/backups/cleanup`, { older_than_days: 30 });
  });

  it("bounds ids to 500 and days to 3650", () => {
    const { ids, older_than_days } = tool("media_cleanup_backups").schema as Record<string, z.ZodTypeAny>;
    expect(ids.safeParse(Array.from({ length: 500 }, (_, i) => i + 1)).success).toBe(true);
    expect(ids.safeParse(Array.from({ length: 501 }, (_, i) => i + 1)).success).toBe(false);
    expect(ids.safeParse([0]).success).toBe(false);
    expect(older_than_days.safeParse(3650).success).toBe(true);
    expect(older_than_days.safeParse(3651).success).toBe(false);
    expect(older_than_days.safeParse(-1).success).toBe(false);
  });

  it("warns that cleaned originals cannot be restored and names the result shape", () => {
    const d = tool("media_cleanup_backups").description;
    expect(d).toMatch(/can no longer be restored/);
    expect(d).toMatch(/exactly one/);
    expect(d).toMatch(/deleted, bytes, remaining, skipped/);
  });
});

describe("cvrt-media tools: bounds mirror the REST class", () => {
  it("per_page <= 100, page >= 1", () => {
    const { per_page, page } = tool("media_list_attachments").schema as Record<string, z.ZodTypeAny>;
    expect(per_page.safeParse(100).success).toBe(true);
    expect(per_page.safeParse(101).success).toBe(false);
    expect(per_page.safeParse(0).success).toBe(false);
    expect(page.safeParse(0).success).toBe(false);
  });

  it("status is one of the plugin's list statuses", () => {
    const status = tool("media_list_attachments").schema.status as z.ZodTypeAny;
    for (const s of ["optimized", "no-gain", "skipped", "restored", "failed", "pending"]) {
      expect(status.safeParse(s).success).toBe(true);
    }
    expect(status.safeParse("done").success).toBe(false);
  });

  it("scan limit <= 5000, svg backfill limit <= 500", () => {
    const scan = tool("media_scan_urls").schema.limit as z.ZodTypeAny;
    expect(scan.safeParse(5000).success).toBe(true);
    expect(scan.safeParse(5001).success).toBe(false);
    const svg = tool("media_svg_backfill").schema.limit as z.ZodTypeAny;
    expect(svg.safeParse(500).success).toBe(true);
    expect(svg.safeParse(501).success).toBe(false);
  });

  it("media_svg_backfill POSTs /svg/backfill with limit", async () => {
    await tool("media_svg_backfill").handler({ site: "a", limit: 50 });
    expect(post).toHaveBeenCalledWith(`${NS}/svg/backfill`, { limit: 50 });
  });
});

describe("cvrt-media tools: media_update_settings", () => {
  it("sends only the given keys, to POST /settings", async () => {
    await tool("media_update_settings").handler({ site: "a", quality_webp: 70, output_format: "webp" });
    expect(post).toHaveBeenCalledWith(`${NS}/settings`, { quality_webp: 70, output_format: "webp" });
  });

  it("passes github_token and clear_github_token through", async () => {
    await tool("media_update_settings").handler({ site: "a", github_token: "ghp_x", clear_github_token: false });
    expect(post).toHaveBeenCalledWith(`${NS}/settings`, { github_token: "ghp_x", clear_github_token: false });
    await tool("media_update_settings").handler({ site: "a", clear_github_token: true });
    expect(post).toHaveBeenLastCalledWith(`${NS}/settings`, { clear_github_token: true });
  });

  it("describes the write-only token, the blank rule and the explicit clear", () => {
    const d = tool("media_update_settings").description;
    expect(d).toMatch(/write-only/);
    expect(d).toMatch(/blank/);
    expect(d).toMatch(/clear_github_token/);
  });

  it("bounds mirror the settings validator", () => {
    const s = tool("media_update_settings").schema as Record<string, z.ZodTypeAny>;
    expect(s.quality_webp.safeParse(100).success).toBe(true);
    expect(s.quality_webp.safeParse(101).success).toBe(false);
    expect(s.quality_webp.safeParse(0).success).toBe(false);
    expect(s.webp_method.safeParse(6).success).toBe(true);
    expect(s.webp_method.safeParse(7).success).toBe(false);
    expect(s.avif_speed.safeParse(10).success).toBe(true);
    expect(s.avif_speed.safeParse(11).success).toBe(false);
    expect(s.backup_retention_days.safeParse(3650).success).toBe(true);
    expect(s.backup_retention_days.safeParse(3651).success).toBe(false);
    expect(s.max_dimension.safeParse(0).success).toBe(true);
    expect(s.max_dimension.safeParse(320).success).toBe(true);
    expect(s.max_dimension.safeParse(319).success).toBe(false);
    expect(s.max_dimension.safeParse(10001).success).toBe(false);
    expect(s.output_format.safeParse("webp_avif").success).toBe(true);
    expect(s.output_format.safeParse("png").success).toBe(false);
    expect(s.level.safeParse("lossless").success).toBe(true);
    expect(s.level.safeParse("max").success).toBe(false);
  });
});
