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
});
