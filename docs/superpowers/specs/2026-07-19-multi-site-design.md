# Multi-site wordpress-mcp — Design

**Status:** approved (2026-07-19)
**Package:** `@cavort-it-systems/wordpress-mcp` — breaking change → **v3.0.0**

## Goal

Let one wordpress-mcp server manage multiple WordPress sites. Sites are defined in a single `WORDPRESS_SITES` env var (JSON array). Every tool call names its target `site` explicitly. Also repoint the plugin activate/deactivate/delete tools from the core `wp/v2/plugins` route (often host-blocked) to the `cvrt-mcp-endpoints` `mcp/v1` routes.

## Non-goals (YAGNI)

- No capability discovery (probing which sites have cvrt-mcp-endpoints).
- No per-site GitHub token field.
- No "active site" state — `site` is mandatory per call, never implicit.
- No backward compatibility with `WORDPRESS_SITE_URL/USERNAME/PASSWORD` (removed).
- No integration tests against a live WP; unit-test the registry + client factory only.

## Architecture

Three layers, one new module:

1. **`src/sites.ts` (new)** — the site registry. Parses and validates `WORDPRESS_SITES` once at startup.
2. **`src/client.ts` (refactor)** — a `forSite(id)` factory returning `{get, post, put, delete}` bound to that site's URL + auth.
3. **`src/tools/*.ts` (edit all)** — every tool gains a mandatory `site` param and resolves `const wp = forSite(site)` at the top of its handler.

Plus a new **`list_sites`** tool and updated **config** + **docs**.

## Component 1: Site registry (`src/sites.ts`)

```ts
export interface Site {
  id: string;
  url: string;       // http(s), trailing slash tolerated
  username: string;
  password: string;  // WordPress application password
}

// Parsed once at module load from process.env.WORDPRESS_SITES.
export function getSite(id: string): Site;      // throws if unknown
export function listSites(): Array<{ id: string; url: string }>;  // no passwords
```

**Parsing + validation (at first access / startup):**
- `WORDPRESS_SITES` must be present and parse as a JSON array. Missing or non-JSON → throw `WORDPRESS_SITES env var must be a JSON array of sites`.
- Array must be non-empty.
- Each entry must have non-empty string `id`, `url`, `username`, `password`. Missing field → throw naming the offending index/id.
- `url` must start with `http://` or `https://`.
- `id` values must be unique → throw on duplicates.
- Result cached in a `Map<string, Site>`.

**`getSite(id)`** throws `Unknown site "<id>". Available: <id1>, <id2>, ...` when the id is not in the map. This is the single fail-fast validation point — it runs before any HTTP request.

**`listSites()`** returns `{id, url}` only. Passwords are never returned or logged.

## Component 2: Client factory (`src/client.ts`)

Replaces the four module-level functions (`wpGet/wpPost/wpPut/wpDelete`) and the `SITE_URL/USERNAME/PASSWORD` constants.

```ts
export function forSite(siteId: string): SiteClient {
  const site = getSite(siteId);  // throws before any fetch if unknown
  const base = site.url.replace(/\/$/, "");
  const auth = "Basic " + Buffer.from(`${site.username}:${site.password}`).toString("base64");
  return {
    get<T>(endpoint: string, params?: Record<string, string | number>): Promise<T> { ... },
    post<T>(endpoint: string, body: Record<string, unknown>): Promise<T> { ... },
    put<T>(endpoint: string, body: Record<string, unknown>): Promise<T> { ... },
    delete<T>(endpoint: string, params?: Record<string, string | number>): Promise<T> { ... },
  };
}
```

- Fetch logic, header building, and error handling (`throw new Error(WordPress API error ${status}: ${text})`) are identical to today's functions — only the base URL + auth source change.
- `getSiteUrl()` (used by a few tools for display) is removed; callers use `getSite(id).url` or the value already in scope.

## Component 3: Tools (`src/tools/*.ts`, all ~25 files)

Every tool:
1. Adds `site: z.string().describe("Site id (see list_sites)")` as the first schema field.
2. Starts its handler with `const wp = forSite(site);`.
3. Replaces `wpGet(` → `wp.get(`, `wpPost(` → `wp.post(`, `wpPut(` → `wp.put(`, `wpDelete(` → `wp.delete(`.

Mechanical and uniform across ~225 call sites. No other logic changes.

### New tool: `list_sites`

Registered in `src/index.ts` (or a small `src/tools/sites.ts`). No `site` param. Returns `listSites()` so the caller can discover valid ids. Its description states that every other tool requires a `site` argument.

### Repointed plugin lifecycle tools (`src/tools/plugins.ts`)

- `wp_activate_plugin`: `PUT /wp/v2/plugins/{slug} {status:active}` → `POST /mcp/v1/plugins/activate {plugin}`.
- `wp_deactivate_plugin`: `PUT /wp/v2/plugins/{slug} {status:inactive}` → `POST /mcp/v1/plugins/deactivate {plugin}`.
- `wp_delete_plugin`: `DELETE /wp/v2/plugins/{slug}` → `POST /mcp/v1/plugins/delete {plugin}`.

These now take the plugin **file path** (e.g. `akismet/akismet.php`), matching the mcp/v1 routes, instead of the core-route slug. Update each tool's `plugin` param description accordingly. (Requires `cvrt-mcp-endpoints` v1.10.0+ on the target site — already the case on our sites.)

## Error handling

- Bad `WORDPRESS_SITES` (missing/malformed/duplicate/incomplete) → throws at startup with a specific message; the server never starts in a half-configured state.
- Unknown `site` on any call → `forSite` throws `Unknown site "x". Available: ...` before any HTTP, surfaced to the caller as the tool error.
- HTTP errors from WordPress → unchanged (`WordPress API error <status>: <body>`).
- Passwords never appear in errors, logs, or `list_sites`.

## Testing (add Vitest)

Add `vitest` + a `test` script (no framework today). Unit tests only — the parts with real logic:

**`sites.test.ts`:**
- Valid array → `getSite` returns the right site; `listSites` lists all ids/urls.
- Missing `WORDPRESS_SITES` → throws.
- Non-JSON / non-array → throws.
- Empty array → throws.
- Entry missing a field (each of id/url/username/password) → throws naming the entry.
- Non-http url → throws.
- Duplicate ids → throws.
- Unknown id in `getSite` → throws with the available list.
- `listSites()` output contains no `password` field.

**`client.test.ts`:**
- `forSite(validId)` builds base URL (trailing slash stripped) + correct Basic auth header (mock fetch, assert URL + Authorization).
- `forSite(unknownId)` throws before fetch is called (assert fetch not invoked).

## Config migration

Update the two existing `.claude.json` `wordpress-mcp` entries from:
```json
"env": { "WORDPRESS_SITE_URL": "...", "WORDPRESS_USERNAME": "...", "WORDPRESS_PASSWORD": "..." }
```
to a single site array:
```json
"env": { "WORDPRESS_SITES": "[{\"id\":\"boardcouture\",\"url\":\"https://boardcouture.shop\",\"username\":\"cavortkonzepte\",\"password\":\"...\"}]" }
```
(boardcouture.shop and cavort-it.systems both become entries; can be one combined server with both sites, or kept as separate server entries each with a one-site array — decide at migration time.)

## Docs + release

- **README:** replace the single-site env section with the `WORDPRESS_SITES` format + `list_sites` + the mandatory `site` param. Note the v3 breaking change.
- **CHANGELOG:** `## [3.0.0]` — BREAKING: multi-site; `WORDPRESS_SITES` replaces the single-site env vars; every tool now requires `site`; plugin activate/deactivate/delete use mcp/v1.
- **Version:** bump `package.json` to `3.0.0`.

## Standards Compliance

Verified against `~/Git/cvrt-jh/standards/`:
- **repo-checklist.md** — README + CHANGELOG updated; add a `test` script + CI test run (this repo has no CI workflow today; adding a minimal lint+test workflow is in scope for the plan).
- **testing-fullstack.md** — Vitest unit tests for the registry + client factory (the logic-bearing units); tool-over-REST bridging stays manually verified as today.
- **security.md** — passwords never logged or returned; no secrets in code (all via env); constant-time not applicable (no secret comparison here).
- **techstack.md** — TypeScript + Node MCP SDK (existing stack); Vitest is the standard test runner; pnpm as package manager.
