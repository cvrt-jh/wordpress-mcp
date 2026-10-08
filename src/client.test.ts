import { describe, it, expect, vi, beforeEach } from "vitest";

// forSite reads sites via getSite; stub the registry so no env is needed.
vi.mock("./sites.js", () => ({
  getSite: (id: string) => {
    if (id === "a") return { id: "a", url: "https://a.example/", username: "u", password: "p" };
    const err = new Error(`Unknown site "${id}". Available: a`);
    throw err;
  },
}));

import { forSite } from "./client.js";

describe("forSite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws (before any fetch) for an unknown site", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(() => forSite("nope")).toThrow(/Unknown site "nope"/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("builds the base URL (trailing slash stripped) and Basic auth header on GET", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const wp = forSite("a");
    await wp.get("/mcp/v1/health");

    const [calledUrl, init] = fetchSpy.mock.calls[0];
    expect(String(calledUrl)).toBe("https://a.example/wp-json/mcp/v1/health");
    const auth = (init?.headers as Record<string, string>).Authorization;
    expect(auth).toBe("Basic " + Buffer.from("u:p").toString("base64"));
  });

  it("throws WordPress API error on non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("boom", { status: 500 }));
    const wp = forSite("a");
    await expect(wp.get("/x")).rejects.toThrow(/WordPress API error 500: boom/);
  });

  it("postRaw sends the body as-is with the given content type", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await forSite("a").postRaw("/mcp/seo/v1/import/csv", "a,b\n1,2\n", "text/csv; charset=utf-8");

    const [, init] = fetchSpy.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe("a,b\n1,2\n");
    const headers = init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("text/csv; charset=utf-8");
    expect(headers.Authorization).toMatch(/^Basic /);
  });

  it("delete sends a JSON body only when one is given", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("{}", { status: 200 }));
    const wp = forSite("a");
    await wp.delete("/x", { force: "true" }, { id: 3 });
    await wp.delete("/y");

    const [url1, init1] = fetchSpy.mock.calls[0];
    expect(String(url1)).toBe("https://a.example/wp-json/x?force=true");
    expect(init1?.body).toBe(JSON.stringify({ id: 3 }));
    expect(fetchSpy.mock.calls[1][1]?.body).toBeUndefined();
  });
});
