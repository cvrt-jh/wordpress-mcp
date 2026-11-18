/**
 * Response slimming - reduce WordPress API verbosity
 * WordPress REST API returns ~5-10KB per post, we slim to ~500 bytes
 *
 * Inputs are untyped REST payloads (`unknown`); the helpers below narrow each
 * field instead of casting to `any`.
 */

type Raw = Record<string, unknown>;
type Slim = Record<string, unknown>;

const rec = (v: unknown): Raw => (v !== null && typeof v === "object" ? (v as Raw) : {});

/** WordPress wraps text as `{ rendered }`; some contexts send the bare string. */
const rendered = (v: unknown): unknown => rec(v).rendered || v;

/** Strip HTML tags from a string; anything else is empty. */
const stripTags = (v: unknown): string => (typeof v === "string" ? v.replace(/<[^>]*>/g, "") : "");

/** Strip tags from `{ rendered }` text, trim, cut to `max` characters. */
const excerpt = (v: unknown, max: number): string => stripTags(rec(v).rendered).trim().slice(0, max);

export function slimPost(raw: unknown): Slim {
	const post = rec(raw);
	return {
		id: post.id,
		title: rendered(post.title),
		slug: post.slug,
		status: post.status,
		date: post.date,
		modified: post.modified,
		link: post.link,
		excerpt: excerpt(post.excerpt, 200),
		author: post.author,
		categories: post.categories,
		tags: post.tags,
		featured_media: post.featured_media || null,
	};
}

export function slimPage(raw: unknown): Slim {
	const page = rec(raw);
	return {
		id: page.id,
		title: rendered(page.title),
		slug: page.slug,
		status: page.status,
		date: page.date,
		modified: page.modified,
		link: page.link,
		parent: page.parent || 0,
		menu_order: page.menu_order || 0,
	};
}

export function slimUser(raw: unknown): Slim {
	const user = rec(raw);
	return {
		id: user.id,
		name: user.name,
		slug: user.slug,
		email: user.email,
		roles: user.roles,
	};
}

export function slimMedia(raw: unknown): Slim {
	const media = rec(raw);
	return {
		id: media.id,
		title: rendered(media.title),
		source_url: media.source_url,
		mime_type: media.mime_type,
		alt_text: media.alt_text || "",
		date: media.date,
	};
}

export function slimPlugin(raw: unknown): Slim {
	const plugin = rec(raw);
	// Plugin key is like "akismet/akismet.php"
	return {
		plugin: plugin.plugin,
		name: plugin.name,
		status: plugin.status,
		version: plugin.version,
		author: stripTags(plugin.author),
	};
}

export function slimTheme(raw: unknown): Slim {
	const theme = rec(raw);
	return {
		stylesheet: theme.stylesheet,
		name: rendered(theme.name),
		status: theme.status,
		version: theme.version,
		author: stripTags(rec(theme.author).rendered) || theme.author || "",
	};
}

export function slimComment(raw: unknown): Slim {
	const comment = rec(raw);
	return {
		id: comment.id,
		post: comment.post,
		author_name: comment.author_name,
		content: excerpt(comment.content, 300),
		date: comment.date,
		status: comment.status,
	};
}

export function slimCategory(raw: unknown): Slim {
	const cat = rec(raw);
	return {
		id: cat.id,
		name: cat.name,
		slug: cat.slug,
		parent: cat.parent || 0,
		count: cat.count || 0,
	};
}

export function slimTag(raw: unknown): Slim {
	const tag = rec(raw);
	return {
		id: tag.id,
		name: tag.name,
		slug: tag.slug,
		count: tag.count || 0,
	};
}

export function slimSiteInfo(raw: unknown): Slim {
	const info = rec(raw);
	return {
		name: info.name,
		description: info.description,
		url: info.url,
		home: info.home,
		timezone: info.timezone_string || info.gmt_offset,
		namespaces: Array.isArray(info.namespaces) ? info.namespaces.length : 0,
	};
}
