/**
 * Tool texts name released plugin versions, never a feature branch or a
 * "version after X" placeholder: a branch name dies at merge, and "after
 * 1.14.1" told an agent nothing once 1.15.0 shipped. Scans the tool sources,
 * the drift fixtures (their `source` texts) and README.md.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Placeholders for an unreleased version: "after 1.14.1", "the feat/foo branch",
// "branch `feat/foo`". Not covered: a bare branch name without the word
// "branch" (src/drift/fort.json cites a bearfort branch that way as provenance).
const PLACEHOLDER =
  /\bafter \d+\.\d+\.\d+\b|\b(?:feat|fix)\/[a-z0-9-]+`? branch\b|\bbranch `?(?:feat|fix)\/[a-z0-9-]+/;

function files(): string[] {
  const tools = readdirSync(join(root, "src/tools"))
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => join(root, "src/tools", f));
  const drift = readdirSync(join(root, "src/drift"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => join(root, "src/drift", f));
  return [...tools, ...drift, join(root, "README.md")];
}

export function placeholders(text: string): string[] {
  return text
    .split("\n")
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => PLACEHOLDER.test(line))
    .map(({ line, n }) => `${n}: ${line.trim().slice(0, 160)}`);
}

describe("version texts", () => {
  it("known answer: the pattern flags a version placeholder and a branch name, not a version", () => {
    expect(placeholders("needs cvrt-seo-manager after 1.14.1")).toHaveLength(1);
    expect(placeholders("since the feat/acf-migration-blockers branch")).toHaveLength(1);
    expect(placeholders("needs cvrt-seo-manager 1.15.0+ (up to 1.14.1 it wrote)")).toHaveLength(0);
  });

  for (const file of files()) {
    it(`${file.slice(root.length + 1)} names released versions only`, () => {
      expect(placeholders(readFileSync(file, "utf8"))).toEqual([]);
    });
  }
});
