import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const get = vi.fn();
const post = vi.fn();
vi.mock("../client.js", () => ({
  forSite: (id: string) => {
    if (id !== "a") throw new Error(`Unknown site "${id}"`);
    return { get, post, put: vi.fn(), delete: vi.fn() };
  },
}));

import { register } from "./themes.js";

type Handler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;

function tool(name: string): Handler {
  let found: Handler | undefined;
  const server = {
    tool: (n: string, _d: string, _s: z.ZodRawShape, handler: Handler) => {
      if (n === name) found = handler;
    },
  };
  register(server as never);
  if (!found) throw new Error(`tool ${name} is not registered`);
  return found;
}

describe("wp_activate_theme", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });

  // Until 2026-09-28 the tool POSTed `stylesheet` to /wp/v2/settings. WordPress
  // ignores that field, so the theme never switched while the tool answered
  // {"activated": ...} - seen on boardcouture.shop.
  it("switches through mcp/v1/themes/activate, not wp/v2/settings", async () => {
    post.mockResolvedValue({ stylesheet: "hello-elementor", active: true, changed: true });

    const result = await tool("wp_activate_theme")({ site: "a", stylesheet: "hello-elementor" });

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/mcp/v1/themes/activate", { stylesheet: "hello-elementor" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content[0].text)).toMatchObject({ stylesheet: "hello-elementor", active: true });
  });

  it("reports an error when the theme is not active afterwards", async () => {
    post.mockResolvedValue({ stylesheet: "hello-elementor", active: false, changed: true });

    const result = await tool("wp_activate_theme")({ site: "a", stylesheet: "hello-elementor" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not active/i);
  });
});

describe("wp_list_themes / wp_get_active_theme", () => {
  beforeEach(() => {
    get.mockReset();
  });

  it("sends status as a list", async () => {
    get.mockResolvedValue([]);
    await tool("wp_list_themes")({ site: "a", status: ["active", "inactive"] });
    expect(get).toHaveBeenCalledWith("/wp/v2/themes", { status: "active,inactive" });
  });

  it("sends no status when none is given", async () => {
    get.mockResolvedValue([]);
    await tool("wp_list_themes")({ site: "a" });
    expect(get).toHaveBeenCalledWith("/wp/v2/themes", {});
  });

  it("wp_get_active_theme asks for status=active", async () => {
    get.mockResolvedValue([{ stylesheet: "hello-elementor", name: { rendered: "Hello" }, status: "active" }]);
    const result = await tool("wp_get_active_theme")({ site: "a" });
    expect(get).toHaveBeenCalledWith("/wp/v2/themes", { status: "active" });
    expect(JSON.parse(result.content[0].text)).toMatchObject({ stylesheet: "hello-elementor", status: "active" });
  });
});
