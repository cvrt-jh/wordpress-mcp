/**
 * The tool catalog: one section per tool module, in registration order.
 *
 * `registerAll` (register.ts) registers exactly these sections, and the README
 * tool lists are generated from them (`pnpm run sync-docs`), so the README and
 * the real tool set cannot drift apart: tool-catalog.test.ts fails when the
 * README block, a tool count in README.md, or the server.json count differs
 * from what is registered.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { register as registerComments } from "./tools/comments.js";
import { register as registerCvrtMedia } from "./tools/cvrt-media.js";
import { register as registerFields } from "./tools/fields.js";
import { register as registerFort } from "./tools/fort.js";
import { register as registerFulfillment } from "./tools/fulfillment.js";
import { register as registerLang } from "./tools/lang.js";
import { register as registerLegal } from "./tools/legal.js";
import { register as registerAcf } from "./tools/mcp-acf.js";
import { register as registerMcpCore } from "./tools/mcp-core.js";
import { register as registerMcpCpt } from "./tools/mcp-cpt.js";
import { register as registerMcpDatabase } from "./tools/mcp-database.js";
import { register as registerMcpElementor } from "./tools/mcp-elementor.js";
import { register as registerMcpHealth } from "./tools/mcp-health.js";
import { register as registerMcpMedia } from "./tools/mcp-media.js";
import { register as registerMcpMenus } from "./tools/mcp-menus.js";
import { register as registerMcpOptions } from "./tools/mcp-options.js";
import { register as registerMcpPlugins } from "./tools/mcp-plugins.js";
import { register as registerMcpTaxonomies } from "./tools/mcp-taxonomies.js";
import { register as registerMcpThemes } from "./tools/mcp-themes.js";
import { register as registerMcpUsers } from "./tools/mcp-users.js";
import { register as registerMcpWidgets } from "./tools/mcp-widgets.js";
import { register as registerWoo } from "./tools/mcp-woo.js";
import { register as registerMedia } from "./tools/media.js";
import { register as registerPages } from "./tools/pages.js";
import { register as registerPlugins } from "./tools/plugins.js";
import { register as registerPosts } from "./tools/posts.js";
import { register as registerSeo } from "./tools/seo.js";
import { register as registerSite } from "./tools/site.js";
import { register as registerSites } from "./tools/sites.js";
import { register as registerStripe } from "./tools/stripe.js";
import { register as registerTaxonomies } from "./tools/taxonomies.js";
import { register as registerThemes } from "./tools/themes.js";
import { register as registerUsers } from "./tools/users.js";
import { register as registerWooHelper } from "./tools/woo-helper.js";

export interface Section {
	title: string;
	/** What the tools need on the site; rendered under the heading. */
	requires: string;
	/** Optional caveat rendered under the requirement line (things the summaries cannot say). */
	note?: string;
	register: (server: McpServer) => void;
}

export interface ToolInfo {
	name: string;
	description: string;
}

const CORE = "any WordPress site (core REST API, `wp/v2`)";
const MCPE = "the cvrt-mcp-endpoints mu-plugin";

export const SECTIONS: Section[] = [
	{ title: "Sites", requires: "nothing (reads `WORDPRESS_SITES`; no `site` argument)", register: registerSites },
	{ title: "Site", requires: CORE, register: registerSite },
	{ title: "Posts", requires: CORE, register: registerPosts },
	{ title: "Pages", requires: CORE, register: registerPages },
	{ title: "Users", requires: CORE, register: registerUsers },
	{ title: "Plugins", requires: CORE, register: registerPlugins },
	{ title: "Themes", requires: CORE, register: registerThemes },
	{ title: "Media", requires: CORE, register: registerMedia },
	{ title: "Categories & Tags", requires: CORE, register: registerTaxonomies },
	{ title: "Comments", requires: CORE, register: registerComments },
	{ title: "Plugin Management", requires: MCPE, register: registerMcpPlugins },
	{ title: "Theme Management", requires: MCPE, register: registerMcpThemes },
	{ title: "Core Management", requires: MCPE, register: registerMcpCore },
	{ title: "Database Management", requires: MCPE, register: registerMcpDatabase },
	{ title: "Options Management", requires: MCPE, register: registerMcpOptions },
	{ title: "Menu Management", requires: MCPE, register: registerMcpMenus },
	{ title: "Widget Management", requires: MCPE, register: registerMcpWidgets },
	{ title: "Health & Diagnostics", requires: MCPE, register: registerMcpHealth },
	{ title: "Custom Post Types", requires: MCPE, register: registerMcpCpt },
	{ title: "Taxonomies and Terms", requires: MCPE, register: registerMcpTaxonomies },
	{ title: "Users and Roles (extended)", requires: MCPE, register: registerMcpUsers },
	{ title: "Media Library (extended)", requires: MCPE, register: registerMcpMedia },
	{ title: "Elementor", requires: `${MCPE} and Elementor`, register: registerMcpElementor },
	{ title: "ACF", requires: "wp-pilot-pro and ACF", register: registerAcf },
	{ title: "WooCommerce", requires: "wp-pilot-pro and WooCommerce", register: registerWoo },
	{
		title: "Order Fulfillment",
		requires: "cvrt-order-fulfillment 0.2.0+",
		register: registerFulfillment,
	},
	{
		title: "Legal",
		requires:
			"[cvrt-legal](https://github.com/cvrt-gmbh/cvrt-legal) (`legal_get_page` / `legal_link_page` need 0.4.2+, `legal_consent_log_*` 0.5.0+, social 0.6.0+, generator and facts 0.7.0+, accessibility 0.8.0+)",
		register: registerLegal,
	},
	{
		title: "Media Optimization",
		requires:
			"[cvrt-media](https://github.com/cvrt-gmbh/cvrt-media) 0.1.0+ (`media_get_recovery` / `media_retry_recovery` need 0.1.1+); separate from the cvrt-mcp-endpoints `mcp_*_media` tools (library management)",
		note: "File replace is not a tool (it needs an upload; use WP-CLI).",
		register: registerCvrtMedia,
	},
	{
		title: "Fields",
		requires:
			"[cvrt-fields](https://github.com/cvrt-gmbh/cvrt-fields) 0.1.2+ (`fields_get_values` / `fields_update_values` need 0.2.1+, `compat_acf_functions` / `shortcode_options_pages` in `fields_update_settings` 0.4.0+)",
		register: registerFields,
	},
	{
		title: "SEO",
		requires: "[cvrt-seo-manager](https://github.com/cvrt-gmbh/cvrt-seo-manager)",
		register: registerSeo,
	},
	{
		title: "Language (machine translation)",
		requires:
			"[cvrt-lang](https://github.com/cvrt-gmbh/cvrt-lang) with machine translation (Azure AI Translator); `lang_list_pending` / `lang_submit_translations` / `lang_fail_job` are the external queue for manual or agent use (no recurring job). No tool sets the provider key: use the fort constant or the admin",
		register: registerLang,
	},
	{ title: "Fort (Bearfort)", requires: "`BEARFORT_API_KEY` (Bearfort API, not the site)", register: registerFort },
	{ title: "WooCommerce Helper", requires: "cvrt-woo-helper", register: registerWooHelper },
	{ title: "Stripe and Payments", requires: "cvrt-mcp-endpoints 1.17.0+", register: registerStripe },
];

/** The tools one register function adds, in registration order. */
export function collect(register: (server: McpServer) => void): ToolInfo[] {
	const out: ToolInfo[] = [];
	register({
		tool: (name: string, description: string) => {
			out.push({ name, description });
		},
	} as never);
	return out;
}

export function totalTools(sections: Section[] = SECTIONS): number {
	return sections.reduce((n, s) => n + collect(s.register).length, 0);
}

/** First sentence of a tool description, cut at a word boundary. */
export function summary(description: string, max = 200): string {
	const flat = description.replace(/\s+/g, " ").trim();
	const sentence = flat.split(/(?<!\be\.g|\bi\.e)(?<=[a-z0-9)`])\.\s+(?=[A-Z])/)[0].replace(/\.$/, "");
	if (sentence.length <= max) return sentence;
	return `${sentence.slice(0, max).replace(/\s+\S*$/, "")} ...`;
}

export const BLOCK_START = "<!-- tools:start (generated by `pnpm run sync-docs`, do not edit) -->";
export const BLOCK_END = "<!-- tools:end -->";

/** The generated README tool lists, markers included. */
export function renderTools(sections: Section[] = SECTIONS): string {
	const parts: string[] = [BLOCK_START, ""];
	for (const section of sections) {
		const tools = collect(section.register);
		parts.push(`### ${section.title} (${tools.length})`, "", `Requires ${section.requires}.`, "");
		if (section.note) parts.push(section.note, "");
		for (const t of tools) parts.push(`- \`${t.name}\` - ${summary(t.description)}`);
		parts.push("");
	}
	parts.push(BLOCK_END);
	return parts.join("\n");
}
