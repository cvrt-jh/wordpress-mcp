import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { z } from "zod";

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
const del = vi.fn();
const postRaw = vi.fn();
vi.mock("../client.js", () => ({
  forSite: (id: string) => {
    if (id !== "a") throw new Error(`Unknown site "${id}"`);
    return { get, post, put, delete: del, postRaw };
  },
}));
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { register } from "./mcp-themes.js";

type Handler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>;

function tool(name: string): { schema: z.ZodRawShape; handler: Handler } {
  let found: { schema: z.ZodRawShape; handler: Handler } | undefined;
  const server = {
    tool: (n: string, _d: string, schema: z.ZodRawShape, handler: Handler) => {
      if (n === name) found = { schema, handler };
    },
  };
  register(server as never);
  if (!found) throw new Error(`tool ${name} is not registered`);
  return found;
}

beforeEach(() => {
  for (const m of [get, post, put, del, postRaw]) m.mockReset();
});

describe("mcp_install_theme_zip", () => {
  it("sends url, activate, overwrite and no token (the endpoint has none)", async () => {
    post.mockResolvedValue({ installed: true });
    await tool("mcp_install_theme_zip").handler({ site: "a", url: "https://x.test/t.zip", activate: true, overwrite: false });
    expect(post).toHaveBeenCalledWith("/mcp/v1/themes/install-zip", {
      url: "https://x.test/t.zip",
      activate: true,
      overwrite: false,
    });
    expect(Object.keys(tool("mcp_install_theme_zip").schema)).not.toContain("token");
    expect(postRaw).not.toHaveBeenCalled();
  });

  it("url mode sends replace_active only when true and maps 409 active_theme", async () => {
    post.mockResolvedValue({});
    await tool("mcp_install_theme_zip").handler({ site: "a", url: "https://x.test/t.zip", activate: false, overwrite: true, replace_active: true });
    expect(post).toHaveBeenCalledWith("/mcp/v1/themes/install-zip", {
      url: "https://x.test/t.zip",
      activate: false,
      overwrite: true,
      replace_active: true,
    });
    post.mockRejectedValue(new Error('WordPress API error 409: {"code":"active_theme"}'));
    await expect(
      tool("mcp_install_theme_zip").handler({ site: "a", url: "https://x.test/t.zip" })
    ).rejects.toThrow(/replace_active/);
  });

  describe("file_path upload mode", () => {
    const dir = mkdtempSync(join(tmpdir(), "wpmcp-zip-"));
    const zipBytes = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("rest-of-zip")]);
    const good = join(dir, "theme.zip");
    writeFileSync(good, zipBytes);
    afterAll(() => rmSync(dir, { recursive: true, force: true }));
    const run = (args: Record<string, unknown>) => tool("mcp_install_theme_zip").handler({ site: "a", ...args });

    it("posts the exact bytes as application/zip with activate and overwrite as query params", async () => {
      postRaw.mockResolvedValue({ installed: true });
      await run({ file_path: good, activate: true, overwrite: false });
      expect(post).not.toHaveBeenCalled();
      expect(postRaw).toHaveBeenCalledTimes(1);
      const [endpoint, body, contentType, params] = postRaw.mock.calls[0];
      expect(endpoint).toBe("/mcp/v1/themes/install-zip");
      expect(Buffer.from(body as Uint8Array).equals(zipBytes)).toBe(true);
      expect(contentType).toBe("application/zip");
      expect(params).toEqual({ activate: "true", overwrite: "false" });
    });

    it("follows a symlink to the real zip", async () => {
      postRaw.mockResolvedValue({});
      const link = join(dir, "link.zip");
      symlinkSync(good, link);
      await run({ file_path: link, activate: false, overwrite: true });
      expect(Buffer.from(postRaw.mock.calls[0][1] as Uint8Array).equals(zipBytes)).toBe(true);
    });

    it("rejects url and file_path together", async () => {
      await expect(run({ url: "https://x.test/t.zip", file_path: good })).rejects.toThrow(/exactly one of url or file_path/);
      expect(postRaw).not.toHaveBeenCalled();
      expect(post).not.toHaveBeenCalled();
    });

    it("rejects neither url nor file_path", async () => {
      await expect(run({})).rejects.toThrow(/exactly one of url or file_path/);
    });

    it("rejects a missing file", async () => {
      await expect(run({ file_path: join(dir, "nope.zip") })).rejects.toThrow(/not found/i);
      expect(postRaw).not.toHaveBeenCalled();
    });

    it("rejects a directory", async () => {
      const d = join(dir, "dir.zip");
      mkdirSync(d);
      await expect(run({ file_path: d })).rejects.toThrow(/regular file/);
    });

    it("rejects a file that does not end in .zip", async () => {
      const f = join(dir, "theme.tar");
      writeFileSync(f, zipBytes);
      await expect(run({ file_path: f })).rejects.toThrow(/\.zip/);
      expect(postRaw).not.toHaveBeenCalled();
    });

    it("rejects a .zip without the PK zip magic", async () => {
      const f = join(dir, "fake.zip");
      writeFileSync(f, "not a zip at all");
      await expect(run({ file_path: f })).rejects.toThrow(/not a zip/i);
      expect(postRaw).not.toHaveBeenCalled();
    });

    it("rejects a file over 64 MB before sending", async () => {
      const f = join(dir, "big.zip");
      const big = Buffer.alloc(64 * 1024 * 1024 + 1);
      zipBytes.copy(big);
      writeFileSync(f, big);
      await expect(run({ file_path: f })).rejects.toThrow(/64 MB/);
      expect(postRaw).not.toHaveBeenCalled();
    });

    it("sends replace_active as a query param only when true", async () => {
      postRaw.mockResolvedValue({});
      await run({ file_path: good, replace_active: true });
      expect(postRaw.mock.calls[0][3]).toEqual({ activate: "false", overwrite: "true", replace_active: "true" });
      postRaw.mockClear();
      await run({ file_path: good, replace_active: false });
      expect(postRaw.mock.calls[0][3]).not.toHaveProperty("replace_active");
    });

    it("maps 409 active_theme to an error naming replace_active", async () => {
      postRaw.mockRejectedValue(new Error('WordPress API error 409: {"code":"active_theme"}'));
      await expect(run({ file_path: good })).rejects.toThrow(/replace_active/);
    });

    it("explains that the site needs cvrt-mcp-endpoints 1.20.0 on 404 rest_no_route", async () => {
      postRaw.mockRejectedValue(new Error('WordPress API error 404: {"code":"rest_no_route"}'));
      await expect(run({ file_path: good })).rejects.toThrow(/cvrt-mcp-endpoints >= 1\.20\.0/);
    });

    it("explains the same when an old site expects url (400 missing parameter)", async () => {
      postRaw.mockRejectedValue(
        new Error('WordPress API error 400: {"code":"rest_missing_callback_param","message":"Missing parameter(s): url"}')
      );
      await expect(run({ file_path: good })).rejects.toThrow(/cvrt-mcp-endpoints >= 1\.20\.0/);
    });

    it("passes other site errors through unchanged", async () => {
      postRaw.mockRejectedValue(new Error('WordPress API error 400: {"code":"invalid_package"}'));
      await expect(run({ file_path: good })).rejects.toThrow(/invalid_package/);
    });
  });
});

describe("mcp_delete_theme", () => {
  it("sends the stylesheet as a DELETE query param", async () => {
    del.mockResolvedValue({ deleted: true });
    await tool("mcp_delete_theme").handler({ site: "a", stylesheet: "twentytwenty" });
    expect(del).toHaveBeenCalledWith("/mcp/v1/themes/delete", { stylesheet: "twentytwenty" });
  });
});

describe("mcp_search_themes", () => {
  it("rejects a fractional per_page at the schema", () => {
    const schema = z.object(tool("mcp_search_themes").schema);
    expect(schema.safeParse({ site: "a", search: "x", per_page: 1.5 }).success).toBe(false);
  });
});
