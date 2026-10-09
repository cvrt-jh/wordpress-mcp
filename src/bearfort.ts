/**
 * Bearfort API client for fort-level operations (backups, jobs, logs) that a
 * WordPress REST API cannot do: they happen on the worker, not inside WordPress.
 *
 * Auth: BEARFORT_API_KEY (an admin `bea_...` key), optional BEARFORT_API_URL.
 * Without the key every fort tool fails closed before any request.
 *
 * A site's fort is resolved from its URL: a `<hex>.bearfort.io` host is the hex
 * itself; any other host is looked up in the admin fort list (domain, `www.`
 * ignored), fetched once per process. A site that is not a fort is refused.
 * Error bodies and log text are secret-masked before they reach the model.
 */
import { getSite } from "./sites.js";
import { MASK, maskText } from "./mask.js";

const HEX_HOST = /^([0-9a-f]{10})\.bearfort\.io$/;
const PAGE = 200;

export interface FortClient {
  hex: string;
  get<T>(path: string, params?: Record<string, string | number>): Promise<T>;
  getText(path: string, params?: Record<string, string | number>): Promise<string>;
  post<T>(path: string, body?: Record<string, unknown>): Promise<T>;
}

let fortsByHost: Map<string, string> | null = null;

/** Forget the cached fort list (tests, or after a fort was added). */
export function resetFortIndex(): void {
  fortsByHost = null;
}

function apiKey(): string {
  const key = process.env.BEARFORT_API_KEY;
  if (!key) {
    throw new Error("BEARFORT_API_KEY is not set: fort_* tools need a Bearfort admin API key");
  }
  return key;
}

function apiBase(): string {
  return (process.env.BEARFORT_API_URL ?? "https://api.bearfort.io").replace(/\/+$/, "");
}

function hostOf(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Bearfort API error ${res.status}: ${maskText(await res.text())}`);
  }
  return res;
}

function withQuery(path: string, params?: Record<string, string | number>): string {
  if (!params || Object.keys(params).length === 0) return path;
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  return `${path}?${qs}`;
}

async function fortIndex(): Promise<Map<string, string>> {
  if (fortsByHost) return fortsByHost;
  const map = new Map<string, string>();
  for (let offset = 0; ; offset += PAGE) {
    const res = await request(`/v1/admin/sites?limit=${PAGE}&offset=${offset}`);
    const page = (await res.json()) as { items: { hex: string; domain: string | null }[] };
    for (const fort of page.items) {
      if (fort.domain) map.set(fort.domain.toLowerCase().replace(/^www\./, ""), fort.hex);
    }
    if (page.items.length < PAGE) break;
  }
  fortsByHost = map;
  return map;
}

async function resolveHex(siteId: string): Promise<string> {
  const host = hostOf(getSite(siteId).url);
  const direct = HEX_HOST.exec(host);
  if (direct) return direct[1];
  const hex = (await fortIndex()).get(host);
  if (!hex) throw new Error(`Site "${siteId}" (${host}) is not a Bearfort fort`);
  return hex;
}

/** A client for one fort's /v1/sites/{hex} routes. */
export async function forFort(siteId: string): Promise<FortClient> {
  apiKey();
  const hex = await resolveHex(siteId);
  const base = `/v1/sites/${hex}`;
  return {
    hex,
    async get<T>(path: string, params?: Record<string, string | number>) {
      return (await (await request(withQuery(base + path, params))).json()) as T;
    },
    async getText(path: string, params?: Record<string, string | number>) {
      return (await request(withQuery(base + path, params))).text();
    },
    async post<T>(path: string, body: Record<string, unknown> = {}) {
      return (await (await request(base + path, { method: "POST", body: JSON.stringify(body) })).json()) as T;
    },
  };
}

/** URL parameters whose value is a credential (tokens in webhook and API calls). */
const SECRET_PARAM = /([?&;](?:[\w-]*?(?:token|key|secret|password|passwd|pass|pwd|auth|signature|sig|nonce|code))=)[^&\s"';]+/gi;

/**
 * The last `lines` lines of a log that contain `grep` (case-insensitive
 * literal), with secret URL parameters and credential shapes masked.
 */
export function filterLog(text: string, opts: { grep?: string; lines: number }): string[] {
  const needle = opts.grep?.toLowerCase();
  const matching = text
    .split("\n")
    .filter((line) => line !== "" && (!needle || line.toLowerCase().includes(needle)));
  return matching.slice(-opts.lines).map((line) => maskText(line.replace(SECRET_PARAM, `$1${MASK}`)));
}
