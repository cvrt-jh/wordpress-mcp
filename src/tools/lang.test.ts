import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

// Every tool resolves its site through forSite; stub it so no env or network
// is needed and the exact REST call can be asserted.
const get = vi.fn();
const put = vi.fn();
const post = vi.fn();
const del = vi.fn();
vi.mock("../client.js", () => ({
	forSite: (id: string) => {
		if (id !== "a") throw new Error(`Unknown site "${id}"`);
		return { get, put, post, delete: del };
	},
}));

import { MASK } from "../mask.js";
import { register } from "./lang.js";

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

const NS = "/mcp/lang/v1";
const TOKEN = "a".repeat(64);

describe("lang tools", () => {
	beforeEach(() => {
		for (const m of [get, put, post, del]) m.mockReset();
	});

	it("registers exactly the machine translation tools", () => {
		expect([...tools().keys()].sort()).toEqual([
			"lang_fail_job",
			"lang_get_units",
			"lang_list_pending",
			"lang_mt_enqueue",
			"lang_mt_estimate",
			"lang_mt_pause",
			"lang_mt_resume",
			"lang_mt_status",
			"lang_submit_translations",
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
