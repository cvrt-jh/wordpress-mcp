import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sites: Record<string, { id: string; url: string; username: string; password: string }> = {
  wf: { id: "wf", url: "https://www.waldfreunde.info/", username: "u", password: "p" },
  stg: { id: "stg", url: "https://08acc924a7.bearfort.io", username: "u", password: "p" },
  other: { id: "other", url: "https://not-on-bearfort.example", username: "u", password: "p" },
};
vi.mock("./sites.js", () => ({
  getSite: (id: string) => {
    if (!sites[id]) throw new Error(`Unknown site "${id}"`);
    return sites[id];
  },
}));

import { forFort, resetFortIndex, filterLog } from "./bearfort.js";

const index = (items: { hex: string; domain: string | null }[]) =>
  new Response(JSON.stringify({ items, total: items.length, limit: 200, offset: 0 }), { status: 200 });

describe("forFort", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetFortIndex();
    process.env.BEARFORT_API_KEY = "bea_test";
    delete process.env.BEARFORT_API_URL;
  });
  afterEach(() => {
    delete process.env.BEARFORT_API_KEY;
  });

  it("fails closed without BEARFORT_API_KEY, before any request", async () => {
    delete process.env.BEARFORT_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(forFort("wf")).rejects.toThrow(/BEARFORT_API_KEY/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("takes the hex straight from a <hex>.bearfort.io host", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect((await forFort("stg")).hex).toBe("08acc924a7");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("resolves a custom domain (www stripped) through the admin fort list, once", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(index([{ hex: "37b9dd1582", domain: "waldfreunde.info" }, { hex: "aaaaaaaaaa", domain: null }]));
    expect((await forFort("wf")).hex).toBe("37b9dd1582");
    expect((await forFort("wf")).hex).toBe("37b9dd1582");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://api.bearfort.io/v1/admin/sites?limit=200&offset=0");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer bea_test");
  });

  it("refuses a site that is not a Bearfort fort", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(index([{ hex: "37b9dd1582", domain: "waldfreunde.info" }]));
    await expect(forFort("other")).rejects.toThrow(/not a Bearfort fort/);
  });

  it("calls fort routes with the hex and masks error bodies", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ error: "x", key: "sk_live_" + "A".repeat(30) }), { status: 500 }));
    const fort = await forFort("stg");
    const err = await fort.post("/backup").catch((e: Error) => e);
    expect(String(fetchSpy.mock.calls[0][0])).toBe("https://api.bearfort.io/v1/sites/08acc924a7/backup");
    expect((err as Error).message).toMatch(/Bearfort API error 500/);
    expect((err as Error).message).not.toContain("sk_live_");
  });
});

describe("filterLog", () => {
  const log = [
    '1.2.3.4 - - "GET /?wc-api=x&token=abc123def456 HTTP/1.1" 200',
    "PHP Fatal error: Uncaught Exception in /x.php",
    '5.6.7.8 - - "POST /checkout?key=wc_order_123&pass=hunter2 HTTP/1.1" 302',
    "PHP Warning: secret sk_live_" + "B".repeat(30),
  ].join("\n");

  it("keeps the last N lines matching a case-insensitive literal", () => {
    expect(filterLog(log, { grep: "php fatal" , lines: 10 })).toEqual(["PHP Fatal error: Uncaught Exception in /x.php"]);
    expect(filterLog(log, { lines: 2 })).toHaveLength(2);
  });

  it("treats grep as a literal, not a regex", () => {
    expect(filterLog(log, { grep: ".*", lines: 10 })).toEqual([]);
  });

  it("masks secret-named URL parameters and credential shapes", () => {
    const out = filterLog(log, { lines: 10 }).join("\n");
    expect(out).not.toContain("abc123def456");
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain("sk_live_");
    expect(out).toContain("token=[masked]");
    expect(out).toContain("wc-api=x");
  });
});
