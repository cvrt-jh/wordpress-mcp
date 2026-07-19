/**
 * Site registry. Sites are defined in the WORDPRESS_SITES env var as a JSON
 * array of { id, url, username, password }. Parsed and validated lazily on
 * first access; a malformed value throws with a clear message.
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

// Lazily parsed on first access, so merely importing this module never
// throws (unit tests import it and call loadSites() with explicit args).
// A real server that calls getSite/listSites without WORDPRESS_SITES set
// will still throw immediately, with a clear message.
let _sites: Map<string, Site> | null = null;
function sitesMap(): Map<string, Site> {
  if (_sites === null) _sites = loadSites(process.env.WORDPRESS_SITES);
  return _sites;
}

export function getSite(id: string): Site {
  const site = sitesMap().get(id);
  if (!site) {
    const available = [...sitesMap().keys()].join(", ");
    throw new Error(`Unknown site "${id}". Available: ${available}`);
  }
  return site;
}

export function listSites(): Array<{ id: string; url: string }> {
  return [...sitesMap().values()].map((s) => ({ id: s.id, url: s.url }));
}
