import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { defined, jsonResult } from "../types.js";
import { slimPost } from "../slim.js";

/**
 * Query params for a wp/v2 GET: undefined dropped, arrays as a comma list
 * (WP parses list params with wp_parse_list), booleans as "true"/"false".
 */
export function toQuery(obj: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) out[k] = v.join(",");
    else if (typeof v === "boolean") out[k] = v ? "true" : "false";
    else if (typeof v === "number" || typeof v === "string") out[k] = v;
  }
  return out;
}

const ids = (what: string) => z.array(z.number().int()).optional().describe(what);

/** Statuses a post/page can be written with (get_post_stati internal=false). */
export const WriteStatusSchema = z.enum(["publish", "future", "draft", "pending", "private"]);

/** Statuses a post/page collection can be filtered by (array, default publish). */
export const ListStatusSchema = z
  .array(z.enum(["publish", "future", "draft", "pending", "private", "trash", "auto-draft", "inherit", "any"]))
  .optional()
  .describe("Limit to one or more statuses (default publish; 'any' = all except trash/auto-draft)");

/** Collection filters shared by wp/v2 posts, pages and media (WP_REST_Posts_Controller::get_collection_params). */
export const postCollectionParams = {
  page: z.number().int().optional().default(1).describe("Page number"),
  offset: z.number().int().optional().describe("Skip this many items (overrides page)"),
  search: z.string().optional().describe("Search term"),
  search_columns: z
    .array(z.enum(["post_title", "post_content", "post_excerpt"]))
    .optional()
    .describe("Columns to search (default title, excerpt and content)"),
  search_semantics: z.enum(["exact"]).optional().describe("'exact' matches the search term as a whole phrase"),
  author: ids("Limit to these author user IDs"),
  author_exclude: ids("Exclude these author user IDs"),
  include: ids("Limit to these IDs"),
  exclude: ids("Exclude these IDs"),
  slug: z.array(z.string()).optional().describe("Limit to these slugs"),
  after: z.string().optional().describe("Published after this ISO8601 date"),
  before: z.string().optional().describe("Published before this ISO8601 date"),
  modified_after: z.string().optional().describe("Modified after this ISO8601 date"),
  modified_before: z.string().optional().describe("Modified before this ISO8601 date"),
  order: z.enum(["asc", "desc"]).optional().default("desc").describe("Sort direction"),
};

/** Writable fields shared by posts and pages (WP_REST_Posts_Controller::get_item_schema). */
export const postWriteFields = {
  content: z.string().optional().describe("Content (HTML / block markup, stored raw)"),
  excerpt: z.string().optional().describe("Excerpt"),
  slug: z.string().optional().describe("URL slug"),
  date: z.string().optional().describe("Publish date in the site timezone (ISO8601); a future date with status publish schedules it"),
  date_gmt: z.string().optional().describe("Publish date in GMT (ISO8601)"),
  author: z.number().int().optional().describe("Author user ID"),
  featured_media: z.number().int().optional().describe("Featured image media ID (0 removes it)"),
  template: z.string().optional().describe("Theme template file, e.g. 'page-full-width.php' ('' = default)"),
  comment_status: z.enum(["open", "closed"]).optional().describe("Whether comments are open"),
  ping_status: z.enum(["open", "closed"]).optional().describe("Whether pingbacks/trackbacks are open"),
  password: z.string().optional().describe("Password to protect the content ('' removes protection); write-only, never returned"),
  meta: z.record(z.string(), z.unknown()).optional().describe("Registered meta fields (show_in_rest) as key/value"),
};

const postOnlyFields = {
  categories: ids("Category IDs (replaces the current set)"),
  tags: ids("Tag IDs (replaces the current set)"),
  sticky: z.boolean().optional().describe("Stick the post to the front page"),
  format: z
    .enum(["standard", "aside", "chat", "gallery", "link", "image", "quote", "status", "video", "audio"])
    .optional()
    .describe("Post format"),
};

/** Raw stored content when the response has it (context=edit), otherwise the rendered HTML. */
export function contentOf(item: Record<string, unknown>): string {
  const c = item.content as { raw?: string; rendered?: string } | undefined;
  return c?.raw ?? c?.rendered ?? "";
}

export function register(server: McpServer) {
  // List posts
  server.tool(
    "wp_list_posts",
    "List WordPress posts with optional filters",
    {
      site: z.string().describe("Site id (see list_sites)"),
      per_page: z.number().int().optional().default(10).describe("Posts per page (max 100)"),
      ...postCollectionParams,
      status: ListStatusSchema,
      categories: ids("Limit to posts in any of these category IDs"),
      categories_exclude: ids("Exclude posts in these category IDs"),
      tags: ids("Limit to posts with any of these tag IDs"),
      tags_exclude: ids("Exclude posts with these tag IDs"),
      tax_relation: z.enum(["AND", "OR"]).optional().describe("How categories and tags filters combine (default AND)"),
      sticky: z.boolean().optional().describe("true = only sticky posts, false = only non-sticky"),
      ignore_sticky: z.boolean().optional().describe("Do not move sticky posts to the top (WP default true)"),
      format: z
        .array(z.enum(["standard", "aside", "chat", "gallery", "link", "image", "quote", "status", "video", "audio"]))
        .optional()
        .describe("Limit to these post formats"),
      orderby: z
        .enum(["author", "date", "id", "include", "modified", "parent", "relevance", "slug", "include_slugs", "title"])
        .optional()
        .default("date")
        .describe("Sort field"),
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const posts = await wp.get<unknown[]>("/wp/v2/posts", toQuery(params));
      return jsonResult(posts.map(slimPost));
    }
  );

  // Get single post
  server.tool(
    "wp_get_post",
    "Get a single post by ID (content, when requested, is the raw stored markup)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().int().describe("Post ID"),
      content: z.boolean().optional().default(false).describe("Include the full content (raw block markup, safe to edit and send back)"),
    },
    async ({ site, id, content }) => {
      const wp = forSite(site);
      const post = await wp.get<Record<string, unknown>>(`/wp/v2/posts/${id}`, { context: "edit" });
      const result = slimPost(post);
      if (content && post.content) result.content = contentOf(post);
      return jsonResult(result);
    }
  );

  // Create post
  server.tool(
    "wp_create_post",
    "Create a new WordPress post",
    {
      site: z.string().describe("Site id (see list_sites)"),
      title: z.string().describe("Post title"),
      status: WriteStatusSchema.optional().default("draft").describe("Post status (default draft)"),
      ...postWriteFields,
      ...postOnlyFields,
    },
    async ({ site, ...params }) => {
      const wp = forSite(site);
      const post = await wp.post<Record<string, unknown>>("/wp/v2/posts", defined(params));
      return jsonResult(slimPost(post));
    }
  );

  // Update post
  server.tool(
    "wp_update_post",
    "Update an existing post (only the given fields change)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().int().describe("Post ID"),
      title: z.string().optional().describe("Post title"),
      status: WriteStatusSchema.optional().describe("Post status"),
      ...postWriteFields,
      ...postOnlyFields,
    },
    async ({ site, id, ...params }) => {
      const wp = forSite(site);
      const post = await wp.put<Record<string, unknown>>(`/wp/v2/posts/${id}`, defined(params));
      return jsonResult(slimPost(post));
    }
  );

  // Delete post
  server.tool(
    "wp_delete_post",
    "Delete a post (moves to trash, or permanently if force=true)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      id: z.number().int().describe("Post ID"),
      force: z.boolean().optional().default(false).describe("Bypass trash and delete permanently"),
    },
    async ({ site, id, force }) => {
      const wp = forSite(site);
      const result = await wp.delete<Record<string, unknown>>(`/wp/v2/posts/${id}`, { force: force ? 1 : 0 });
      // force: {deleted, previous}; trash: the trashed post itself.
      return jsonResult({ deleted: !!force, trashed: !force, id, previous: slimPost(result.previous || result) });
    }
  );

  // Search posts
  server.tool(
    "wp_search_posts",
    "Search posts by keyword (shortcut; wp_list_posts has every filter)",
    {
      site: z.string().describe("Site id (see list_sites)"),
      search: z.string().describe("Search term"),
      per_page: z.number().int().optional().default(10).describe("Results per page (max 100)"),
      page: z.number().int().optional().default(1).describe("Page number"),
    },
    async ({ site, search, per_page, page }) => {
      const wp = forSite(site);
      const posts = await wp.get<unknown[]>("/wp/v2/posts", { search, per_page, page });
      return jsonResult(posts.map(slimPost));
    }
  );
}
