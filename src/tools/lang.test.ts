import {
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	truncateSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

// Every tool resolves its site through forSite; stub it so no env or network
// is needed and the exact REST call can be asserted.
const get = vi.fn();
const put = vi.fn();
const post = vi.fn();
const del = vi.fn();
vi.mock("../client.js", () => ({
	forSite: (id: string) => {
		if (id !== "a" && id !== "b") throw new Error(`Unknown site "${id}"`);
		return { get, put, post, delete: del };
	},
}));

// Site "a" is a Bearfort fort, site "b" is a WordPress site that is not one.
const FORT = "37b9dd1582";
const fortGet = vi.fn();
const fortPost = vi.fn();
vi.mock("../bearfort.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../bearfort.js")>();
	return {
		...actual,
		forFort: async (id: string) => {
			if (id !== "a") throw new Error(`Site "${id}" is not a Bearfort fort`);
			return { hex: FORT, get: fortGet, getText: vi.fn(), post: fortPost };
		},
	};
});

import { MASK } from "../mask.js";
import { register, secretName } from "./lang.js";

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

const NS = "/mcp/lang/v1";
const TOKEN = "a".repeat(64);

describe("lang tools", () => {
	beforeEach(() => {
		for (const m of [get, put, post, del]) m.mockReset();
	});

	it("registers exactly the machine translation, migration, export and import tools", () => {
		expect([...tools().keys()].sort()).toEqual([
			"lang_export",
			"lang_fail_job",
			"lang_get_units",
			"lang_import",
			"lang_list_pending",
			"lang_migrate_cleanup_apply",
			"lang_migrate_cleanup_plan",
			"lang_migrate_run",
			"lang_migrate_status",
			"lang_mt_enqueue",
			"lang_mt_estimate",
			"lang_mt_get_settings",
			"lang_mt_pause",
			"lang_mt_resume",
			"lang_mt_retry_job",
			"lang_mt_status",
			"lang_mt_update_settings",
			"lang_string_machine",
			"lang_strings_machine",
			"lang_submit_translations",
			"lang_translate_machine",
			"lang_update_units",
		]);
	});

	it("no tool accepts a key argument (the key is set on the fort or in the admin, never through MCP)", () => {
		for (const [name, t] of tools()) {
			for (const arg of Object.keys(t.schema)) {
				expect(arg, `${name} takes "${arg}"`).not.toMatch(/key$/i);
			}
		}
	});

	it("an unknown site is refused before any request", async () => {
		await expect(tool("lang_mt_status").handler({ site: "nope" })).rejects.toThrow('Unknown site "nope"');
		expect(get).not.toHaveBeenCalled();
	});

	it("lang_mt_status reads GET /mt/status", async () => {
		get.mockResolvedValue({ provider: "azure", ready: true, last_run: { lost: 2, busy: 1 } });
		const out = await tool("lang_mt_status").handler({ site: "a" });
		expect(get).toHaveBeenCalledWith(`${NS}/mt/status`);
		expect(JSON.parse(out.content[0].text).last_run).toEqual({ lost: 2, busy: 1 });
	});

	it("lang_mt_status names the retrying list and the expired count (cvrt-lang 0.9.0)", () => {
		const { description } = tool("lang_mt_status");
		expect(description).toMatch(/`retrying`/);
		expect(description).toMatch(/`expired`/);
		expect(description).toMatch(/cvrt-lang 0\.9\.0/);
	});

	it("lang_mt_status never prints a provider key, even a string one under key", async () => {
		const secret = "0123456789abcdef0123456789abcdef";
		get.mockResolvedValue({
			provider: "azure",
			settings: { region: "westeurope", key: secret },
			key: secret,
			failed: [{ id: 3, unit: { key: secret } }],
		});
		const text = (await tool("lang_mt_status").handler({ site: "a" })).content[0].text;
		expect(text).not.toContain(secret);
		expect(JSON.parse(text).settings).toEqual({ region: "westeurope", key: MASK });
	});

	it("lang_mt_status keeps the { set, source } descriptor of the key", async () => {
		get.mockResolvedValue({ settings: { key: { set: true, source: "constant" } } });
		const out = JSON.parse((await tool("lang_mt_status").handler({ site: "a" })).content[0].text);
		expect(out.settings.key).toEqual({ set: true, source: "constant" });
	});

	it.each([
		["lang_mt_estimate", "estimate"],
		["lang_mt_enqueue", "enqueue"],
	])("%s posts the scope body to /mt/%s and sends only what was set", async (name, route) => {
		post.mockResolvedValue({ jobs: 1 });
		await tool(name).handler({ site: "a", scope: "object", ids: [5, 6], lang: "en", unit_keys: undefined });
		expect(post).toHaveBeenCalledWith(`${NS}/mt/${route}`, { scope: "object", ids: [5, 6], lang: "en" });
	});

	it("lang_mt_estimate with no arguments sends an empty body", async () => {
		post.mockResolvedValue({});
		await tool("lang_mt_estimate").handler({ site: "a" });
		expect(post).toHaveBeenCalledWith(`${NS}/mt/estimate`, {});
	});

	it("lang_mt_enqueue passes post_type and unit_keys", async () => {
		post.mockResolvedValue({});
		await tool("lang_mt_enqueue").handler({
			site: "a",
			scope: "object",
			post_type: "restaurant",
			ids: [9],
			lang: "en",
			unit_keys: ["title"],
		});
		expect(post).toHaveBeenCalledWith(`${NS}/mt/enqueue`, {
			scope: "object",
			post_type: "restaurant",
			ids: [9],
			lang: "en",
			unit_keys: ["title"],
		});
	});

	it("lang_mt_pause and lang_mt_resume post an empty body", async () => {
		post.mockResolvedValue({ paused: true, paused_reason: "admin" });
		await tool("lang_mt_pause").handler({ site: "a" });
		expect(post).toHaveBeenLastCalledWith(`${NS}/mt/pause`, {});
		await tool("lang_mt_resume").handler({ site: "a" });
		expect(post).toHaveBeenLastCalledWith(`${NS}/mt/resume`, {});
	});

	it("lang_list_pending claims on POST /mt/jobs/claim with the limit", async () => {
		post.mockResolvedValue({ jobs: [], note: "n" });
		await tool("lang_list_pending").handler({ site: "a", limit: 3 });
		expect(post).toHaveBeenCalledWith(`${NS}/mt/jobs/claim`, { limit: 3 });
	});

	it("lang_list_pending without a limit sends an empty body (the server default is 5)", async () => {
		post.mockResolvedValue({ jobs: [] });
		await tool("lang_list_pending").handler({ site: "a" });
		expect(post).toHaveBeenCalledWith(`${NS}/mt/jobs/claim`, {});
	});

	it("lang_list_pending bounds the limit like the server (1 to 20)", () => {
		const limit = tool("lang_list_pending").schema.limit as z.ZodTypeAny;
		expect(limit.safeParse(0).success).toBe(false);
		expect(limit.safeParse(21).success).toBe(false);
		expect(limit.safeParse(20).success).toBe(true);
	});

	it("lang_list_pending hands the lease token back as `lease` (mask.ts masks any field named token)", async () => {
		post.mockResolvedValue({ jobs: [{ id: 4, token: TOKEN, lease_until: "t", units: [{ key: "title" }] }], note: "n" });
		const text = (await tool("lang_list_pending").handler({ site: "a" })).content[0].text;
		const out = JSON.parse(text);
		// The lease token is the only way to submit; masked it would make claimed jobs unusable.
		expect(out.jobs[0].lease).toBe(TOKEN);
		expect(out.jobs[0]).not.toHaveProperty("token");
		expect(out.jobs[0].units).toEqual([{ key: "title" }]);
		expect(out.note).toBe("n");
	});

	it("lang_list_pending leaves a claim without jobs untouched", async () => {
		post.mockResolvedValue({ jobs: [], paused: "admin" });
		const out = JSON.parse((await tool("lang_list_pending").handler({ site: "a" })).content[0].text);
		expect(out).toEqual({ jobs: [], paused: "admin" });
	});

	it("lang_submit_translations posts token and per-unit text and hash to /mt/jobs/{id}", async () => {
		post.mockResolvedValue({ job: 4, state: "done", units: { title: { status: "written" } } });
		const units = { title: { text: "Hello", hash: "h1" }, "meta:desc": { text: "World", hash: "h2" } };
		const out = await tool("lang_submit_translations").handler({ site: "a", id: 4, token: TOKEN, units });
		expect(post).toHaveBeenCalledWith(`${NS}/mt/jobs/4`, { token: TOKEN, units });
		expect(JSON.parse(out.content[0].text).units.title.status).toBe("written");
	});

	it("lang_submit_translations requires a hash for every unit and a 64 hex token", () => {
		const { units, token } = tool("lang_submit_translations").schema as {
			units: z.ZodTypeAny;
			token: z.ZodTypeAny;
		};
		expect(units.safeParse({ title: { text: "x" } }).success).toBe(false);
		expect(units.safeParse({ title: { text: "x", hash: "h" } }).success).toBe(true);
		expect(units.safeParse({ title: { text: "x", hash: "h", extra: 1 } }).success).toBe(false);
		expect(token.safeParse("short").success).toBe(false);
		expect(token.safeParse(TOKEN).success).toBe(true);
	});

	it("lang_submit_translations reports a lost lease and per-unit codes as returned", async () => {
		post.mockResolvedValue({
			job: 4,
			state: "lost",
			code: "cvrt_lang_mt_lease",
			units: { title: { status: "rejected", code: "cvrt_lang_mt_unit_x" } },
		});
		const out = JSON.parse(
			(
				await tool("lang_submit_translations").handler({
					site: "a",
					id: 4,
					token: TOKEN,
					units: { title: { text: "x", hash: "h" } },
				})
			).content[0].text,
		);
		expect(out.state).toBe("lost");
		expect(out.code).toBe("cvrt_lang_mt_lease");
		expect(out.units.title.code).toBe("cvrt_lang_mt_unit_x");
	});

	it("lang_submit_translations passes the 409 busy error through with its code", async () => {
		post.mockRejectedValue(new Error('WordPress API error 409: {"code":"cvrt_lang_mt_busy"}'));
		await expect(
			tool("lang_submit_translations").handler({
				site: "a",
				id: 4,
				token: TOKEN,
				units: { title: { text: "x", hash: "h" } },
			}),
		).rejects.toThrow("cvrt_lang_mt_busy");
	});

	it("lang_fail_job posts token, code and message to /mt/jobs/{id}/fail", async () => {
		post.mockResolvedValue({ job: 4, state: "pending" });
		await tool("lang_fail_job").handler({
			site: "a",
			id: 4,
			token: TOKEN,
			code: "cvrt_lang_mt_rate",
			message: "slow down",
		});
		expect(post).toHaveBeenCalledWith(`${NS}/mt/jobs/4/fail`, {
			token: TOKEN,
			code: "cvrt_lang_mt_rate",
			message: "slow down",
		});
	});

	it("lang_fail_job takes only the codes the server knows", () => {
		const code = tool("lang_fail_job").schema.code as z.ZodTypeAny;
		for (const ok of [
			"cvrt_lang_mt_retry",
			"cvrt_lang_mt_bad_response",
			"cvrt_lang_mt_rate",
			"cvrt_lang_mt_unsupported_language",
			"cvrt_lang_mt_size",
			"external_error",
		]) {
			expect(code.safeParse(ok).success, ok).toBe(true);
		}
		expect(code.safeParse("made_up").success).toBe(false);
	});

	it("lang_get_units reads GET /units/post/{id}", async () => {
		get.mockResolvedValue({ units: [] });
		await tool("lang_get_units").handler({ site: "a", id: 12 });
		expect(get).toHaveBeenCalledWith(`${NS}/units/post/12`);
	});

	it("lang_update_units puts the set fields to /units/post/{id}", async () => {
		put.mockResolvedValue({ units: [] });
		await tool("lang_update_units").handler({
			site: "a",
			id: 12,
			units: { title: "Hallo" },
			approve: ["title"],
			machine: ["body"],
			machine_now: true,
			publish: false,
		});
		expect(put).toHaveBeenCalledWith(`${NS}/units/post/12`, {
			units: { title: "Hallo" },
			approve: ["title"],
			machine: ["body"],
			machine_now: true,
			publish: false,
		});
	});

	it("lang_update_units sends only what was set", async () => {
		put.mockResolvedValue({});
		await tool("lang_update_units").handler({ site: "a", id: 12, approve: ["title"] });
		expect(put).toHaveBeenCalledWith(`${NS}/units/post/12`, { approve: ["title"] });
	});
});

describe("lang tools: secret-looking argument names are refused at any depth", () => {
	const SECRET = "0123456789abcdef0123456789abcdef";
	beforeEach(() => {
		for (const m of [get, put, post, del]) m.mockReset();
	});

	it.each([
		["key"],
		["api_key"],
		["apiKey"],
		["Ocp-Apim-Subscription-Key"],
		["secret"],
		["client_secret"],
		["token"],
		["password"],
		["credential"],
		["Authorization"],
		["clientSecret"],
		["accessToken"],
		["apiToken"],
		["authToken"],
		["secretValue"],
		["keyValue"],
		["Password1"],
		["private-key-id"],
	])("lang_mt_update_settings refuses a nested %s before any request", async (name) => {
		put.mockResolvedValue({});
		await expect(
			tool("lang_mt_update_settings").handler({
				site: "a",
				provider_options: { azure: { region: "westeurope", [name]: SECRET } },
			}),
		).rejects.toThrow(/looks like a secret/);
		await expect(
			tool("lang_mt_update_settings").handler({ site: "a", glossary_hints: [{ [name.toUpperCase()]: SECRET }] }),
		).rejects.toThrow(/looks like a secret/);
		expect(put).not.toHaveBeenCalled();
	});

	it("the refusal names the path, never the value", async () => {
		const err = await tool("lang_mt_update_settings")
			.handler({ site: "a", provider_options: { azure: { api_key: SECRET } } })
			.catch((e: Error) => e);
		expect((err as Error).message).toContain('"provider_options.azure.<arg>"');
		expect((err as Error).message).not.toContain(SECRET);
		expect((err as Error).message).not.toContain("api_key");
	});

	it("a secret in a name position (record key) is never echoed", async () => {
		const name = ["sk", "live", "abcdefghijklmnopqrstuvwxkey"].join("_");
		const err = await tool("lang_mt_update_settings")
			.handler({ site: "a", formality: { [name]: "more" } })
			.catch((e: Error) => e);
		expect((err as Error).message).toContain('"formality.<arg>"');
		expect((err as Error).message).not.toContain("sk_live");
	});

	it("the units exemption holds at the top level only", async () => {
		put.mockResolvedValue({});
		await expect(
			tool("lang_mt_update_settings").handler({ site: "a", glossary_hints: [{ units: { api_key: SECRET } }] }),
		).rejects.toThrow(/looks like a secret/);
		expect(put).not.toHaveBeenCalled();
	});

	it("the tools' own legitimate names are not secret-looking", () => {
		const args = {
			post_type: "page",
			provider_options: { azure: { region: "global" } },
			monthly_cap: 1,
			review_mode: "review",
			lease_until: "t",
			unit_keys: ["a"],
			machine_now: true,
		};
		expect(secretName(args, new Set())).toBeNull();
	});

	it("the formality and glossary_hints descriptions say a value is only a setting, never the provider key", () => {
		const { schema } = tool("lang_mt_update_settings");
		for (const field of ["formality", "glossary_hints"]) {
			const description = (schema[field] as z.ZodTypeAny).description ?? "";
			expect(description, field).toContain("can never become the provider key");
		}
	});

	it("every tool guards its handler", async () => {
		for (const [name, t] of tools()) {
			await expect(t.handler({ site: "a", api_key: SECRET }), name).rejects.toThrow(/looks like a secret/);
		}
		for (const m of [get, put, post, del]) expect(m).not.toHaveBeenCalled();
	});

	it("the lease token is allowed only where the tool declares it", async () => {
		post.mockResolvedValue({ job: 4 });
		await tool("lang_fail_job").handler({ site: "a", id: 4, token: TOKEN, code: "external_error" });
		expect(post).toHaveBeenCalled();
		await expect(tool("lang_mt_pause").handler({ site: "a", token: TOKEN })).rejects.toThrow(/looks like a secret/);
		await expect(
			tool("lang_fail_job").handler({
				site: "a",
				id: 4,
				token: TOKEN,
				code: "external_error",
				extra: { token: TOKEN },
			}),
		).rejects.toThrow(/"<arg>\.token"/);
	});

	it("data is not mistaken for names: unit_keys, unit keys named like secrets, nothing refused", async () => {
		post.mockResolvedValue({});
		put.mockResolvedValue({});
		await tool("lang_mt_enqueue").handler({
			site: "a",
			scope: "object",
			ids: [1],
			lang: "en",
			unit_keys: ["meta:api_key"],
		});
		await tool("lang_submit_translations").handler({
			site: "a",
			id: 4,
			token: TOKEN,
			units: { "meta:api_key": { text: "x", hash: "h" } },
		});
		await tool("lang_update_units").handler({ site: "a", id: 4, units: { secret: "Geheim" }, approve: ["secret"] });
		expect(post).toHaveBeenCalledTimes(2);
		expect(put).toHaveBeenCalledTimes(1);
	});

	it("provider_options takes only azure: { region } with a region the server knows", () => {
		const options = tool("lang_mt_update_settings").schema.provider_options as z.ZodTypeAny;
		expect(options.safeParse({ azure: { region: "francecentral" } }).success).toBe(true);
		expect(options.safeParse({ azure: { region: "mars" } }).success).toBe(false);
		expect(options.safeParse({ azure: { region: "global", key: "x" } }).success).toBe(false);
		expect(options.safeParse({ azure: { api_key: "x" } }).success).toBe(false);
		expect(options.safeParse({ deepl: { region: "global" } }).success).toBe(false);
	});
});

describe("lang tools: retry, settings, machine requests", () => {
	beforeEach(() => {
		for (const m of [get, put, post, del]) m.mockReset();
	});

	it("lang_mt_retry_job posts an empty body to /mt/jobs/{id}/retry", async () => {
		post.mockResolvedValue({ job: 4, state: "pending" });
		await tool("lang_mt_retry_job").handler({ site: "a", id: 4 });
		expect(post).toHaveBeenCalledWith(`${NS}/mt/jobs/4/retry`, {});
	});

	it("lang_mt_get_settings reads GET /mt/settings and keeps the { set, source } descriptor", async () => {
		get.mockResolvedValue({ provider: "azure", key: { set: true, source: "option" } });
		const out = JSON.parse((await tool("lang_mt_get_settings").handler({ site: "a" })).content[0].text);
		expect(get).toHaveBeenCalledWith(`${NS}/mt/settings`);
		expect(out.key).toEqual({ set: true, source: "option" });
	});

	it("lang_mt_get_settings masks a string key", async () => {
		get.mockResolvedValue({ provider: "azure", key: "0123456789abcdef0123456789abcdef" });
		const text = (await tool("lang_mt_get_settings").handler({ site: "a" })).content[0].text;
		expect(text).not.toContain("0123456789abcdef");
	});

	it("lang_mt_update_settings puts only the settings that were set", async () => {
		put.mockResolvedValue({ provider: "azure" });
		await tool("lang_mt_update_settings").handler({
			site: "a",
			provider: "azure",
			auto: true,
			review_mode: "review",
			monthly_cap: 500000,
			formality: { de: "more" },
		});
		expect(put).toHaveBeenCalledWith(`${NS}/mt/settings`, {
			provider: "azure",
			auto: true,
			review_mode: "review",
			monthly_cap: 500000,
			formality: { de: "more" },
		});
	});

	it("lang_mt_update_settings has no key or pause field and refuses a key the caller smuggles in", async () => {
		const { schema, handler } = tool("lang_mt_update_settings");
		for (const arg of ["key", "paused", "paused_reason", "paused_month"]) expect(schema).not.toHaveProperty(arg);
		await expect(handler({ site: "a", key: "0123456789abcdef", auto: true })).rejects.toThrow(/key/);
		expect(put).not.toHaveBeenCalled();
	});

	it("lang_mt_update_settings never echoes a key", async () => {
		put.mockResolvedValue({ provider: "azure", key: "0123456789abcdef0123456789abcdef" });
		const text = (await tool("lang_mt_update_settings").handler({ site: "a", auto: false })).content[0].text;
		expect(text).not.toContain("0123456789abcdef");
	});

	it("lang_translate_machine posts type post and method machine to /translate", async () => {
		post.mockResolvedValue({ queued: [{ id: 5, lang: "en", job: 9 }], errors: [] });
		await tool("lang_translate_machine").handler({ site: "a", ids: [5], lang: "en", unit_keys: ["title"] });
		expect(post).toHaveBeenCalledWith(`${NS}/translate`, {
			type: "post",
			method: "machine",
			ids: [5],
			lang: "en",
			unit_keys: ["title"],
		});
	});

	it("lang_translate_machine omits unit_keys when not set and bounds ids to 1..50", async () => {
		post.mockResolvedValue({});
		await tool("lang_translate_machine").handler({ site: "a", ids: [5, 6], lang: "en" });
		expect(post).toHaveBeenCalledWith(`${NS}/translate`, { type: "post", method: "machine", ids: [5, 6], lang: "en" });
		const ids = tool("lang_translate_machine").schema.ids as z.ZodTypeAny;
		expect(ids.safeParse([]).success).toBe(false);
		expect(ids.safeParse(Array.from({ length: 51 }, (_, i) => i + 1)).success).toBe(false);
	});

	it("lang_strings_machine posts ids and lang to /strings/machine", async () => {
		post.mockResolvedValue({ queued: [], errors: [] });
		await tool("lang_strings_machine").handler({ site: "a", ids: [1, 2], lang: "en" });
		expect(post).toHaveBeenCalledWith(`${NS}/strings/machine`, { ids: [1, 2], lang: "en" });
	});

	it("lang_string_machine posts lang to /strings/{id}/machine", async () => {
		post.mockResolvedValue({ queued: [], errors: [] });
		await tool("lang_string_machine").handler({ site: "a", id: 8, lang: "en" });
		expect(post).toHaveBeenCalledWith(`${NS}/strings/8/machine`, { lang: "en" });
	});
});

const JOB_ID = "6f1c2c1e-3b9a-4a51-9a1e-1d2c3b4a5f60";
const CONFIRM = `1763550000.${"0123456789abcdef".repeat(2)}`;
const GH_PAT = `github_pat_${"A".repeat(30)}`;
const MINUTE = 60_000;

/** A Bearfort job as GET /v1/sites/{hex}/jobs/{id} returns it (wp_saas_db::models::Job). */
function backupJob(over: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: JOB_ID,
		site_hex: FORT,
		action: "backup",
		status: "completed",
		created_at: new Date(Date.now() - 10 * MINUTE).toISOString(),
		finished_at: new Date(Date.now() - 5 * MINUTE).toISOString(),
		...over,
	};
}

const parsed = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

describe("lang tools: migration", () => {
	beforeEach(() => {
		for (const m of [get, put, post, del, fortGet, fortPost]) m.mockReset();
	});

	it("lang_migrate_status reads GET /migrate/{source} per source", async () => {
		get.mockResolvedValue({ present: true, step: "objects" });
		await tool("lang_migrate_status").handler({ site: "a", source: "wpml" });
		await tool("lang_migrate_status").handler({ site: "a", source: "polylang" });
		expect(get.mock.calls).toEqual([[`${NS}/migrate/wpml`], [`${NS}/migrate/polylang`]]);
	});

	it("only the registered sources reach a route (schema and handler)", async () => {
		const source = tool("lang_migrate_status").schema.source as z.ZodTypeAny;
		expect(source.safeParse("wpml").success).toBe(true);
		expect(source.safeParse("polylang").success).toBe(true);
		expect(source.safeParse("../export").success).toBe(false);
		for (const name of ["lang_migrate_status", "lang_migrate_run", "lang_migrate_cleanup_plan"]) {
			await expect(tool(name).handler({ site: "a", source: "wpml/cleanup", step: "languages" }), name).rejects.toThrow(
				/source/,
			);
		}
		expect(get).not.toHaveBeenCalled();
		expect(post).not.toHaveBeenCalled();
	});

	it("lang_migrate_run is a dry run by default: apply false is sent", async () => {
		post.mockResolvedValue({ step: "languages", applied: false });
		await tool("lang_migrate_run").handler({ site: "a", source: "polylang", step: "languages" });
		expect(post).toHaveBeenCalledWith(`${NS}/migrate/polylang`, { step: "languages", apply: false });
	});

	it("lang_migrate_run passes apply, batch and resume", async () => {
		post.mockResolvedValue({});
		await tool("lang_migrate_run").handler({
			site: "a",
			source: "wpml",
			step: "all",
			apply: true,
			batch: 200,
			resume: true,
		});
		expect(post).toHaveBeenCalledWith(`${NS}/migrate/wpml`, { step: "all", apply: true, batch: 200, resume: true });
		const batch = tool("lang_migrate_run").schema.batch as z.ZodTypeAny;
		expect(batch.safeParse(0).success).toBe(false);
		expect(batch.safeParse(2001).success).toBe(false);
		expect(batch.safeParse(2000).success).toBe(true);
	});

	it("lang_migrate_run rejects the urls step (CLI only) in the schema and before any request", async () => {
		const step = tool("lang_migrate_run").schema.step as z.ZodTypeAny;
		expect(step.safeParse("urls").success).toBe(false);
		expect(step.safeParse("menus").success).toBe(true);
		expect(step.safeParse("fields").success).toBe(true);
		await expect(
			tool("lang_migrate_run").handler({ site: "a", source: "wpml", step: "urls", apply: true }),
		).rejects.toThrow(/urls.*WP-CLI/);
		expect(post).not.toHaveBeenCalled();
	});

	it("lang_migrate_cleanup_plan reads GET /migrate/{source}/cleanup and keeps the confirm token visible", async () => {
		get.mockResolvedValue({ tables: [{ name: "wp_icl_strings", rows: 3 }], blockers: [], confirm: CONFIRM });
		const out = parsed(await tool("lang_migrate_cleanup_plan").handler({ site: "a", source: "wpml" }));
		expect(get).toHaveBeenCalledWith(`${NS}/migrate/wpml/cleanup`);
		expect(out.confirm).toBe(CONFIRM);
		expect(post).not.toHaveBeenCalled();
	});

	it("lang_migrate_cleanup_plan documents the order: fort backup, plan, apply", () => {
		const { description } = tool("lang_migrate_cleanup_plan");
		expect(description).toMatch(
			/fort_backup_create.*fort_job_get.*lang_migrate_cleanup_plan.*lang_migrate_cleanup_apply/s,
		);
		expect(description).toMatch(/30 min/);
	});

	it("no tool but lang_migrate_cleanup_apply posts to a cleanup route", async () => {
		get.mockResolvedValue({});
		post.mockResolvedValue({});
		await tool("lang_migrate_status").handler({ site: "a", source: "wpml" });
		await tool("lang_migrate_cleanup_plan").handler({ site: "a", source: "wpml" });
		await tool("lang_migrate_run").handler({ site: "a", source: "wpml", step: "all", apply: true });
		const cleanupPosts = post.mock.calls.filter(([endpoint]) => String(endpoint).includes("cleanup"));
		expect(cleanupPosts).toEqual([]);
	});

	it("migration output is masked", async () => {
		get.mockResolvedValue({ warnings: [{ code: "x", message: `found ${GH_PAT}` }] });
		const text = (await tool("lang_migrate_status").handler({ site: "a", source: "wpml" })).content[0].text;
		expect(text).not.toContain(GH_PAT);
		expect(text).toContain(MASK);
	});
});

describe("lang tools: cleanup apply (PF29: fort backup first)", () => {
	const apply = (args: Record<string, unknown>) =>
		tool("lang_migrate_cleanup_apply").handler({
			site: "a",
			source: "wpml",
			confirm: CONFIRM,
			backup_job_id: JOB_ID,
			...args,
		});

	beforeEach(() => {
		for (const m of [get, put, post, del, fortGet, fortPost]) m.mockReset();
	});

	it("checks this fort's backup job, then posts exactly { confirm }", async () => {
		fortGet.mockResolvedValue(backupJob());
		post.mockResolvedValue({
			source: "wpml",
			removed: { tables: 3, options: 12 },
			backup: { file: "cleanup-wpml-20261119120000-0a1b2c3d.jsonl.gz", bytes: 1024, sha256: "f".repeat(64), rows: 77 },
		});
		const out = parsed(await apply({}));
		expect(fortGet).toHaveBeenCalledWith(`/jobs/${JOB_ID}`);
		expect(post).toHaveBeenCalledTimes(1);
		expect(post).toHaveBeenCalledWith(`${NS}/migrate/wpml/cleanup`, { confirm: CONFIRM });
		expect(out.backup.file).toBe("cleanup-wpml-20261119120000-0a1b2c3d.jsonl.gz");
		expect(out.fort).toBe(FORT);
		expect(out.backup_job).toBe(JOB_ID);
	});

	it("cleanup apply body has no path: exactly { confirm }, extra args are never forwarded", async () => {
		fortGet.mockResolvedValue(backupJob());
		post.mockResolvedValue({});
		await apply({ source: "polylang", path: "/tmp/dump.gz", backup: "/tmp/x", file: "/etc/passwd" });
		expect(post).toHaveBeenCalledWith(`${NS}/migrate/polylang/cleanup`, { confirm: CONFIRM });
		expect(Object.keys(post.mock.calls[0][1])).toEqual(["confirm"]);
		expect(Object.keys(tool("lang_migrate_cleanup_apply").schema).sort()).toEqual([
			"backup_job_id",
			"confirm",
			"site",
			"source",
		]);
	});

	it("cleanup apply without job id refused before any request", async () => {
		const schema = tool("lang_migrate_cleanup_apply").schema;
		expect((schema.backup_job_id as z.ZodTypeAny).safeParse(undefined).success).toBe(false);
		await expect(apply({ backup_job_id: undefined })).rejects.toThrow(/backup_job_id/);
		await expect(apply({ backup_job_id: "../../admin" })).rejects.toThrow(/backup_job_id/);
		expect(fortGet).not.toHaveBeenCalled();
		expect(post).not.toHaveBeenCalled();
	});

	it("non-fort site refused", async () => {
		await expect(apply({ site: "b" })).rejects.toThrow(/not a Bearfort fort/);
		expect(fortGet).not.toHaveBeenCalled();
		expect(post).not.toHaveBeenCalled();
	});

	it.each([
		["failed job refused", { status: "failed", error_message: "disk full" }],
		["running job refused", { status: "running", finished_at: null }],
		["pending job refused", { status: "pending", finished_at: null }],
	])("%s", async (_name, over) => {
		fortGet.mockResolvedValue(backupJob(over));
		await expect(apply({})).rejects.toThrow(/did not finish successfully/);
		expect(post).not.toHaveBeenCalled();
	});

	it("old job refused (finished more than 60 minutes ago)", async () => {
		fortGet.mockResolvedValue(backupJob({ finished_at: new Date(Date.now() - 61 * MINUTE).toISOString() }));
		await expect(apply({})).rejects.toThrow(/60 minutes/);
		expect(post).not.toHaveBeenCalled();
	});

	it("a job of 59 minutes still counts (known-answer control for the age limit)", async () => {
		fortGet.mockResolvedValue(backupJob({ finished_at: new Date(Date.now() - 59 * MINUTE).toISOString() }));
		post.mockResolvedValue({});
		await apply({});
		expect(post).toHaveBeenCalledTimes(1);
	});

	it.each([
		["no finished_at", { finished_at: undefined }],
		["unreadable finished_at", { finished_at: "yesterday" }],
		["finished_at in the future", { finished_at: new Date(Date.now() + 30 * MINUTE).toISOString() }],
	])("refused with %s", async (_name, over) => {
		fortGet.mockResolvedValue(backupJob(over));
		await expect(apply({})).rejects.toThrow(/finish/);
		expect(post).not.toHaveBeenCalled();
	});

	it("other fort's job refused", async () => {
		fortGet.mockResolvedValue(backupJob({ site_hex: "0000000000" }));
		await expect(apply({})).rejects.toThrow(/not a job of fort 37b9dd1582/);
		expect(post).not.toHaveBeenCalled();
	});

	it.each([
		["a restore job refused", { action: "restore" }],
		["another job id refused", { id: "11111111-2222-4333-8444-555555555555" }],
	])("%s", async (_name, over) => {
		fortGet.mockResolvedValue(backupJob(over));
		await expect(apply({})).rejects.toThrow(/backup job/);
		expect(post).not.toHaveBeenCalled();
	});

	it("a job id given in upper case matches Bearfort's lower-case id", async () => {
		fortGet.mockResolvedValue(backupJob());
		post.mockResolvedValue({});
		await apply({ backup_job_id: JOB_ID.toUpperCase() });
		expect(fortGet).toHaveBeenCalledWith(`/jobs/${JOB_ID}`);
		expect(post).toHaveBeenCalledTimes(1);
	});

	it("confirm must look like a plan token (issued time + 32 hex)", () => {
		const confirm = tool("lang_migrate_cleanup_apply").schema.confirm as z.ZodTypeAny;
		expect(confirm.safeParse(CONFIRM).success).toBe(true);
		expect(confirm.safeParse("").success).toBe(false);
		expect(confirm.safeParse("/var/www/x").success).toBe(false);
	});

	it("cleanup apply output (also an error) is masked", async () => {
		fortGet.mockResolvedValue(backupJob());
		post.mockResolvedValue({ removed: {}, note: GH_PAT });
		const text = (await apply({})).content[0].text;
		expect(text).not.toContain(GH_PAT);
	});

	it("the description names the order and the 60-minute backup rule", () => {
		const { description } = tool("lang_migrate_cleanup_apply");
		expect(description).toMatch(/fort_backup_create.*fort_job_get.*lang_migrate_cleanup_plan/s);
		expect(description).toMatch(/60 minutes/);
	});
});

describe("lang tools: export and import (local files)", () => {
	let dir: string;
	beforeEach(() => {
		for (const m of [get, put, post, del, fortGet, fortPost]) m.mockReset();
		dir = mkdtempSync(join(tmpdir(), "lang-mcp-"));
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	const SENTINEL = "Sentinel string value 42";
	const doc = {
		format: "cvrt-lang-export",
		version: 1,
		exported_at: "2026-11-19T12:00:00Z",
		site: "https://example.com",
		plugin_version: "0.10.0",
		db_version: 9,
		sections: {
			languages: [{ code: "de" }, { code: "en" }],
			default_language: "de",
			settings: { sync: true, admin_language_filter: true },
			strings: [{ domain: "x", context: "", name: "a", value: SENTINEL }],
			status: null,
		},
	};

	it("lang_export writes the file and returns counts only", async () => {
		get.mockResolvedValue(doc);
		const file = join(dir, "export.json");
		const out = parsed(
			await tool("lang_export").handler({ site: "a", sections: ["languages", "strings"], out_path: file }),
		);
		expect(get).toHaveBeenCalledWith(`${NS}/export`, { sections: "languages,strings" });
		expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(doc);
		expect(statSync(file).mode & 0o777).toBe(0o600);
		expect(out).toEqual({
			file,
			bytes: statSync(file).size,
			counts: { languages: 2, default_language: 1, settings: 2, strings: 1, status: 0 },
		});
		expect(JSON.stringify(out)).not.toContain(SENTINEL);
	});

	it("lang_export without sections sends none (the server exports all)", async () => {
		get.mockResolvedValue(doc);
		await tool("lang_export").handler({ site: "a", out_path: join(dir, "all.json") });
		expect(get).toHaveBeenCalledWith(`${NS}/export`, {});
		const sections = tool("lang_export").schema.sections as z.ZodTypeAny;
		expect(sections.safeParse(["objects", "switcher"]).success).toBe(true);
		expect(sections.safeParse(["secrets"]).success).toBe(false);
		expect(sections.safeParse([]).success).toBe(false);
	});

	it("lang_export refuses an existing path before any request", async () => {
		const file = join(dir, "taken.json");
		writeFileSync(file, "keep me");
		await expect(tool("lang_export").handler({ site: "a", out_path: file })).rejects.toThrow(/already exists/);
		expect(get).not.toHaveBeenCalled();
		expect(readFileSync(file, "utf8")).toBe("keep me");
	});

	it("lang_export refuses symlink and directory", async () => {
		const target = join(dir, "target.json");
		writeFileSync(target, "target");
		const link = join(dir, "link.json");
		symlinkSync(target, link);
		const dangling = join(dir, "dangling.json");
		symlinkSync(join(dir, "missing.json"), dangling);
		const sub = join(dir, "sub");
		mkdirSync(sub);
		for (const out_path of [link, dangling, sub]) {
			await expect(tool("lang_export").handler({ site: "a", out_path }), out_path).rejects.toThrow(/already exists/);
		}
		expect(get).not.toHaveBeenCalled();
		expect(readFileSync(target, "utf8")).toBe("target");
		expect(lstatSync(dangling).isSymbolicLink()).toBe(true);
	});

	it("lang_export refuses a relative path or a missing directory", async () => {
		await expect(tool("lang_export").handler({ site: "a", out_path: "export.json" })).rejects.toThrow(/absolute/);
		await expect(
			tool("lang_export").handler({ site: "a", out_path: join(dir, "nope", "export.json") }),
		).rejects.toThrow(/directory/);
		expect(get).not.toHaveBeenCalled();
	});

	it("lang_export never overwrites a file that appeared during the request", async () => {
		const file = join(dir, "race.json");
		get.mockImplementation(async () => {
			writeFileSync(file, "theirs");
			return doc;
		});
		await expect(tool("lang_export").handler({ site: "a", out_path: file })).rejects.toThrow(/already exists/);
		expect(readFileSync(file, "utf8")).toBe("theirs");
	});

	it("lang_import posts the file's document as a dry run by default", async () => {
		const file = join(dir, "in.json");
		writeFileSync(file, JSON.stringify(doc));
		post.mockResolvedValue({ applied: false, counts: {} });
		await tool("lang_import").handler({ site: "a", file_path: file });
		expect(post).toHaveBeenCalledWith(`${NS}/import`, { document: doc, apply: false });
		await tool("lang_import").handler({ site: "a", file_path: file, apply: true });
		expect(post).toHaveBeenLastCalledWith(`${NS}/import`, { document: doc, apply: true });
	});

	it("lang_import refuses > 32 MB before any request", async () => {
		const file = join(dir, "big.json");
		writeFileSync(file, "");
		truncateSync(file, 32 * 1024 * 1024 + 1);
		await expect(tool("lang_import").handler({ site: "a", file_path: file })).rejects.toThrow(/32 MB/);
		expect(post).not.toHaveBeenCalled();
	});

	it("lang_import refuses a body over 32 MB even when the file is exactly 32 MB", async () => {
		const file = join(dir, "edge.json");
		const head = '{"a":"';
		const tail = '"}';
		writeFileSync(file, head + "x".repeat(32 * 1024 * 1024 - head.length - tail.length) + tail);
		expect(statSync(file).size).toBe(32 * 1024 * 1024);
		await expect(tool("lang_import").handler({ site: "a", file_path: file })).rejects.toThrow(/32 MB/);
		expect(post).not.toHaveBeenCalled();
	});

	it("lang_import refuses a missing file, a directory, non-JSON and a non-object before any request", async () => {
		const bad = join(dir, "bad.json");
		writeFileSync(bad, "{not json");
		const list = join(dir, "list.json");
		writeFileSync(list, "[1,2]");
		for (const file_path of [join(dir, "missing.json"), dir, bad, list, "relative.json"]) {
			await expect(tool("lang_import").handler({ site: "a", file_path }), file_path).rejects.toThrow();
		}
		expect(post).not.toHaveBeenCalled();
	});

	it("lang_import output is masked", async () => {
		const file = join(dir, "in.json");
		writeFileSync(file, JSON.stringify(doc));
		post.mockResolvedValue({ warnings: [{ message: GH_PAT }] });
		const text = (await tool("lang_import").handler({ site: "a", file_path: file })).content[0].text;
		expect(text).not.toContain(GH_PAT);
	});

	it("no lang tool takes a server path: the only path arguments are local files", () => {
		const pathArgs = [...tools()].flatMap(([name, t]) =>
			Object.keys(t.schema)
				.filter((arg) => /path|file|dir|backup$/i.test(arg))
				.map((arg) => `${name}.${arg}`),
		);
		expect(pathArgs.sort()).toEqual(["lang_export.out_path", "lang_import.file_path"]);
	});
});
