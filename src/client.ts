/**
 * WordPress REST API client
 * Uses Application Passwords for authentication (WP 5.6+)
 */

const SITE_URL = process.env.WORDPRESS_SITE_URL || "";
const USERNAME = process.env.WORDPRESS_USERNAME || "";
const PASSWORD = process.env.WORDPRESS_PASSWORD || "";

function getBaseUrl(): string {
  if (!SITE_URL) throw new Error("WORDPRESS_SITE_URL not set");
  return SITE_URL.replace(/\/$/, "");
}

function getAuthHeader(): string {
  if (!USERNAME || !PASSWORD) {
    throw new Error("WORDPRESS_USERNAME and WORDPRESS_PASSWORD required");
  }
  const credentials = Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64");
  return `Basic ${credentials}`;
}

export async function wpGet<T>(endpoint: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(`${getBaseUrl()}/wp-json${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    });
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WordPress API error ${res.status}: ${text}`);
  }

  return res.json();
}

export async function wpPost<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${getBaseUrl()}/wp-json${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WordPress API error ${res.status}: ${text}`);
  }

  return res.json();
}

export async function wpPut<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${getBaseUrl()}/wp-json${endpoint}`, {
    method: "PUT",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WordPress API error ${res.status}: ${text}`);
  }

  return res.json();
}

export async function wpDelete<T>(endpoint: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(`${getBaseUrl()}/wp-json${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.set(k, String(v));
    });
  }

  const res = await fetch(url.toString(), {
    method: "DELETE",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WordPress API error ${res.status}: ${text}`);
  }

  return res.json();
}

export function getSiteUrl(): string {
  return getBaseUrl();
}
