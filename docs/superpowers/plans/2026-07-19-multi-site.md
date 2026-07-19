# Multi-site wordpress-mcp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-site wordpress-mcp server into a multi-site server where sites are defined in one `WORDPRESS_SITES` JSON env var and every tool call names its target `site`.

**Architecture:** A new `src/sites.ts` registry parses/validates `WORDPRESS_SITES` at startup. `src/client.ts` becomes a `forSite(id)` factory returning `{get,post,put,delete}` bound to that site's URL+auth. Every tool adds a mandatory `site` param and does `const wp = forSite(site)` at the top of its handler. A new `list_sites` tool lists configured ids. Plugin activate/deactivate/delete are repointed from `wp/v2/plugins` to `mcp/v1/plugins/*`.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, `zod`, Node 18+ (global `fetch`), Vitest (new).

## Global Constraints

- Package `@cavort-it-systems/wordpress-mcp`; this is a BREAKING change → version `3.0.0`.
- NO backward compatibility with `WORDPRESS_SITE_URL` / `WORDPRESS_USERNAME` / `WORDPRESS_PASSWORD` — remove them entirely.
- `site` is MANDATORY on every tool call (except `list_sites`). No "active site" state.
- Site entry shape is exactly `{ id, url, username, password }` — no other fields.
- Passwords are NEVER returned by any tool, logged, or included in errors. `list_sites` returns only `{id, url}`.
- `forSite(id)` MUST throw before any HTTP request when `id` is unknown, with message `Unknown site "<id>". Available: <ids>`.
- Auth is HTTP Basic with a WordPress application password, exactly as today.
- Error message format for HTTP failures stays: `WordPress API error <status>: <body>`.
- Build command is `npm run build` (`tsc`), output to `build/`. Keep this; do not switch bundlers.

---

### Task 1: Site registry (`src/sites.ts`)

**Files:**
- Create: `src/sites.ts`
- Test: `src/sites.test.ts`
- Modify: `package.json` (add vitest + `test` script)

**Interfaces:**
- Consumes: `process.env.WORDPRESS_SITES` (JSON string).
- Produces:
  - `interface Site { id: string; url: string; username: string; password: string }`
  - `function getSite(id: string): Site` — throws on unknown id.
  - `function listSites(): Array<{ id: string; url: string }>`
  - `function loadSites(raw: string | undefined): Map<string, Site>` — pure parser used internally and by tests (so tests don't depend on real env).

- [ ] **Step 1: Add vitest to the project**

Run:
```bash
cd /Users/jh/Git/cvrt-jh/mcp/wordpress-mcp
npm install -D vitest
```
Then add to `package.json` `scripts`: `"test": "vitest run"` and `"test:watch": "vitest"`.

- [ ] **Step 2: Write failing tests** — create `src/sites.test.ts`:

```ts
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
```

- [ ] **Step 3: Run tests, verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './sites.js'` / `loadSites is not a function`.

- [ ] **Step 4: Implement `src/sites.ts`**

```ts
/**
 * Site registry. Sites are defined in the WORDPRESS_SITES env var as a JSON
 * array of { id, url, username, password }. Parsed and validated once at
 * startup; a malformed value throws before the server accepts any request.
 */

export interface Site {
  id: string;
  url: string;
  username: string;
  password: string;
}

/**
 * Parse + validate the raw WORDPRESS_SITES value into a Map keyed by id.
 * Pure (takes the raw string) so it is unit-testable without touching env.
 */
export function loadSites(raw: string | undefined): Map<string, Site> {
  if (!raw || raw.trim() === "") {
    throw new Error("WORDPRESS_SITES env var must be a JSON array of sites");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("WORDPRESS_SITES env var must be valid JSON");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("WORDPRESS_SITES must be a JSON array");
  }
  if (parsed.length === 0) {
    throw new Error("WORDPRESS_SITES must contain at least one site");
  }

  const map = new Map<string, Site>();
  parsed.forEach((entry, i) => {
    const e = entry as Record<string, unknown>;
    for (const field of ["id", "url", "username", "password"] as const) {
      if (typeof e[field] !== "string" || (e[field] as string).trim() === "") {
        const label = typeof e.id === "string" ? `"${e.id}"` : `index ${i}`;
        throw new Error(`WORDPRESS_SITES entry ${label} is missing a valid "${field}"`);
      }
    }
    const url = e.url as string;
    if (!/^https?:\/\//i.test(url)) {
      throw new Error(`WORDPRESS_SITES entry "${e.id}" url must start with http:// or https://`);
    }
    const id = e.id as string;
    if (map.has(id)) {
      throw new Error(`WORDPRESS_SITES has a duplicate site id "${id}"`);
    }
    map.set(id, {
      id,
      url,
      username: e.username as string,
      password: e.password as string,
    });
  });

  return map;
}

// Parsed once at module load. Throws here if WORDPRESS_SITES is bad, which
// aborts server startup with a clear message (better than failing mid-tool).
const sites = loadSites(process.env.WORDPRESS_SITES);

export function getSite(id: string): Site {
  const site = sites.get(id);
  if (!site) {
    const available = [...sites.keys()].join(", ");
    throw new Error(`Unknown site "${id}". Available: ${available}`);
  }
  return site;
}

export function listSites(): Array<{ id: string; url: string }> {
  return [...sites.values()].map((s) => ({ id: s.id, url: s.url }));
}
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `npm test`
Expected: PASS (8 tests in sites.test.ts). Note: `loadSites` is exercised directly, so the module-load `loadSites(process.env...)` line does not interfere (tests set nothing and call `loadSites` with explicit args). If the module-load line throws during import because env is unset, move the `const sites = ...` initialization into a lazily-evaluated `getSitesMap()` helper called by `getSite`/`listSites`; adjust so importing the module never throws. Prefer lazy init:

```ts
let _sites: Map<string, Site> | null = null;
function sitesMap(): Map<string, Site> {
  if (_sites === null) _sites = loadSites(process.env.WORDPRESS_SITES);
  return _sites;
}
// getSite/listSites call sitesMap() instead of the module-level const.
```
Use the lazy version so unit tests importing the module don't require env to be set.

- [ ] **Step 6: Commit**

```bash
git add src/sites.ts src/sites.test.ts package.json package-lock.json
git commit -m "feat: WORDPRESS_SITES registry (src/sites.ts) + vitest"
```

---

### Task 2: `forSite()` client factory (`src/client.ts`)

**Files:**
- Modify: `src/client.ts` (replace entire file)
- Test: `src/client.test.ts`

**Interfaces:**
- Consumes: `getSite(id)` from Task 1.
- Produces:
  - `interface SiteClient { get<T>(endpoint, params?): Promise<T>; post<T>(endpoint, body): Promise<T>; put<T>(endpoint, body): Promise<T>; delete<T>(endpoint, params?): Promise<T> }`
  - `function forSite(siteId: string): SiteClient`
  - Param types: `endpoint: string`, `params?: Record<string, string | number>`, `body: Record<string, unknown>`.
- Removes: `wpGet`, `wpPost`, `wpPut`, `wpDelete`, `getSiteUrl`, and the `SITE_URL/USERNAME/PASSWORD` constants.

- [ ] **Step 1: Write failing tests** — create `src/client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// forSite reads sites via getSite; stub the registry so no env is needed.
vi.mock("./sites.js", () => ({
  getSite: (id: string) => {
    if (id === "a") return { id: "a", url: "https://a.example/", username: "u", password: "p" };
    const err = new Error(`Unknown site "${id}". Available: a`);
    throw err;
  },
}));

import { forSite } from "./client.js";

describe("forSite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws (before any fetch) for an unknown site", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(() => forSite("nope")).toThrow(/Unknown site "nope"/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("builds the base URL (trailing slash stripped) and Basic auth header on GET", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const wp = forSite("a");
    await wp.get("/mcp/v1/health");

    const [calledUrl, init] = fetchSpy.mock.calls[0];
    expect(String(calledUrl)).toBe("https://a.example/wp-json/mcp/v1/health");
    const auth = (init?.headers as Record<string, string>).Authorization;
    expect(auth).toBe("Basic " + Buffer.from("u:p").toString("base64"));
  });

  it("throws WordPress API error on non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("boom", { status: 500 }));
    const wp = forSite("a");
    await expect(wp.get("/x")).rejects.toThrow(/WordPress API error 500: boom/);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test`
Expected: FAIL — `forSite is not a function` (client.ts still exports old functions).

- [ ] **Step 3: Replace `src/client.ts`**

```ts
/**
 * WordPress REST API client. `forSite(id)` returns a client bound to one site's
 * URL and Basic-auth application password. Uses HTTP Basic auth (WP 5.6+).
 */
import { getSite } from "./sites.js";

export interface SiteClient {
  get<T>(endpoint: string, params?: Record<string, string | number>): Promise<T>;
  post<T>(endpoint: string, body: Record<string, unknown>): Promise<T>;
  put<T>(endpoint: string, body: Record<string, unknown>): Promise<T>;
  delete<T>(endpoint: string, params?: Record<string, string | number>): Promise<T>;
}

export function forSite(siteId: string): SiteClient {
  const site = getSite(siteId); // throws (before any fetch) if unknown
  const base = site.url.replace(/\/$/, "");
  const auth = "Basic " + Buffer.from(`${site.username}:${site.password}`).toString("base64");
  const headers = { Authorization: auth, "Content-Type": "application/json" };

  const buildUrl = (endpoint: string, params?: Record<string, string | number>): string => {
    const url = new URL(`${base}/wp-json${endpoint}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  };

  async function handle<T>(res: Response): Promise<T> {
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`WordPress API error ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  return {
    async get<T>(endpoint, params) {
      return handle<T>(await fetch(buildUrl(endpoint, params), { headers }));
    },
    async post<T>(endpoint, body) {
      return handle<T>(await fetch(buildUrl(endpoint), { method: "POST", headers, body: JSON.stringify(body) }));
    },
    async put<T>(endpoint, body) {
      return handle<T>(await fetch(buildUrl(endpoint), { method: "PUT", headers, body: JSON.stringify(body) }));
    },
    async delete<T>(endpoint, params) {
      return handle<T>(await fetch(buildUrl(endpoint, params), { method: "DELETE", headers }));
    },
  };
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm test`
Expected: PASS (client.test.ts: 3 tests; sites.test.ts still 8).

- [ ] **Step 5: Verify the build breaks in the expected places only**

Run: `npm run build`
Expected: FAIL — every tool file still imports `wpGet/wpPost/...` and `getSiteUrl`. This is expected; Tasks 4-8 fix them. Do NOT try to fix tools here. Confirm the errors are all "no exported member 'wpGet'|'wpPost'|'wpPut'|'wpDelete'|'getSiteUrl'" and nothing else.

- [ ] **Step 6: Commit**

```bash
git add src/client.ts src/client.test.ts
git commit -m "feat: forSite() client factory (replaces global wp* functions)"
```

---

### Task 3: `list_sites` tool + site param helper

**Files:**
- Create: `src/tools/sites.ts`
- Modify: `src/index.ts` (import + register `registerSites`)

**Interfaces:**
- Consumes: `listSites()` (Task 1), `forSite` (Task 2), `jsonResult` from `src/types.ts`.
- Produces: `export function register(server: McpServer): void` registering the `list_sites` tool.

- [ ] **Step 1: Implement `src/tools/sites.ts`**

```ts
/**
 * The list_sites tool. Returns the configured site ids (and urls) so the caller
 * knows which value to pass as the mandatory `site` argument on every other
 * tool. Never returns credentials.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listSites } from "../sites.js";
import { jsonResult } from "../types.js";

export function register(server: McpServer) {
  server.tool(
    "list_sites",
    "List the WordPress sites this server can manage. Every other tool requires a `site` argument set to one of these ids.",
    {},
    async () => jsonResult({ sites: listSites() }),
  );
}
```

- [ ] **Step 2: Register it in `src/index.ts`**

Add with the other imports near the top:
```ts
import { register as registerSites } from "./tools/sites.js";
```
And call it FIRST in the registration block (before `registerSite(server)`):
```ts
// Multi-site: list_sites has no `site` param; every other tool requires one.
registerSites(server);
```

- [ ] **Step 3: Verify types compile for this file alone**

Run: `npx tsc --noEmit src/tools/sites.ts` is not meaningful (needs project). Instead defer full build to Task 8. For now just re-read the file to confirm it matches the `mcp-plugins.ts` registration style (server.tool(name, description, schemaObject, handler)).

- [ ] **Step 4: Commit**

```bash
git add src/tools/sites.ts src/index.ts
git commit -m "feat: list_sites tool"
```

---

### Task 4: Convert core WP tool files to `forSite` (batch 1)

**Files (modify each):**
- `src/tools/site.ts`, `src/tools/posts.ts`, `src/tools/pages.ts`, `src/tools/users.ts`, `src/tools/plugins.ts`, `src/tools/themes.ts`, `src/tools/media.ts`, `src/tools/taxonomies.ts`, `src/tools/comments.ts`

**Interfaces:**
- Consumes: `forSite` (Task 2).

**The uniform conversion recipe (apply to EVERY tool in EVERY file in this task):**

1. Change the import line from e.g. `import { wpGet, wpPost, wpPut, wpDelete } from "../client.js";` to `import { forSite } from "../client.js";`. If the file also imports `getSiteUrl` (only `site.ts` does), remove it and import `getSite` from `"../sites.js"` instead.
2. In each `server.tool(name, description, schema, handler)`:
   - Add `site: z.string().describe("Site id (see list_sites)")` as the FIRST property of the `schema` object.
   - Add `site` as the first destructured field in the handler's argument.
   - As the FIRST line of the handler body: `const wp = forSite(site);`
   - Replace `wpGet(` → `wp.get(`, `wpPost(` → `wp.post(`, `wpPut(` → `wp.put(`, `wpDelete(` → `wp.delete(` within that handler.
3. For `site.ts` specifically: replace any `getSiteUrl()` call with `getSite(site).url`.

Example — before:
```ts
server.tool(
  "wp_list_posts",
  "List posts",
  { per_page: z.number().optional() },
  async ({ per_page }) => {
    const posts = await wpGet<unknown[]>("/wp/v2/posts", { per_page });
    return jsonResult(posts);
  },
);
```
After:
```ts
server.tool(
  "wp_list_posts",
  "List posts",
  { site: z.string().describe("Site id (see list_sites)"), per_page: z.number().optional() },
  async ({ site, per_page }) => {
    const wp = forSite(site);
    const posts = await wp.get<unknown[]>("/wp/v2/posts", { per_page });
    return jsonResult(posts);
  },
);
```

- [ ] **Step 1: Apply the recipe to all 9 files in this task.** Do NOT change endpoint strings, response types, or any other logic. Only: import line, add `site` to schema, add `site` to destructure, add `const wp = forSite(site);`, rename `wp*(` calls.

- [ ] **Step 2: Grep to confirm no stray old calls remain in these files**

Run:
```bash
grep -nE "wpGet|wpPost|wpPut|wpDelete|getSiteUrl" src/tools/{site,posts,pages,users,plugins,themes,media,taxonomies,comments}.ts
```
Expected: no output.

- [ ] **Step 3: Confirm each converted handler has a `site` param and a `forSite` call**

Run:
```bash
for f in site posts pages users plugins themes media taxonomies comments; do
  echo "$f: tools=$(grep -c 'server.tool' src/tools/$f.ts) forSite=$(grep -c 'forSite(site)' src/tools/$f.ts)";
done
```
Expected: for each file, `forSite` count equals the `server.tool` count.

- [ ] **Step 4: Commit**

```bash
git add src/tools/{site,posts,pages,users,plugins,themes,media,taxonomies,comments}.ts
git commit -m "feat: multi-site core WP tools (batch 1)"
```

---

### Task 5: Convert mcp/v1 tool files to `forSite` (batch 2)

**Files (modify each):**
- `src/tools/mcp-plugins.ts`, `src/tools/mcp-themes.ts`, `src/tools/mcp-core.ts`, `src/tools/mcp-database.ts`, `src/tools/mcp-options.ts`, `src/tools/mcp-menus.ts`, `src/tools/mcp-widgets.ts`, `src/tools/mcp-health.ts`

**Interfaces:** Consumes `forSite` (Task 2).

- [ ] **Step 1: Apply the exact same conversion recipe from Task 4** to all 8 files. Import `forSite`; add `site` first in each tool's schema; destructure `site`; `const wp = forSite(site);` first line; rename `wp*(` → `wp.*(`.

- [ ] **Step 2: Grep to confirm no stray old calls**

Run:
```bash
grep -nE "wpGet|wpPost|wpPut|wpDelete|getSiteUrl" src/tools/{mcp-plugins,mcp-themes,mcp-core,mcp-database,mcp-options,mcp-menus,mcp-widgets,mcp-health}.ts
```
Expected: no output.

- [ ] **Step 3: Confirm forSite count == server.tool count per file**

Run:
```bash
for f in mcp-plugins mcp-themes mcp-core mcp-database mcp-options mcp-menus mcp-widgets mcp-health; do
  echo "$f: tools=$(grep -c 'server.tool' src/tools/$f.ts) forSite=$(grep -c 'forSite(site)' src/tools/$f.ts)";
done
```
Expected: equal counts per file.

- [ ] **Step 4: Commit**

```bash
git add src/tools/{mcp-plugins,mcp-themes,mcp-core,mcp-database,mcp-options,mcp-menus,mcp-widgets,mcp-health}.ts
git commit -m "feat: multi-site mcp/v1 tools (batch 2)"
```

---

### Task 6: Convert remaining mcp/v1 + integration tool files (batch 3)

**Files (modify each):**
- `src/tools/mcp-cpt.ts`, `src/tools/mcp-taxonomies.ts`, `src/tools/mcp-users.ts`, `src/tools/mcp-media.ts`, `src/tools/mcp-acf.ts`, `src/tools/mcp-elementor.ts`, `src/tools/mcp-woo.ts`, `src/tools/fulfillment.ts`

**Interfaces:** Consumes `forSite` (Task 2).

- [ ] **Step 1: Apply the same conversion recipe from Task 4** to all 8 files. (`mcp-woo.ts` is the largest — 43 call sites; take care to rename every one.)

- [ ] **Step 2: Grep to confirm no stray old calls**

Run:
```bash
grep -nE "wpGet|wpPost|wpPut|wpDelete|getSiteUrl" src/tools/{mcp-cpt,mcp-taxonomies,mcp-users,mcp-media,mcp-acf,mcp-elementor,mcp-woo,fulfillment}.ts
```
Expected: no output.

- [ ] **Step 3: Global grep — NO file anywhere still uses the old client API**

Run:
```bash
grep -rnE "wpGet|wpPost|wpPut|wpDelete|getSiteUrl" src/
```
Expected: no output (all tools converted).

- [ ] **Step 4: Confirm forSite count == server.tool count per file**

Run:
```bash
for f in mcp-cpt mcp-taxonomies mcp-users mcp-media mcp-acf mcp-elementor mcp-woo fulfillment; do
  echo "$f: tools=$(grep -c 'server.tool' src/tools/$f.ts) forSite=$(grep -c 'forSite(site)' src/tools/$f.ts)";
done
```
Expected: equal counts per file.

- [ ] **Step 5: Commit**

```bash
git add src/tools/{mcp-cpt,mcp-taxonomies,mcp-users,mcp-media,mcp-acf,mcp-elementor,mcp-woo,fulfillment}.ts
git commit -m "feat: multi-site remaining tools (batch 3)"
```

---

### Task 7: Repoint plugin activate/deactivate/delete to mcp/v1

**Files:**
- Modify: `src/tools/plugins.ts` (the `wp_activate_plugin`, `wp_deactivate_plugin`, `wp_delete_plugin` tools)

**Interfaces:** Consumes `forSite` (Task 2). Requires `cvrt-mcp-endpoints` v1.10.0+ on the target site (provides `/mcp/v1/plugins/activate|deactivate|delete`).

Note: `plugins.ts` was already converted to `forSite` in Task 4; here we change the three lifecycle tools' endpoints and the `plugin` param semantics (file path, not core-route slug).

- [ ] **Step 1: Change `wp_activate_plugin`** — replace its handler body so it calls the mcp/v1 route. Full tool after change:

```ts
server.tool(
  "wp_activate_plugin",
  "Activate an installed plugin (via cvrt-mcp-endpoints, avoids the often-blocked core route)",
  {
    site: z.string().describe("Site id (see list_sites)"),
    plugin: z.string().describe("Plugin file path, e.g. akismet/akismet.php"),
  },
  async ({ site, plugin }) => {
    const wp = forSite(site);
    const result = await wp.post<{ plugin: string; active: boolean; changed: boolean }>(
      "/mcp/v1/plugins/activate",
      { plugin },
    );
    return jsonResult(result);
  },
);
```

- [ ] **Step 2: Change `wp_deactivate_plugin`** — full tool after change:

```ts
server.tool(
  "wp_deactivate_plugin",
  "Deactivate an installed plugin (via cvrt-mcp-endpoints)",
  {
    site: z.string().describe("Site id (see list_sites)"),
    plugin: z.string().describe("Plugin file path, e.g. akismet/akismet.php"),
  },
  async ({ site, plugin }) => {
    const wp = forSite(site);
    const result = await wp.post<{ plugin: string; active: boolean; changed: boolean }>(
      "/mcp/v1/plugins/deactivate",
      { plugin },
    );
    return jsonResult(result);
  },
);
```

- [ ] **Step 3: Change `wp_delete_plugin`** — full tool after change:

```ts
server.tool(
  "wp_delete_plugin",
  "Delete an installed plugin (via cvrt-mcp-endpoints; deactivates first)",
  {
    site: z.string().describe("Site id (see list_sites)"),
    plugin: z.string().describe("Plugin file path, e.g. akismet/akismet.php"),
  },
  async ({ site, plugin }) => {
    const wp = forSite(site);
    const result = await wp.post<{ plugin: string; deleted: boolean }>(
      "/mcp/v1/plugins/delete",
      { plugin },
    );
    return jsonResult(result);
  },
);
```

- [ ] **Step 4: Remove any now-unused helper** — if `plugins.ts` had an `encodePluginSlug` helper used only by these three tools, delete it. Confirm:

Run: `grep -n "encodePluginSlug" src/tools/plugins.ts`
Expected: no output (or, if still used by `wp_get_plugin`/`wp_list_plugins`, leave it — only remove if unreferenced).

- [ ] **Step 5: Commit**

```bash
git add src/tools/plugins.ts
git commit -m "feat: plugin activate/deactivate/delete use mcp/v1 routes"
```

---

### Task 8: Build, version bump, docs, config migration

**Files:**
- Modify: `package.json` (version), `src/index.ts` (server version string), `README.md`, `CHANGELOG.md`
- Modify (outside repo): `~/.claude.json` wordpress-mcp entries

**Interfaces:** none (release/docs task).

- [ ] **Step 1: Full typecheck + build passes**

Run: `npm run build`
Expected: PASS (0 errors). If any tool still references `wpGet` etc., go back and fix it — the build is the gate that every call site was converted.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS (sites.test.ts 8 + client.test.ts 3 = 11 tests).

- [ ] **Step 3: Bump version to 3.0.0**

In `package.json` set `"version": "3.0.0"`. In `src/index.ts` set the `new McpServer({ name: "wordpress-mcp", version: "3.0.0" })` version to `"3.0.0"`.

- [ ] **Step 4: Update `CHANGELOG.md`** — add at the top:

```markdown
## [3.0.0] - 2026-07-19

### Changed (BREAKING)
- Multi-site: sites are now defined in a single `WORDPRESS_SITES` env var (JSON array of `{id, url, username, password}`). The old `WORDPRESS_SITE_URL` / `WORDPRESS_USERNAME` / `WORDPRESS_PASSWORD` vars are removed.
- Every tool now requires a `site` argument naming the target site id. Use the new `list_sites` tool to discover configured ids.
- `wp_activate_plugin` / `wp_deactivate_plugin` / `wp_delete_plugin` now use the `cvrt-mcp-endpoints` `mcp/v1` routes instead of the core `wp/v2/plugins` route (avoids hosts that block it). Their `plugin` argument is now the plugin file path (e.g. `akismet/akismet.php`).

### Added
- `list_sites` tool.
```

- [ ] **Step 5: Update `README.md`** — replace the single-site configuration section with the multi-site format. Include this example env block and note that every tool takes `site`:

```json
{
  "mcpServers": {
    "wordpress": {
      "command": "npx",
      "args": ["@cavort-it-systems/wordpress-mcp"],
      "env": {
        "WORDPRESS_SITES": "[{\"id\":\"boardcouture\",\"url\":\"https://boardcouture.shop\",\"username\":\"cavortkonzepte\",\"password\":\"xxxx xxxx xxxx\"}]"
      }
    }
  }
}
```
Document `list_sites` and that all other tools require a `site` id. Note the v3 breaking change and that `WORDPRESS_SITE_URL/USERNAME/PASSWORD` are no longer read.

- [ ] **Step 6: Commit the release**

```bash
git add package.json src/index.ts README.md CHANGELOG.md
git commit -m "release: v3.0.0 multi-site (breaking)"
```

- [ ] **Step 7: Migrate the local `~/.claude.json` wordpress-mcp entries** (manual, outside the repo — do NOT commit this anywhere)

Read the current `wordpress` server entry in `~/.claude.json`. Replace its `env` object:
```json
"env": {
  "WORDPRESS_SITE_URL": "https://boardcouture.shop",
  "WORDPRESS_USERNAME": "cavortkonzepte",
  "WORDPRESS_PASSWORD": "NS90 AFgQ 4hoj Heo1 95cW y3r0"
}
```
with:
```json
"env": {
  "WORDPRESS_SITES": "[{\"id\":\"boardcouture\",\"url\":\"https://boardcouture.shop\",\"username\":\"cavortkonzepte\",\"password\":\"NS90 AFgQ 4hoj Heo1 95cW y3r0\"}]"
}
```
Do the same for the `wordpress-cavort` entry (cavort-it.systems), OR combine both sites into one `WORDPRESS_SITES` array on a single server entry — implementer to confirm the preferred layout with the user before editing. The MCP tools reload on the next `claude` session.

- [ ] **Step 8: Manual smoke test (record result, do not automate)**

After a fresh `claude` session picks up the new config, call `list_sites` (expect the configured site ids) and one read tool with `site` set (e.g. health) to confirm end-to-end. Record the outcome in the task's report. If `list_sites` errors at startup, the `WORDPRESS_SITES` JSON is malformed — fix the `.claude.json` value.

---

## Notes for the executor

- **The build is the coverage gate.** After Task 6, `grep -rnE "wpGet|wpPost|wpPut|wpDelete|getSiteUrl" src/` must be empty and `npm run build` must pass. Those two checks together prove all 225 call sites were converted.
- **Do not add per-site tokens, active-site state, or capability discovery** — out of scope (YAGNI).
- **Never print or log a site password.** `list_sites` returns `{id, url}` only.
