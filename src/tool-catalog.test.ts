/**
 * README and server.json must describe the tools that are really registered.
 * The README tool lists are generated (`pnpm run sync-docs`); this fails when
 * the committed README block, a tool count in README.md or the count in
 * server.json differs from the registered tool set.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { registerAll } from "./register.js";
import { BLOCK_END, BLOCK_START, collect, renderTools, SECTIONS, summary, totalTools } from "./tool-catalog.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readme = readFileSync(join(root, "README.md"), "utf8");
const serverJson = JSON.parse(readFileSync(join(root, "server.json"), "utf8")) as { description: string };

/** The README text between the generated-block markers, markers included. */
function readmeBlock(text: string): string {
	const start = text.indexOf(BLOCK_START);
	const end = text.indexOf(BLOCK_END);
	if (start < 0 || end < 0) return "";
	return text.slice(start, end + BLOCK_END.length);
}

/** Every way the docs disagree with the registered tool set (empty = in sync). */
function docProblems(readmeText: string, serverDescription: string, total: number): string[] {
	const problems: string[] = [];
	const generated = renderTools();
	if (readmeBlock(readmeText) !== generated) problems.push("README tool block differs from the registered tools");
	const headline = /\*\*(\d+) tools\*\*/.exec(readmeText)?.[1];
	if (headline !== String(total)) problems.push(`README headline says ${headline}, registered ${total}`);
	const heading = /^## Tools \((\d+)\)$/m.exec(readmeText)?.[1];
	if (heading !== String(total)) problems.push(`README "## Tools" says ${heading}, registered ${total}`);
	const server = /(\d+) tools/.exec(serverDescription)?.[1];
	if (server !== String(total)) problems.push(`server.json says ${server}, registered ${total}`);
	return problems;
}

describe("tool catalog", () => {
	it("registerAll registers exactly the catalog sections, without duplicate names", () => {
		const viaRegisterAll: string[] = [];
		registerAll({
			tool: (name: string) => {
				viaRegisterAll.push(name);
			},
		} as never);
		const viaSections = SECTIONS.flatMap((s) => collect(s.register).map((t) => t.name));
		expect(viaRegisterAll).toEqual(viaSections);
		expect(new Set(viaSections).size).toBe(viaSections.length);
		expect(totalTools()).toBe(viaSections.length);
	});

	it("every tool module in src/tools is part of the catalog", () => {
		const source = readFileSync(join(root, "src/tool-catalog.ts"), "utf8");
		const modules = readdirSync(join(root, "src/tools"))
			.filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
			.map((f) => f.replace(/\.ts$/, ""));
		const missing = modules.filter((m) => !source.includes(`"./tools/${m}.js"`));
		expect(missing).toEqual([]);
	});

	it("known answer: summary keeps e.g. inside a sentence and cuts at the first real sentence end", () => {
		expect(summary("Run a migration import (e.g. WPML). Needs the plugin.")).toBe("Run a migration import (e.g. WPML)");
		expect(summary("Short one.")).toBe("Short one");
		expect(summary(`${"word ".repeat(80)}end`, 40).endsWith(" ...")).toBe(true);
	});
});

describe("docs match the registered tools", () => {
	const total = totalTools();

	it("README block, README counts and server.json are in sync", () => {
		expect(docProblems(readme, serverJson.description, total)).toEqual([]);
	});

	it("known answer: a removed bullet, a wrong headline and a wrong server.json count are flagged", () => {
		const firstBullet = readme.indexOf("\n- `");
		const lineEnd = readme.indexOf("\n", firstBullet + 1);
		const withoutBullet = readme.slice(0, firstBullet) + readme.slice(lineEnd);
		expect(docProblems(withoutBullet, serverJson.description, total)).toContain(
			"README tool block differs from the registered tools",
		);
		expect(
			docProblems(readme.replace(`**${total} tools**`, "**1 tools**"), serverJson.description, total),
		).toHaveLength(1);
		expect(docProblems(readme, "Multi-site WordPress MCP server - 249 tools", total)).toEqual([
			`server.json says 249, registered ${total}`,
		]);
	});
});
