import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const get = vi.fn();
const getText = vi.fn();
const post = vi.fn();
vi.mock("../bearfort.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../bearfort.js")>();
  return {
    ...actual,
    forFort: async (id: string) => {
      if (id !== "a") throw new Error(`Site "${id}" is not a Bearfort fort`);
      return { hex: "37b9dd1582", get, getText, post };
    },
  };
});
import { register } from "./fort.js";

type Handler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>;
function tool(name: string): { schema: z.ZodRawShape; handler: Handler } {
  let found: { schema: z.ZodRawShape; handler: Handler } | undefined;
  register({ tool: (n: string, _d: string, schema: z.ZodRawShape, handler: Handler) => { if (n === name) found = { schema, handler }; } } as never);
  if (!found) throw new Error(`tool ${name} is not registered`);
  return found;
}
const out = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

beforeEach(() => {
  for (const m of [get, getText, post]) m.mockReset();
});

describe("fort tools", () => {
  it("fort_backup_create posts to the fort's backup route", async () => {
    post.mockResolvedValue({ jobId: "j1", status: "pending" });
    expect(out(await tool("fort_backup_create").handler({ site: "a" }))).toEqual({ fort: "37b9dd1582", jobId: "j1", status: "pending" });
    expect(post).toHaveBeenCalledWith("/backup");
  });

  it("fort_job_get only fetches the log when asked", async () => {
    get.mockResolvedValue({ id: "x", status: "done" });
    getText.mockResolvedValue("line1\nline2\n");
    const id = "6f1c2c1e-3b9a-4a51-9a1e-1d2c3b4a5f60";
    await tool("fort_job_get").handler({ site: "a", job_id: id });
    expect(getText).not.toHaveBeenCalled();
    const r = out(await tool("fort_job_get").handler({ site: "a", job_id: id, with_log: true }));
    expect(getText).toHaveBeenCalledWith(`/jobs/${id}/log`);
    expect(r.log).toEqual(["line1", "line2"]);
  });

  it("fort_job_get rejects a non-uuid job id (no path injection)", () => {
    const schema = z.object(tool("fort_job_get").schema);
    expect(schema.safeParse({ site: "a", job_id: "../../admin" }).success).toBe(false);
  });

  it("fort_logs_read passes the filters to Bearfort and masks the result", async () => {
    getText.mockResolvedValue("GET /a?token=s3cret 200\nGET /b 200\n");
    const r = out(await tool("fort_logs_read").handler({ site: "a", type: "access", grep: "GET", lines: 5, since: "2026-10-08T12:00:00Z" }));
    expect(getText).toHaveBeenCalledWith("/logs/access", { lines: 5, grep: "GET", since: "2026-10-08T12:00:00Z" });
    expect(r.lines).toEqual(["GET /a?token=[masked] 200", "GET /b 200"]);
  });

  it("fort_logs_read sends no filters it was not given", async () => {
    getText.mockResolvedValue("");
    await tool("fort_logs_read").handler({ site: "a", type: "php" });
    expect(getText).toHaveBeenCalledWith("/logs/php", {});
  });

  it("fort_logs_read refuses a since without a zone", () => {
    const schema = z.object(tool("fort_logs_read").schema);
    expect(schema.safeParse({ site: "a", type: "php", since: "2026-10-08T12:00:00" }).success).toBe(false);
    expect(schema.safeParse({ site: "a", type: "php", since: "2026-10-08T12:00:00+02:00" }).success).toBe(true);
  });

  it("fort_cache_purge posts the cache clear and returns its details", async () => {
    post.mockResolvedValue({ status: "cleared", details: ["WP cache flush: ok", "Page cache: purged", "OPcache: ok"] });
    const r = out(await tool("fort_cache_purge").handler({ site: "a" }));
    expect(post).toHaveBeenCalledWith("/cache/clear");
    expect(r.details).toContain("Page cache: purged");
  });

  it("refuses a site that is not a fort", async () => {
    await expect(tool("fort_backup_list").handler({ site: "zzz" })).rejects.toThrow(/not a Bearfort fort/);
  });
});
