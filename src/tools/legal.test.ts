import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

// Every tool resolves its site through forSite; stub it so no env or network
// is needed and the exact REST call can be asserted.
const get = vi.fn();
const put = vi.fn();
const post = vi.fn();
const del = vi.fn();
vi.mock("../client.js", () => ({
  forSite: (id: string) => {
    if (id !== "a") throw new Error(`Unknown site "${id}"`);
    return { get, put, post, delete: del };
  },
}));

import { register } from "./legal.js";

type Handler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>;
interface Tool {
  schema: z.ZodRawShape;
  handler: Handler;
}

// Capture what register() hands to server.tool(name, description, schema, handler).
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

describe("legal page tools", () => {
  beforeEach(() => {
    get.mockReset();
    put.mockReset();
  });

  it("registers legal_get_page and legal_link_page", () => {
    const names = [...tools().keys()];
    expect(names).toContain("legal_get_page");
    expect(names).toContain("legal_link_page");
  });

  it("legal_get_page reads the document's page link", async () => {
    const state = { linked: true, page_id: 42, status: "publish", ok: true };
    get.mockResolvedValue(state);

    const result = await tool("legal_get_page").handler({ site: "a", doc: "impressum" });

    expect(get).toHaveBeenCalledWith("/mcp/legal/v1/documents/impressum/page");
    expect(JSON.parse(result.content[0].text)).toEqual(state);
  });

  it("legal_link_page PUTs the page id and returns the plugin's answer", async () => {
    const state = { linked: true, page_id: 42, status: "publish", ok: true, mirrored: true, banner_linked: true };
    put.mockResolvedValue(state);

    const result = await tool("legal_link_page").handler({ site: "a", doc: "datenschutz", page_id: 42 });

    expect(put).toHaveBeenCalledWith("/mcp/legal/v1/documents/datenschutz/page", { page_id: 42 });
    expect(JSON.parse(result.content[0].text)).toEqual(state);
  });

  it("legal_link_page sends page_id 0 through, which unlinks", async () => {
    put.mockResolvedValue({ linked: false, page_id: 0, status: "missing", ok: false, mirrored: false });

    await tool("legal_link_page").handler({ site: "a", doc: "impressum", page_id: 0 });

    expect(put).toHaveBeenCalledWith("/mcp/legal/v1/documents/impressum/page", { page_id: 0 });
  });

  it("legal_link_page schema accepts only a non-negative integer page id", () => {
    const schema = z.object(tool("legal_link_page").schema);

    expect(schema.safeParse({ site: "a", doc: "impressum", page_id: 42 }).success).toBe(true);
    expect(schema.safeParse({ site: "a", doc: "impressum", page_id: 0 }).success).toBe(true);
    expect(schema.safeParse({ site: "a", doc: "impressum", page_id: -1 }).success).toBe(false);
    expect(schema.safeParse({ site: "a", doc: "impressum", page_id: 4.5 }).success).toBe(false);
    expect(schema.safeParse({ site: "a", doc: "impressum" }).success).toBe(false);
  });

  it("both page tools reject an unknown document type", () => {
    for (const name of ["legal_get_page", "legal_link_page"]) {
      const schema = z.object(tool(name).schema);
      expect(schema.safeParse({ site: "a", doc: "nope", page_id: 1 }).success).toBe(false);
    }
  });

  it("surfaces a plugin error instead of swallowing it", async () => {
    put.mockRejectedValue(new Error("WordPress API error 404: unknown_page"));

    await expect(
      tool("legal_link_page").handler({ site: "a", doc: "impressum", page_id: 999 }),
    ).rejects.toThrow(/unknown_page/);
  });
});

describe("legal consent log tools", () => {
  beforeEach(() => {
    get.mockReset();
    put.mockReset();
  });

  it("registers the three consent log tools", () => {
    const names = [...tools().keys()];
    expect(names).toContain("legal_consent_log_get");
    expect(names).toContain("legal_consent_log_stats");
    expect(names).toContain("legal_consent_log_export");
  });

  it("legal_consent_log_get reads by consent_id", async () => {
    const state = {
      consent_id: "11111111-1111-4111-8111-111111111111",
      rows: [
        {
          consent_id: "11111111-1111-4111-8111-111111111111",
          created_at: "2026-09-24 10:00:00",
          action: "accept_all",
          analytics: true,
          external: true,
          banner_version: "1",
          page_path: "/",
          ip_hash: "abc",
        },
      ],
    };
    get.mockResolvedValue(state);

    const result = await tool("legal_consent_log_get").handler({
      site: "a",
      consent_id: "11111111-1111-4111-8111-111111111111",
    });

    expect(get).toHaveBeenCalledWith("/mcp/legal/v1/consent/log", {
      consent_id: "11111111-1111-4111-8111-111111111111",
    });
    expect(JSON.parse(result.content[0].text)).toEqual(state);
  });

  it("legal_consent_log_get schema rejects a non-UUID consent_id", () => {
    const schema = z.object(tool("legal_consent_log_get").schema);

    expect(
      schema.safeParse({ site: "a", consent_id: "11111111-1111-4111-8111-111111111111" }).success,
    ).toBe(true);
    expect(schema.safeParse({ site: "a", consent_id: "not-a-uuid" }).success).toBe(false);
    expect(schema.safeParse({ site: "a" }).success).toBe(false);
  });

  it("legal_consent_log_stats reads with an optional from/to range", async () => {
    const state = { from: "2026-08-25", to: "2026-09-24", rows: [{ action: "accept_all", banner_version: "1", count: 5 }] };
    get.mockResolvedValue(state);

    const result = await tool("legal_consent_log_stats").handler({
      site: "a",
      from: "2026-08-25",
      to: "2026-09-24",
    });

    expect(get).toHaveBeenCalledWith("/mcp/legal/v1/consent/log/stats", {
      from: "2026-08-25",
      to: "2026-09-24",
    });
    expect(JSON.parse(result.content[0].text)).toEqual(state);
  });

  it("legal_consent_log_stats works with no range given", async () => {
    get.mockResolvedValue({ from: "2026-08-25", to: "2026-09-24", rows: [] });

    await tool("legal_consent_log_stats").handler({ site: "a" });

    expect(get).toHaveBeenCalledWith("/mcp/legal/v1/consent/log/stats", {});
  });

  it("legal_consent_log_stats schema rejects a from/to that is not YYYY-MM-DD", () => {
    const schema = z.object(tool("legal_consent_log_stats").schema);

    expect(schema.safeParse({ site: "a" }).success).toBe(true);
    expect(schema.safeParse({ site: "a", from: "2026-08-25", to: "2026-09-24" }).success).toBe(true);
    expect(schema.safeParse({ site: "a", from: "25-08-2026" }).success).toBe(false);
    expect(schema.safeParse({ site: "a", to: "2026/09/24" }).success).toBe(false);
  });

  it("legal_consent_log_export reads the csv text and filename with the same range rules", async () => {
    const state = { filename: "consent-log-2026-08-25-2026-09-24.csv", csv: "consent_id,created_at\n" };
    get.mockResolvedValue(state);

    const result = await tool("legal_consent_log_export").handler({
      site: "a",
      from: "2026-08-25",
      to: "2026-09-24",
    });

    expect(get).toHaveBeenCalledWith("/mcp/legal/v1/consent/log/export", {
      from: "2026-08-25",
      to: "2026-09-24",
    });
    expect(JSON.parse(result.content[0].text)).toEqual(state);
  });

  it("legal_consent_log_export schema rejects a malformed date", () => {
    const schema = z.object(tool("legal_consent_log_export").schema);

    expect(schema.safeParse({ site: "a", from: "2026-8-25" }).success).toBe(false);
  });

  it("legal_put_consent forwards log_enabled", async () => {
    put.mockResolvedValue({ saved: true });

    await tool("legal_put_consent").handler({ site: "a", enabled: true, log_enabled: true });

    expect(put).toHaveBeenCalledWith("/mcp/legal/v1/consent", { enabled: true, log_enabled: true });
  });

  it("legal_put_consent omits log_enabled when not given", async () => {
    put.mockResolvedValue({ saved: true });

    await tool("legal_put_consent").handler({ site: "a", enabled: true });

    expect(put).toHaveBeenCalledWith("/mcp/legal/v1/consent", { enabled: true });
  });
});

describe("legal generator, facts, social, settings and accessibility tools", () => {
  let dir: string;

  beforeEach(() => {
    get.mockReset();
    put.mockReset();
    post.mockReset();
    dir = mkdtempSync(join(tmpdir(), "legal-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // Every cvrt-legal admin route (mcp/legal/v1) must be reachable, or a rollout
  // falls back to raw REST. POST /consent/log is the visitors' own beacon, not
  // an admin route, and is deliberately left out.
  it("registers a tool for every cvrt-legal admin route", () => {
    const names = [...tools().keys()];
    for (const n of [
      "legal_update_settings",
      "legal_get_facts", "legal_put_facts",
      "legal_get_generator", "legal_put_generator",
      "legal_get_generator_library", "legal_put_generator_library", "legal_restore_generator",
      "legal_get_social", "legal_put_social", "legal_get_social_modules", "legal_put_social_modules",
      "legal_get_accessibility", "legal_put_accessibility",
    ]) {
      expect(names, n).toContain(n);
    }
  });

  it("legal_put_facts PUTs the fields as given", async () => {
    put.mockResolvedValue({ facts: {} });
    await tool("legal_put_facts").handler({ site: "a", facts: { company: "X GmbH", phone: "" } });
    expect(put).toHaveBeenCalledWith("/mcp/legal/v1/facts", { company: "X GmbH", phone: "" });
  });

  it("legal_put_generator sends only the parts given", async () => {
    put.mockResolvedValue({ active: true });
    await tool("legal_put_generator").handler({ site: "a", doc: "datenschutz", enabled: { "elementor-ally": false } });
    expect(put).toHaveBeenCalledWith("/mcp/legal/v1/generator/datenschutz", { enabled: { "elementor-ally": false } });
  });

  it("generator tools only accept the generated documents", () => {
    for (const name of ["legal_get_generator", "legal_put_generator", "legal_get_generator_library", "legal_restore_generator"]) {
      const schema = z.object(tool(name).schema);
      expect(schema.safeParse({ site: "a", doc: "impressum" }).success, name).toBe(true);
      expect(schema.safeParse({ site: "a", doc: "agb" }).success, name).toBe(false);
    }
  });

  it("legal_put_generator_library reads the library from a local JSON file", async () => {
    const lib = { doc: "datenschutz", version: "2026-09-29", sections: [{ key: "a", heading: "A" }] };
    const file = join(dir, "library-datenschutz.json");
    writeFileSync(file, JSON.stringify(lib));
    put.mockResolvedValue({ saved: true, sections: 1 });

    await tool("legal_put_generator_library").handler({ site: "a", doc: "datenschutz", library_file: file });

    expect(put).toHaveBeenCalledWith("/mcp/legal/v1/generator/datenschutz/library", lib);
  });

  it("legal_put_generator_library takes an inline library too", async () => {
    put.mockResolvedValue({ saved: true });
    await tool("legal_put_generator_library").handler({ site: "a", doc: "impressum", library: { sections: [] } });
    expect(put).toHaveBeenCalledWith("/mcp/legal/v1/generator/impressum/library", { sections: [] });
  });

  it("legal_put_generator_library refuses both or neither source, and a non-JSON file", async () => {
    const t = tool("legal_put_generator_library");
    await expect(t.handler({ site: "a", doc: "impressum" })).rejects.toThrow(/library or library_file/);
    await expect(t.handler({ site: "a", doc: "impressum", library: {}, library_file: "/x.json" })).rejects.toThrow(/not both/);
    const txt = join(dir, "lib.txt");
    writeFileSync(txt, "{}");
    await expect(t.handler({ site: "a", doc: "impressum", library_file: txt })).rejects.toThrow(/\.json/);
    const bad = join(dir, "bad.json");
    writeFileSync(bad, "{not json");
    await expect(t.handler({ site: "a", doc: "impressum", library_file: bad })).rejects.toThrow(/bad\.json/);
    const arr = join(dir, "arr.json");
    writeFileSync(arr, "[1]");
    await expect(t.handler({ site: "a", doc: "impressum", library_file: arr })).rejects.toThrow(/JSON object/);
    expect(put).not.toHaveBeenCalled();
  });

  it("legal_restore_generator POSTs restore", async () => {
    post.mockResolvedValue({ restored: true });
    await tool("legal_restore_generator").handler({ site: "a", doc: "datenschutz" });
    expect(post).toHaveBeenCalledWith("/mcp/legal/v1/generator/datenschutz/restore", {});
  });

  it("legal_put_social wraps the networks", async () => {
    put.mockResolvedValue({});
    const networks = { facebook: { enabled: true, urls: ["https://facebook.com/x"] } };
    await tool("legal_put_social").handler({ site: "a", networks });
    expect(put).toHaveBeenCalledWith("/mcp/legal/v1/social", { networks });
  });

  it("legal_put_social_modules reads a local JSON file", async () => {
    const mods = { heading: "Soziale Medien", networks: {} };
    const file = join(dir, "library.json");
    writeFileSync(file, JSON.stringify(mods));
    put.mockResolvedValue(mods);
    await tool("legal_put_social_modules").handler({ site: "a", modules_file: file });
    expect(put).toHaveBeenCalledWith("/mcp/legal/v1/social/modules", mods);
  });

  it("legal_update_settings POSTs only what is given", async () => {
    post.mockResolvedValue({});
    await tool("legal_update_settings").handler({ site: "a", required_override: { agb: false } });
    expect(post).toHaveBeenCalledWith("/mcp/legal/v1/settings", { required_override: { agb: false } });
  });

  it("legal_put_accessibility PUTs only the fields given", async () => {
    put.mockResolvedValue({ enabled: true });
    await tool("legal_put_accessibility").handler({ site: "a", enabled: true, tools: { sitemap: true } });
    expect(put).toHaveBeenCalledWith("/mcp/legal/v1/accessibility", { enabled: true, tools: { sitemap: true } });
  });

  it("legal_put_accessibility schema checks colour and position", () => {
    const schema = z.object(tool("legal_put_accessibility").schema);
    expect(schema.safeParse({ site: "a", color: "#1d4ed8", position: "bottom-left" }).success).toBe(true);
    expect(schema.safeParse({ site: "a", color: "blue" }).success).toBe(false);
    expect(schema.safeParse({ site: "a", position: "middle" }).success).toBe(false);
  });

  it("legal_get_accessibility reads the settings", async () => {
    get.mockResolvedValue({ enabled: false });
    await tool("legal_get_accessibility").handler({ site: "a" });
    expect(get).toHaveBeenCalledWith("/mcp/legal/v1/accessibility");
  });
});

describe("cvrt-legal 0.9.0: repairs, report, BFSG document", () => {
  beforeEach(() => {
    get.mockReset();
    put.mockReset();
    post.mockReset();
  });

  it("legal_put_accessibility forwards repair switches", async () => {
    const schema = z.object(tool("legal_put_accessibility").schema).strict();
    expect(schema.safeParse({ site: "a", repairs: { "skip-link": true } }).success).toBe(true);
    put.mockResolvedValue({});
    await tool("legal_put_accessibility").handler({ site: "a", repairs: { "skip-link": true, zoom: false } });
    expect(put).toHaveBeenCalledWith("/mcp/legal/v1/accessibility", { repairs: { "skip-link": true, zoom: false } });
  });

  it("registers the repair report tools", () => {
    const names = [...tools().keys()];
    expect(names).toContain("legal_get_accessibility_report");
    expect(names).toContain("legal_reset_accessibility_report");
  });

  it("legal_get_accessibility_report reads the report", async () => {
    get.mockResolvedValue({ totals: {}, pages: [] });
    await tool("legal_get_accessibility_report").handler({ site: "a" });
    expect(get).toHaveBeenCalledWith("/mcp/legal/v1/accessibility/report");
  });

  it("legal_reset_accessibility_report deletes it", async () => {
    del.mockReset();
    del.mockResolvedValue({ deleted: true });
    const result = await tool("legal_reset_accessibility_report").handler({ site: "a" });
    expect(del).toHaveBeenCalledWith("/mcp/legal/v1/accessibility/report");
    expect(JSON.parse(result.content[0].text)).toEqual({ deleted: true });
  });

  it("document and generator tools accept barrierefreiheit", () => {
    for (const name of ["legal_get_document", "legal_put_document", "legal_get_page", "legal_link_page", "legal_get_generator", "legal_put_generator", "legal_put_generator_library", "legal_restore_generator"]) {
      const schema = z.object(tool(name).schema);
      const args: Record<string, unknown> = { site: "a", doc: "barrierefreiheit", page_id: 1, title: "t", sections: [] };
      expect(schema.safeParse(args).success, name).toBe(true);
    }
  });
});


describe("field audit against cvrt-legal 0.10.3", () => {
  beforeEach(() => {
    get.mockReset();
    put.mockReset();
    post.mockReset();
  });

  it("legal_put_consent sends gtm_services and ads_id, which used to need mcp_set_option", async () => {
    put.mockResolvedValue({ saved: true });
    const gtm_services = { analytics: ["Microsoft Clarity"], marketing: ["Meta Pixel"] };

    await tool("legal_put_consent").handler({ site: "a", ads_id: "AW-123456789", gtm_services });

    expect(put).toHaveBeenCalledWith("/mcp/legal/v1/consent", { ads_id: "AW-123456789", gtm_services });
  });

  it("legal_put_consent is a partial update: enabled is optional and only given keys are sent", async () => {
    put.mockResolvedValue({ saved: true });

    await tool("legal_put_consent").handler({ site: "a", backdrop: false, gtm_id: "" });

    expect(put).toHaveBeenCalledWith("/mcp/legal/v1/consent", { backdrop: false, gtm_id: "" });
  });

  it("legal_put_consent schema checks ids the way save_config does", () => {
    const schema = z.object(tool("legal_put_consent").schema).strict();
    const ok = (args: Record<string, unknown>) => schema.safeParse({ site: "a", ...args }).success;

    expect(ok({ ads_id: "AW-123456789" })).toBe(true);
    expect(ok({ ads_id: "" })).toBe(true);
    expect(ok({ ads_id: "123456789" })).toBe(false);
    expect(ok({ ads_id: "AW-12ab" })).toBe(false);
    expect(ok({ gtm_id: "GTM-ABC123" })).toBe(true);
    expect(ok({ gtm_id: "UA-1" })).toBe(false);
    expect(ok({ ga4_id: "G-ABC123" })).toBe(true);
    expect(ok({ ga4_id: "G-abc" })).toBe(false);
    expect(ok({ ahrefs_key: "abc/DEF+_-==" })).toBe(true);
    expect(ok({ ahrefs_key: "a b" })).toBe(false);
    expect(ok({ privacy_page: -1 })).toBe(false);
  });

  it("legal_put_consent gtm_services must hold both category lists and nothing else", () => {
    const schema = z.object(tool("legal_put_consent").schema);
    const ok = (gtm_services: unknown) => schema.safeParse({ site: "a", gtm_services }).success;

    expect(ok({ analytics: [], marketing: ["LinkedIn Insight Tag"] })).toBe(true);
    expect(ok({ analytics: ["Clarity"] })).toBe(false);
    expect(ok({ analytics: [], marketing: [], external: [] })).toBe(false);
    expect(ok({ analytics: "Clarity", marketing: [] })).toBe(false);
    expect(ok(["Clarity"])).toBe(false);
    expect(ok({ analytics: ["x".repeat(81)], marketing: [] })).toBe(false);
    expect(ok({ analytics: Array.from({ length: 21 }, (_, i) => `s${i}`), marketing: [] })).toBe(false);
  });

  it("legal_put_accessibility repairs only take the current rule keys as booleans", () => {
    const schema = z.object(tool("legal_put_accessibility").schema);
    const ok = (repairs: unknown) => schema.safeParse({ site: "a", repairs }).success;

    expect(
      ok({
        "link-names": true, "image-alt": true, "iframe-title": true, "form-labels": true, "skip-link": true,
        lang: true, zoom: true, "new-tab": false, "duplicate-ids": true,
      }),
    ).toBe(true);
    // Old schema: a string, or rule names the plugin silently ignores.
    expect(ok("skip-link,zoom")).toBe(false);
    expect(ok({ "alt-text": true })).toBe(false);
    expect(ok({ skip_link: true })).toBe(false);
    expect(ok({ zoom: "yes" })).toBe(false);
  });

  it("legal_put_accessibility tools only take the panel's tool keys", () => {
    const schema = z.object(tool("legal_put_accessibility").schema);
    expect(schema.safeParse({ site: "a", tools: { "reading-mask": true, sitemap: false } }).success).toBe(true);
    expect(schema.safeParse({ site: "a", tools: { "text-to-speech": true } }).success).toBe(false);
  });

  it("legal_put_document leaves title out when not given (the plugin uses the type label)", async () => {
    put.mockResolvedValue({ saved: true });
    const sections = [{ heading: "Angaben", body: "<p>x</p>", level: 3 }];

    await tool("legal_put_document").handler({ site: "a", doc: "impressum", sections });

    expect(put).toHaveBeenCalledWith("/mcp/legal/v1/documents/impressum", { sections });
  });

  it("section levels are 2 or 3", () => {
    const add = z.object(tool("legal_add_section").schema);
    expect(add.safeParse({ site: "a", doc: "agb", heading: "h", body: "b", level: 3 }).success).toBe(true);
    expect(add.safeParse({ site: "a", doc: "agb", heading: "h", body: "b", level: 4 }).success).toBe(false);
    const upd = z.object(tool("legal_update_section").schema);
    expect(upd.safeParse({ site: "a", doc: "agb", slug: "s", level: 1 }).success).toBe(false);
  });

  it("legal_update_section sends only the fields given", async () => {
    put.mockResolvedValue({ saved: true });
    await tool("legal_update_section").handler({ site: "a", doc: "agb", slug: "geltung", heading: "Geltung" });
    expect(put).toHaveBeenCalledWith("/mcp/legal/v1/documents/agb/sections/geltung", { heading: "Geltung" });
  });

  it("legal_put_theme takes the two presets and only --cvrt-consent-* names", async () => {
    const schema = z.object(tool("legal_put_theme").schema);
    expect(schema.safeParse({ site: "a", preset: "dark", vars: { "--cvrt-consent-bg": "#000" } }).success).toBe(true);
    expect(schema.safeParse({ site: "a", preset: "neon" }).success).toBe(false);
    expect(schema.safeParse({ site: "a", vars: { "--other-bg": "#000" } }).success).toBe(false);

    put.mockResolvedValue({ saved: true });
    await tool("legal_put_theme").handler({ site: "a", preset: "dark" });
    expect(put).toHaveBeenCalledWith("/mcp/legal/v1/consent/theme", { preset: "dark" });
  });

  it("legal_update_settings required_override only names known documents", () => {
    const schema = z.object(tool("legal_update_settings").schema);
    expect(schema.safeParse({ site: "a", required_override: { barrierefreiheit: false } }).success).toBe(true);
    expect(schema.safeParse({ site: "a", required_override: { cookies: true } }).success).toBe(false);
  });

  it("library and modules tools treat a null source as absent", async () => {
    put.mockResolvedValue({ saved: true });
    await tool("legal_put_generator_library").handler({ site: "a", doc: "impressum", library: { sections: [] }, library_file: null });
    expect(put).toHaveBeenCalledWith("/mcp/legal/v1/generator/impressum/library", { sections: [] });

    const mods = { heading: "Soziale Medien", general: "{networks}", networks: {} };
    await tool("legal_put_social_modules").handler({ site: "a", modules: mods, modules_file: null });
    expect(put).toHaveBeenLastCalledWith("/mcp/legal/v1/social/modules", mods);
  });
});
