import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

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
		await tool("seo_indexnow_ping").handler({
			site: "a",
			url: "https://x.de/a",
			urls: ["https://x.de/a", "https://x.de/b"],
		});
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
	it("passes a csm_kg_logo_format 400 through with code and message (no swallowing)", async () => {
		put.mockRejectedValue(
			new Error(
				'WordPress API error 400: {"code":"csm_kg_logo_format","message":"kg_logo must be an attachment id.","data":{"status":400}}',
			),
		);
		await expect(
			tool("seo_update_settings").handler({ site: "a", settings: { kg_logo: "https://evil.example/x.png" } }),
		).rejects.toThrow(/csm_kg_logo_format.*kg_logo must be an attachment id/s);
	});

	it("documents every accepted kg_logo form and the 400", () => {
		let text = "";
		register({
			tool: (name: string, d: string) => {
				if (name === "seo_update_settings") text = d;
			},
		} as never);
		expect(text).toMatch(/media-library URL/);
		expect(text).toMatch(/sent back unchanged/);
		expect(text).toMatch(/0 removes the logo/);
		expect(text).toMatch(/csm_kg_logo_format/);
	});

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
			["site", "id", "title", "description", "robots", "og_image", "schema"].sort(),
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
		expect(put).toHaveBeenCalledWith(`${NS}/posts/seo/bulk`, {
			items: [
				{ id: 1, title: "A" },
				{ id: 2, robots: null },
			],
		});
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

	it("seo_sitemap_flush posts to /sitemap/flush and returns the result", async () => {
		post.mockResolvedValue({ flushed: true });
		const res = await tool("seo_sitemap_flush").handler({ site: "a" });
		expect(post).toHaveBeenCalledWith(`${NS}/sitemap/flush`, {});
		expect(res.content[0].text).toContain('"flushed":true');
	});

	it("seo_sitemap_flush fails for an unknown site before any request", async () => {
		post.mockClear();
		await expect(tool("seo_sitemap_flush").handler({ site: "nope" })).rejects.toThrow(/Unknown site/);
		expect(post).not.toHaveBeenCalled();
	});

	// /status answers with the sitemap_health feature, /sitemap/health with the report.
	const healthSite = (report: Record<string, unknown>) =>
		get.mockImplementation(async (path: string) =>
			path === `${NS}/status` ? { version: "1.15.0", features: ["sitemap_health"] } : report,
		);

	it("seo_sitemap_health refuses a site without the sitemap_health feature", async () => {
		get.mockResolvedValue({ version: "1.14.1", features: ["migrate_dry_run"] });
		await expect(tool("seo_sitemap_health").handler({ site: "a" })).rejects.toThrow(/sitemap_health/);
		expect(get).toHaveBeenCalledTimes(1);
		expect(get).toHaveBeenCalledWith(`${NS}/status`);
	});

	it("seo_sitemap_health GETs /sitemap/health with only the given paging params", async () => {
		healthSite({ total: 3, checked: 3, findings: [], truncated: false, next_offset: null });
		await tool("seo_sitemap_health").handler({ site: "a" });
		expect(get).toHaveBeenLastCalledWith(`${NS}/sitemap/health`, {});
		const r = await tool("seo_sitemap_health").handler({ site: "a", limit: 50, offset: 100 });
		expect(get).toHaveBeenLastCalledWith(`${NS}/sitemap/health`, { limit: 50, offset: 100 });
		expect(parse(r).checked).toBe(3);
	});

	it("seo_sitemap_health passes sitemaps as 1/0 and documents sitemaps_pending", async () => {
		healthSite({ checked: 1, sitemaps_pending: false });
		await tool("seo_sitemap_health").handler({ site: "a", offset: 1, sitemaps: true });
		expect(get).toHaveBeenLastCalledWith(`${NS}/sitemap/health`, { offset: 1, sitemaps: 1 });

		let text = "";
		register({
			tool: (name: string, d: string) => {
				if (name === "seo_sitemap_health") text = d;
			},
		} as never);
		expect(text).toMatch(/sitemaps_pending/);
		expect(text).toMatch(/sitemap_timeout/);
		expect(text).toMatch(/next_offset = total/);
	});

	it("seo_sitemap_health only accepts the route's limit range", () => {
		const limit = z.object(tool("seo_sitemap_health").schema).shape.limit;
		expect(limit.safeParse(0).success).toBe(false);
		expect(limit.safeParse(501).success).toBe(false);
		expect(limit.safeParse(500).success).toBe(true);
		expect(z.object(tool("seo_sitemap_health").schema).shape.offset.safeParse(-1).success).toBe(false);
	});

	// Briefing features (cvrt-seo-manager 1.18.0): each route announces itself in /status features.
	const featureSite = (features: string[], report: Record<string, unknown> = {}) =>
		get.mockImplementation(async (path: string) =>
			path === `${NS}/status` ? { version: "1.18.0", features } : report,
		);

	it.each([
		["seo_locations_report", "locations", {}],
		["seo_audit_page", "page_audit", { post_id: 5 }],
		["seo_audit_pages", "page_audit", {}],
	])("%s refuses a site without the %s feature", async (name, feature, args) => {
		get.mockReset();
		get.mockResolvedValue({ version: "1.17.0", features: ["sitemap_health"] });
		await expect(tool(name).handler({ site: "a", ...args })).rejects.toThrow(new RegExp(feature));
		expect(get).toHaveBeenCalledTimes(1);
		expect(get).toHaveBeenCalledWith(`${NS}/status`);
	});

	it("seo_locations_report GETs /locations without params", async () => {
		get.mockReset();
		featureSite(["locations"], { enabled: true, total: 0, locations: [] });
		const r = await tool("seo_locations_report").handler({ site: "a" });
		expect(get).toHaveBeenLastCalledWith(`${NS}/locations`);
		expect(parse(r).enabled).toBe(true);
	});

	it("seo_audit_page rejects both and neither of post_id and url before any request", async () => {
		get.mockReset();
		await expect(tool("seo_audit_page").handler({ site: "a" })).rejects.toThrow(/exactly one of post_id or url/);
		await expect(tool("seo_audit_page").handler({ site: "a", post_id: 5, url: "https://x.test/" })).rejects.toThrow(
			/exactly one of post_id or url/,
		);
		expect(get).not.toHaveBeenCalled();
	});

	it("seo_audit_page GETs /audit/page with post_id or url", async () => {
		get.mockReset();
		featureSite(["page_audit"], { findings: [] });
		await tool("seo_audit_page").handler({ site: "a", post_id: 5 });
		expect(get).toHaveBeenLastCalledWith(`${NS}/audit/page`, { post_id: 5 });
		await tool("seo_audit_page").handler({ site: "a", url: "https://x.test/p/" });
		expect(get).toHaveBeenLastCalledWith(`${NS}/audit/page`, { url: "https://x.test/p/" });
		const postId = z.object(tool("seo_audit_page").schema).shape.post_id;
		for (const bad of [0, 1.5, "5"]) expect(postId.safeParse(bad).success).toBe(false);
		expect(postId.safeParse(5).success).toBe(true);
	});

	it("seo_audit_pages GETs /audit/pages with the given paging only and limits 1-100", async () => {
		get.mockReset();
		featureSite(["page_audit"], { pages: [], truncated: false });
		await tool("seo_audit_pages").handler({ site: "a" });
		expect(get).toHaveBeenLastCalledWith(`${NS}/audit/pages`, {});
		await tool("seo_audit_pages").handler({ site: "a", limit: 50, offset: 100 });
		expect(get).toHaveBeenLastCalledWith(`${NS}/audit/pages`, { limit: 50, offset: 100 });
		const shape = z.object(tool("seo_audit_pages").schema).shape;
		expect(shape.limit.safeParse(0).success).toBe(false);
		expect(shape.limit.safeParse(101).success).toBe(false);
		expect(shape.limit.safeParse(100).success).toBe(true);
		expect(shape.offset.safeParse(-1).success).toBe(false);
		let text = "";
		register({
			tool: (name: string, d: string) => {
				if (name === "seo_audit_pages") text = d;
			},
		} as never);
		expect(text).toMatch(/next_offset/);
		expect(text).toMatch(/truncated/);
	});

	it("seo_update_post_seo passes location and faq only when given", async () => {
		put.mockReset();
		put.mockResolvedValue({});
		await tool("seo_update_post_seo").handler({ site: "a", id: 5, title: "T" });
		expect(put).toHaveBeenLastCalledWith(`${NS}/posts/5/seo`, { title: "T" });
		const faq = [{ question: "Q?", answer: "<p>A</p>" }];
		await tool("seo_update_post_seo").handler({ site: "a", id: 5, location: { name: "Mainz" }, faq });
		expect(put).toHaveBeenLastCalledWith(`${NS}/posts/5/seo`, { location: { name: "Mainz" }, faq });
		await tool("seo_update_post_seo").handler({ site: "a", id: 5, location: null, faq: null });
		expect(put).toHaveBeenLastCalledWith(`${NS}/posts/5/seo`, { location: null, faq: null });
	});

	it("seo_import_migrate sends source and the given flags only", async () => {
		post.mockResolvedValue({});
		await tool("seo_import_migrate").handler({ site: "a", source: "rankmath", settings: true });
		expect(post).toHaveBeenCalledWith(`${NS}/import/migrate`, { source: "rankmath", settings: true });
	});

	it("seo_import_migrate refuses a per-post dry run on a site that would write (no migrate_dry_run feature)", async () => {
		get.mockResolvedValue({ version: "1.14.1" });
		await expect(tool("seo_import_migrate").handler({ site: "a", source: "rankmath", dry_run: true })).rejects.toThrow(
			/would WRITE/,
		);
		expect(get).toHaveBeenCalledWith(`${NS}/status`);
		expect(post).not.toHaveBeenCalled();
	});

	it("seo_import_migrate does not ask /status for a settings run or a Yoast import", async () => {
		post.mockResolvedValue({ written: {}, skipped: [], dry_run: true });
		await tool("seo_import_migrate").handler({ site: "a", source: "rankmath", settings: true, dry_run: true });
		await tool("seo_import_migrate").handler({ site: "a", source: "rankmath", settings: true });
		await tool("seo_import_migrate").handler({ site: "a", source: "yoast" });
		expect(get).not.toHaveBeenCalled();
	});

	it("seo_import_migrate refuses a real RankMath import on a plugin without migrate_external_targets", async () => {
		// Up to 1.14.1 the import stored sources without slash and foreign targets
		// enabled (cavort-it.systems: 8 rules to a gone staging host).
		get.mockResolvedValue({ version: "1.14.1", features: ["migrate_dry_run"] });
		await expect(tool("seo_import_migrate").handler({ site: "a", source: "rankmath" })).rejects.toThrow(
			/Update cvrt-seo-manager first/,
		);
		await expect(tool("seo_import_migrate").handler({ site: "a", source: "rankmath", dry_run: false })).rejects.toThrow(
			/migrate_external_targets/,
		);
		expect(post).not.toHaveBeenCalled();
	});

	it("seo_import_migrate tells a 1.14.1 site that only a settings dry run works there", async () => {
		// Every released plugin up to 1.14.1 lacks both features: the per-post
		// dry run is refused too, so the message must not offer it.
		get.mockResolvedValue({ version: "1.14.1" });
		const error = await tool("seo_import_migrate")
			.handler({ site: "a", source: "rankmath" })
			.catch((e: Error) => e);
		expect((error as Error).message).toMatch(/only a settings dry run \(settings=true, dry_run=true\)/);
		expect((error as Error).message).not.toMatch(/A dry run \(dry_run=true\) is still allowed/);
		expect(post).not.toHaveBeenCalled();
	});

	it("seo_import_migrate still allows a dry run on such a plugin", async () => {
		get.mockResolvedValue({ version: "1.14.1", features: ["migrate_dry_run"] });
		post.mockResolvedValue({ dry_run: true, changes: [] });
		await tool("seo_import_migrate").handler({ site: "a", source: "rankmath", dry_run: true });
		expect(post).toHaveBeenCalledWith(`${NS}/import/migrate`, { source: "rankmath", dry_run: true });
	});

	it("seo_import_migrate runs a real RankMath import on a plugin that announces the feature", async () => {
		get.mockResolvedValue({ version: "1.15.0", features: ["migrate_dry_run", "migrate_external_targets"] });
		post.mockResolvedValue({ warnings: [] });
		await tool("seo_import_migrate").handler({ site: "a", source: "rankmath" });
		expect(get).toHaveBeenCalledWith(`${NS}/status`);
		expect(post).toHaveBeenCalledWith(`${NS}/import/migrate`, { source: "rankmath" });
	});

	it("seo_import_migrate passes dry_run through for the per-post pass and says so", async () => {
		get.mockResolvedValue({ version: "1.14.1", features: ["migrate_dry_run", "sitemap_health"] });
		post.mockResolvedValue({ dry_run: true, changes: [], unsupported: [] });
		await tool("seo_import_migrate").handler({ site: "a", source: "rankmath", dry_run: true });
		expect(post).toHaveBeenCalledWith(`${NS}/import/migrate`, { source: "rankmath", dry_run: true });

		let text = "";
		register({
			tool: (name: string, d: string) => {
				if (name === "seo_import_migrate") text = d;
			},
		} as never);
		expect(text).not.toMatch(/not honoured|Ignored for the meta/);
		expect(text).toMatch(/changes/);
	});

	it("seo_import_migrate passes allow_external_targets through to a site that honours it", async () => {
		get.mockResolvedValue({ version: "1.15.0", features: ["migrate_dry_run", "migrate_external_targets"] });
		post.mockResolvedValue({ warnings: [] });
		await tool("seo_import_migrate").handler({ site: "a", source: "rankmath", allow_external_targets: true });
		expect(post).toHaveBeenCalledWith(`${NS}/import/migrate`, { source: "rankmath", allow_external_targets: true });
	});

	it("seo_import_migrate refuses allow_external_targets on a site that would ignore it", async () => {
		get.mockResolvedValue({ version: "1.14.1", features: ["migrate_dry_run"] });
		await expect(
			tool("seo_import_migrate").handler({ site: "a", source: "rankmath", allow_external_targets: true }),
		).rejects.toThrow(/migrate_external_targets/);
		expect(post).not.toHaveBeenCalled();
	});

	it("seo_import_migrate passes own_hosts through to a site that honours it", async () => {
		get.mockResolvedValue({ version: "1.15.0", features: ["migrate_dry_run", "migrate_external_targets"] });
		post.mockResolvedValue({ warnings: [] });
		await tool("seo_import_migrate").handler({
			site: "a",
			source: "rankmath",
			dry_run: true,
			own_hosts: ["b3zbr2.myrdbx.io"],
		});
		expect(post).toHaveBeenCalledWith(`${NS}/import/migrate`, {
			source: "rankmath",
			dry_run: true,
			own_hosts: ["b3zbr2.myrdbx.io"],
		});
	});

	it("seo_import_migrate refuses own_hosts on a site that would ignore it", async () => {
		get.mockResolvedValue({ version: "1.14.1", features: ["migrate_dry_run"] });
		await expect(
			tool("seo_import_migrate").handler({ site: "a", source: "rankmath", dry_run: true, own_hosts: ["old.example"] }),
		).rejects.toThrow(/own_hosts/);
		expect(post).not.toHaveBeenCalled();
	});

	it("seo_import_migrate documents warnings and the disabled import", () => {
		let text = "";
		register({
			tool: (name: string, d: string) => {
				if (name === "seo_import_migrate") text = d;
			},
		} as never);
		expect(text).toMatch(/warnings/);
		expect(text).toMatch(/disabled/);
		expect(text).toMatch(/allow_external_targets/);
	});

	it("seo_redirects_audit reads the audit on a site that has it", async () => {
		get.mockResolvedValueOnce({ version: "1.15.0", features: ["redirect_audit"] });
		get.mockResolvedValueOnce({ normalised: true, findings: [], known_hosts: [] });
		const result = await tool("seo_redirects_audit").handler({ site: "a" });
		expect(get).toHaveBeenLastCalledWith(`${NS}/redirects/audit`);
		expect(JSON.stringify(result)).toMatch(/normalised/);
	});

	it("seo_redirects_audit and seo_redirects_known_hosts refuse a site without the audit", async () => {
		get.mockResolvedValue({ version: "1.14.1", features: ["migrate_dry_run"] });
		await expect(tool("seo_redirects_audit").handler({ site: "a" })).rejects.toThrow(/redirect_audit/);
		await expect(tool("seo_redirects_known_hosts").handler({ site: "a", known_hosts: ["partner.de"] })).rejects.toThrow(
			/redirect_audit/,
		);
		expect(post).not.toHaveBeenCalled();
	});

	it("seo_redirects_known_hosts replaces the confirmed hosts", async () => {
		get.mockResolvedValue({ version: "1.15.0", features: ["redirect_audit"] });
		post.mockResolvedValue({ findings: [], known_hosts: ["partner.de"] });
		await tool("seo_redirects_known_hosts").handler({ site: "a", known_hosts: ["partner.de"] });
		expect(post).toHaveBeenCalledWith(`${NS}/redirects/audit`, { known_hosts: ["partner.de"] });

		let text = "";
		register({
			tool: (name: string, d: string) => {
				if (name === "seo_redirects_known_hosts") text = d;
			},
		} as never);
		expect(text).toMatch(/replaces/i);
		expect(text).toMatch(/external_target_host/);
	});

	it("seo_update_settings documents the 400 for unknown keys and ignored_removed", () => {
		let text = "";
		register({
			tool: (name: string, d: string) => {
				if (name === "seo_update_settings") text = d;
			},
		} as never);
		expect(text).toMatch(/csm_unknown_setting/);
		expect(text).toMatch(/ignored_removed/);
		expect(text).not.toMatch(/unknown keys are ignored\)/);
	});

	it("seo_redirects_audit documents the chain and loop codes with their fields", () => {
		let text = "";
		register({
			tool: (name: string, d: string) => {
				if (name === "seo_redirects_audit") text = d;
			},
		} as never);
		expect(text).toMatch(/redirect_chain/);
		expect(text).toMatch(/redirect_loop/);
		expect(text).toMatch(/hops/);
		expect(text).toMatch(/truncated/);
		expect(text).toMatch(/final/);
	});

	it("seo_status documents features, which seo_import_migrate relies on", () => {
		let text = "";
		register({
			tool: (name: string, d: string) => {
				if (name === "seo_status") text = d;
			},
		} as never);
		expect(text).toMatch(/features/);
		expect(text).toMatch(/migrate_dry_run/);
	});

	it("seo_sitemap_health documents build_ms and the per-call progress", () => {
		let text = "";
		register({
			tool: (name: string, d: string) => {
				if (name === "seo_sitemap_health") text = d;
			},
		} as never);
		expect(text).toMatch(/build_ms/);
		expect(text).toMatch(/at least one URL/);
	});

	it("seo_import_settings returns the { imported, skipped } report as is", async () => {
		post.mockResolvedValue({ imported: 1, skipped: { csm_kg_logo: "too small" } });
		const r = await tool("seo_import_settings").handler({ site: "a", data: { csm_kg_name: "X" } });
		expect(parse(r)).toEqual({ imported: 1, skipped: { csm_kg_logo: "too small" } });
	});

	it("seo_import_settings documents the skipped-keys report", () => {
		let text = "";
		register({
			tool: (name: string, d: string) => {
				if (name === "seo_import_settings") text = d;
			},
		} as never);
		expect(text).toMatch(/skipped/);
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
