import { describe, it, expect } from "vitest";
import { loadSites } from "./sites.js";

const valid = JSON.stringify([
  { id: "a", url: "https://a.example", username: "ua", password: "pa" },
  { id: "b", url: "https://b.example/", username: "ub", password: "pb" },
]);

describe("loadSites", () => {
  it("parses a valid array into a map keyed by id", () => {
    const m = loadSites(valid);
    expect(m.get("a")?.url).toBe("https://a.example");
    expect(m.get("b")?.username).toBe("ub");
    expect(m.size).toBe(2);
  });

  it("throws when WORDPRESS_SITES is missing", () => {
    expect(() => loadSites(undefined)).toThrow(/WORDPRESS_SITES/);
  });

  it("throws on non-JSON", () => {
    expect(() => loadSites("not json")).toThrow(/WORDPRESS_SITES/);
  });

  it("throws when the JSON is not an array", () => {
    expect(() => loadSites('{"id":"a"}')).toThrow(/array/);
  });

  it("throws on an empty array", () => {
    expect(() => loadSites("[]")).toThrow(/at least one/);
  });

  it("throws when an entry is missing a field", () => {
    const bad = JSON.stringify([{ id: "a", url: "https://a.example", username: "ua" }]);
    expect(() => loadSites(bad)).toThrow(/password/);
  });

  it("throws on a non-http url", () => {
    const bad = JSON.stringify([{ id: "a", url: "ftp://a.example", username: "ua", password: "pa" }]);
    expect(() => loadSites(bad)).toThrow(/http/);
  });

  it("throws on duplicate ids", () => {
    const dup = JSON.stringify([
      { id: "a", url: "https://a.example", username: "u", password: "p" },
      { id: "a", url: "https://b.example", username: "u", password: "p" },
    ]);
    expect(() => loadSites(dup)).toThrow(/duplicate/i);
  });
});
