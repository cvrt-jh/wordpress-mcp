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

  const client: SiteClient = {
    async get<T>(endpoint: string, params?: Record<string, string | number>) {
      return handle<T>(await fetch(buildUrl(endpoint, params), { headers }));
    },
    async post<T>(endpoint: string, body: Record<string, unknown>) {
      return handle<T>(await fetch(buildUrl(endpoint), { method: "POST", headers, body: JSON.stringify(body) }));
    },
    async put<T>(endpoint: string, body: Record<string, unknown>) {
      return handle<T>(await fetch(buildUrl(endpoint), { method: "PUT", headers, body: JSON.stringify(body) }));
    },
    async delete<T>(endpoint: string, params?: Record<string, string | number>) {
      return handle<T>(await fetch(buildUrl(endpoint, params), { method: "DELETE", headers }));
    },
  };
  return client;
}
