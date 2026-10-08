import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Every tool resolves its site through forSite; stub it so no env or network
// is needed and the exact REST call can be asserted.
const get = vi.fn();
const put = vi.fn();
const post = vi.fn();
const del = vi.fn();
const postRaw = vi.fn();
vi.mock("../client.js", () => ({
  forSite: (id: string) => {
    if (id !== "a") throw new Error(`Unknown site "${id}"`);
    return { get, put, post, delete: del, postRaw };
  },
}));

import { register } from "./seo.js";

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

const NS = "/mcp/seo/v1";
const parse = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

beforeEach(() => {
  for (const f of [get, put, post, del]) f.mockReset();
});

describe("seo_indexnow_ping", () => {
  it("fans urls out to one POST { url } per URL", async () => {
    post.mockResolvedValue(true);
    const r = await tool("seo_indexnow_ping").handler({ site: "a", urls: ["https://x.de/a", "https://x.de/b"] });
    expect(post.mock.calls).toEqual([
      [`${NS}/indexnow/ping`, { url: "https://x.de/a" }],
      [`${NS}/indexnow/ping`, { url: "https://x.de/b" }],
    ]);
    expect(parse(r)).toEqual([
      { url: "https://x.de/a", ok: true },
      { url: "https://x.de/b", ok: true },
    ]);
  });

  it("sends a single url", async () => {
    post.mockResolvedValue(true);
    await tool("seo_indexnow_ping").handler({ site: "a", url: "https://x.de/a" });
    expect(post.mock.calls).toEqual([[`${NS}/indexnow/ping`, { url: "https://x.de/a" }]]);
  });

  it("combines url and urls and removes duplicates", async () => {
    post.mockResolvedValue(true);
    await tool("seo_indexnow_ping").handler({ site: "a", url: "https://x.de/a", urls: ["https://x.de/a", "https://x.de/b"] });
    expect(post.mock.calls.map((c) => c[1])).toEqual([{ url: "https://x.de/a" }, { url: "https://x.de/b" }]);
  });

  it("throws without url or urls and calls nothing", async () => {
    await expect(tool("seo_indexnow_ping").handler({ site: "a" })).rejects.toThrow(/url or urls/);
    await expect(tool("seo_indexnow_ping").handler({ site: "a", urls: [] })).rejects.toThrow(/url or urls/);
    expect(post).not.toHaveBeenCalled();
  });

  it("keeps going when one URL fails and reports each result", async () => {
    post
      .mockRejectedValueOnce(new Error("WordPress API error 400: bad url"))
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const r = await tool("seo_indexnow_ping").handler({ site: "a", urls: ["u1", "u2", "u3"] });
    expect(post).toHaveBeenCalledTimes(3);
    const out = parse(r);
    expect(out[0]).toEqual({ url: "u1", ok: false, error: "WordPress API error 400: bad url" });
    expect(out[1].ok).toBe(false);
    expect(out[1].error).toMatch(/not dispatched/);
    expect(out[2]).toEqual({ url: "u3", ok: true });
  });
});

describe("seo_update_settings", () => {
  it("sends the settings object as the whole body", async () => {
    put.mockResolvedValue({});
    const settings = { social: { social_extra_profiles: ["https://github.com/x"] }, title_separator: "|" };
    await tool("seo_update_settings").handler({ site: "a", settings });
    expect(put).toHaveBeenCalledWith(`${NS}/settings`, settings);
  });

  it("refuses an empty object (the endpoint answers 400)", async () => {
    await expect(tool("seo_update_settings").handler({ site: "a", settings: {} })).rejects.toThrow(/at least one/);
    expect(put).not.toHaveBeenCalled();
  });
});

describe("seo_update_post_seo / seo_update_term_seo", () => {
  it("sends only the given post fields, keeping null (delete)", async () => {
    put.mockResolvedValue({});
    await tool("seo_update_post_seo").handler({
      site: "a",
      id: 5,
      title: "T",
      focus_keywords: ["a", "b"],
      canonical: null,
      description: undefined,
    });
    expect(put).toHaveBeenCalledWith(`${NS}/posts/5/seo`, { title: "T", focus_keywords: ["a", "b"], canonical: null });
  });

  it("refuses an update with no fields", async () => {
    await expect(tool("seo_update_post_seo").handler({ site: "a", id: 5 })).rejects.toThrow(/at least one/);
    await expect(tool("seo_update_term_seo").handler({ site: "a", id: 5 })).rejects.toThrow(/at least one/);
    expect(put).not.toHaveBeenCalled();
  });

  it("exposes only the term subset of fields", () => {
    expect(Object.keys(tool("seo_update_term_seo").schema).sort()).toEqual(
      ["site", "id", "title", "description", "robots", "og_image", "schema"].sort()
    );
  });

  it("sends only the given term fields", async () => {
    put.mockResolvedValue({});
    await tool("seo_update_term_seo").handler({ site: "a", id: 9, robots: "noindex" });
    expect(put).toHaveBeenCalledWith(`${NS}/terms/9/seo`, { robots: "noindex" });
  });
});

describe("seo_bulk_update_posts_seo", () => {
  it("wraps items and drops undefined fields per item", async () => {
    put.mockResolvedValue({ updated: 2, errors: [] });
    await tool("seo_bulk_update_posts_seo").handler({
      site: "a",
      items: [
        { id: 1, title: "A", description: undefined },
        { id: 2, robots: null },
      ],
    });
    expect(put).toHaveBeenCalledWith(`${NS}/posts/seo/bulk`, { items: [{ id: 1, title: "A" }, { id: 2, robots: null }] });
  });

  it("rejects more than 100 items in the schema", () => {
    const items = Array.from({ length: 101 }, (_, i) => ({ id: i + 1 }));
    expect(tool("seo_bulk_update_posts_seo").schema.items.safeParse(items).success).toBe(false);
  });
});

describe("seo_list_posts_seo", () => {
  it("sends only the given query params, has_seo as true/false", async () => {
    get.mockResolvedValue([]);
    await tool("seo_list_posts_seo").handler({ site: "a", post_type: "page", has_seo: false });
    expect(get).toHaveBeenCalledWith(`${NS}/posts/seo`, { post_type: "page", has_seo: "false" });
  });
});

describe("redirect tools", () => {
  it("seo_create_redirect sends the redirect fields", async () => {
    post.mockResolvedValue({ id: 1 });
    await tool("seo_create_redirect").handler({ site: "a", from_url: "/old", to_url: "/new", type: 302 });
    expect(post).toHaveBeenCalledWith(`${NS}/redirects`, { from_url: "/old", to_url: "/new", type: 302 });
  });

  it("only accepts the plugin's status codes", () => {
    const type = tool("seo_create_redirect").schema.type;
    expect(type.safeParse(410).success).toBe(true);
    expect(type.safeParse(308).success).toBe(false);
  });

  it("seo_update_redirect is a partial PUT", async () => {
    put.mockResolvedValue({ id: 3 });
    await tool("seo_update_redirect").handler({ site: "a", id: 3, enabled: false });
    expect(put).toHaveBeenCalledWith(`${NS}/redirects/3`, { enabled: false });
    await expect(tool("seo_update_redirect").handler({ site: "a", id: 3 })).rejects.toThrow(/at least one/);
  });

  it("seo_list_redirects sends enabled as 1/0 (the server casts the raw value to bool)", async () => {
    get.mockResolvedValue({ items: [], total: 0, pages: 0 });
    await tool("seo_list_redirects").handler({ site: "a", enabled: false, type: 301 });
    expect(get).toHaveBeenCalledWith(`${NS}/redirects`, { enabled: 0, type: 301 });
  });

  it("seo_create_redirect_from_log sends to_url", async () => {
    post.mockResolvedValue({});
    await tool("seo_create_redirect_from_log").handler({ site: "a", id: 4, to_url: "https://x.de/" });
    expect(post).toHaveBeenCalledWith(`${NS}/monitor/log/4/redirect`, { to_url: "https://x.de/" });
  });
});

describe("other tools", () => {
  it("seo_list_monitor_log passes sort params", async () => {
    get.mockResolvedValue({ items: [], total: 0, pages: 0 });
    await tool("seo_list_monitor_log").handler({ site: "a", order_by: "hits", order: "ASC" });
    expect(get).toHaveBeenCalledWith(`${NS}/monitor/log`, { order_by: "hits", order: "ASC" });
  });

  it("seo_keyword_check sends keyword and optional exclude_post_id", async () => {
    post.mockResolvedValue({ unique: true, posts: [] });
    await tool("seo_keyword_check").handler({ site: "a", keyword: "wp" });
    expect(post).toHaveBeenCalledWith(`${NS}/analysis/keyword-check`, { keyword: "wp" });
  });

  it("seo_sitemap_ping submits through /sitemap/submit", async () => {
    post.mockResolvedValue({});
    await tool("seo_sitemap_ping").handler({ site: "a" });
    expect(post).toHaveBeenCalledWith(`${NS}/sitemap/submit`, {});
  });

  it("seo_import_migrate sends source and the given flags only", async () => {
    post.mockResolvedValue({});
    await tool("seo_import_migrate").handler({ site: "a", source: "rankmath", settings: true });
    expect(post).toHaveBeenCalledWith(`${NS}/import/migrate`, { source: "rankmath", settings: true });
  });

  it("seo_import_settings sends the flat map as the body", async () => {
    post.mockResolvedValue(1);
    await tool("seo_import_settings").handler({ site: "a", data: { csm_title_separator: "|" } });
    expect(post).toHaveBeenCalledWith(`${NS}/import/settings`, { csm_title_separator: "|" });
  });
});

describe("CSV imports send the raw CSV body", () => {
  const csv = "source,target,type,enabled\n/alt,/neu,301,1\n";

  for (const [name, route] of [
    ["seo_import_csv", `${NS}/import/csv`],
    ["seo_import_redirects", `${NS}/import/redirects`],
  ] as const) {
    it(`${name} posts inline CSV as text/csv`, async () => {
      postRaw.mockReset();
      postRaw.mockResolvedValue({ success: 1, errors: 0 });
      await tool(name).handler({ site: "a", csv });
      expect(postRaw).toHaveBeenCalledWith(route, csv, "text/csv; charset=utf-8");
      expect(post).not.toHaveBeenCalled();
    });
  }

  it("reads csv_file from disk", async () => {
    postRaw.mockReset();
    postRaw.mockResolvedValue({});
    const dir = mkdtempSync(join(tmpdir(), "seo-csv-"));
    try {
      const file = join(dir, "redirects.csv");
      writeFileSync(file, csv);
      await tool("seo_import_redirects").handler({ site: "a", csv_file: file });
      expect(postRaw).toHaveBeenCalledWith(`${NS}/import/redirects`, csv, "text/csv; charset=utf-8");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses both, neither, a non-.csv file and empty CSV without calling the site", async () => {
    postRaw.mockReset();
    const h = tool("seo_import_csv").handler;
    await expect(h({ site: "a", csv, csv_file: "/x.csv" })).rejects.toThrow(/not both/);
    await expect(h({ site: "a" })).rejects.toThrow(/Give csv or csv_file/);
    await expect(h({ site: "a", csv_file: "/x.json" })).rejects.toThrow(/\.csv/);
    await expect(h({ site: "a", csv: "  \n" })).rejects.toThrow(/empty/);
    expect(postRaw).not.toHaveBeenCalled();
  });
});

describe("seo_clear_monitor_log", () => {
  it("sends the selection in the DELETE body (the endpoint reads JSON params)", async () => {
    del.mockResolvedValue({ deleted: 1, success: true });
    await tool("seo_clear_monitor_log").handler({ site: "a", id: 12 });
    expect(del).toHaveBeenCalledWith(`${NS}/monitor/log`, undefined, { id: 12 });
  });

  it("sends a date range", async () => {
    del.mockResolvedValue({ deleted: 4, success: true });
    await tool("seo_clear_monitor_log").handler({ site: "a", from: "2026-09-01", to: "2026-09-30" });
    expect(del).toHaveBeenCalledWith(`${NS}/monitor/log`, undefined, { from: "2026-09-01", to: "2026-09-30" });
  });

  it("sends no body without arguments, which clears the whole log", async () => {
    del.mockResolvedValue({ deleted: 99, success: true });
    await tool("seo_clear_monitor_log").handler({ site: "a" });
    expect(del).toHaveBeenCalledWith(`${NS}/monitor/log`, undefined, undefined);
  });

  it("rejects a malformed date", () => {
    const schema = z.object(tool("seo_clear_monitor_log").schema);
    expect(schema.safeParse({ site: "a", from: "01.09.2026" }).success).toBe(false);
  });
});
