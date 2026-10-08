/**
 * Drift check: every tool against a fixture of the endpoint it calls.
 *
 * Each tool has one entry in src/drift/*.json, written from the server source
 * (register_rest_route args plus the params the callback reads). The test
 * fails when
 *   - a tool has no entry, or an entry names no tool,
 *   - a tool's input schema differs from site + path + fields + local + spread,
 *   - a tool sends keys other than the ones the entry says (all args given),
 *   - a tool calls another method or route than the entry says,
 *   - the endpoint accepts a field the tool neither exposes nor lists under
 *     `omitted` with a reason, or the tool sends a field the endpoint does
 *     not accept.
 * When a plugin gains a field: add it to `server` in the fixture first; this
 * test then goes red until the tool exposes it (or `omitted` says why not).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

interface Call {
  method: "GET" | "POST" | "PUT" | "DELETE";
  endpoint: string;
  payload: Record<string, unknown> | undefined;
  raw?: string;
}
const calls: Call[] = [];
// What the stubbed client returns; checkTool sets it from the entry's `response`.
let stubResponse: unknown = {};
const record =
  (method: Call["method"]) =>
  async (endpoint: string, payload?: Record<string, unknown>, body?: Record<string, unknown>) => {
    // delete(endpoint, query, body): both reach the endpoint.
    calls.push({ method, endpoint, payload: payload || body ? { ...payload, ...body } : undefined });
    return stubResponse;
  };
const recordRaw = async (endpoint: string, raw: string) => {
  calls.push({ method: "POST", endpoint, payload: undefined, raw });
  return stubResponse;
};
vi.mock("./client.js", () => ({
  forSite: () => ({
    get: record("GET"),
    post: record("POST"),
    put: record("PUT"),
    delete: record("DELETE"),
    postRaw: recordRaw,
  }),
}));

import { registerAll } from "./register.js";

export interface DriftEntry {
  method: Call["method"];
  route: string;
  source: string;
  server: string[];
  path?: string[];
  fields?: string[];
  constants?: string[];
  local?: Record<string, string>;
  omitted?: Record<string, string>;
  spread?: string[];
  sends?: string[];
  /** Arg overrides; null = leave the arg out. */
  sample?: Record<string, unknown>;
  /** The endpoint reads the raw request body (get_body()), not params. */
  raw?: boolean;
  /** What the stubbed endpoint returns (default {}); [] for collection routes. */
  response?: unknown;
}

type Handler = (args: Record<string, unknown>) => Promise<unknown>;
interface Tool {
  schema: z.ZodRawShape;
  handler: Handler;
}

function registeredTools(): Map<string, Tool> {
  const out = new Map<string, Tool>();
  const server = {
    tool: (name: string, _d: string, schema: z.ZodRawShape, handler: Handler) => {
      out.set(name, { schema, handler });
    },
  };
  registerAll(server as never);
  return out;
}

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "drift");
export function loadFixtures(dir = fixtureDir): Map<string, DriftEntry> {
  const out = new Map<string, DriftEntry>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const data = JSON.parse(readFileSync(join(dir, file), "utf8")) as Record<string, DriftEntry>;
    for (const [name, entry] of Object.entries(data)) {
      if (out.has(name)) throw new Error(`${name} is in more than one drift fixture (${file})`);
      out.set(name, entry);
    }
  }
  return out;
}

// A value of the right shape for every zod type the tools use.
export function sample(type: z.ZodTypeAny): unknown {
  const def = type._def as { typeName: string } & Record<string, unknown>;
  switch (def.typeName) {
    case "ZodOptional":
    case "ZodNullable":
      return sample(def.innerType as z.ZodTypeAny);
    case "ZodDefault":
      return sample(def.innerType as z.ZodTypeAny);
    case "ZodEffects":
      return sample(def.schema as z.ZodTypeAny);
    case "ZodString":
      return "x1";
    case "ZodNumber":
      return 7;
    case "ZodBoolean":
      return true;
    case "ZodEnum":
      return (def.values as string[])[0];
    case "ZodNativeEnum":
      return Object.values(def.values as object)[0];
    case "ZodLiteral":
      return def.value;
    case "ZodArray":
      return [sample(def.type as z.ZodTypeAny)];
    case "ZodObject": {
      const shape = (type as z.ZodObject<z.ZodRawShape>).shape;
      return Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, sample(v)]));
    }
    case "ZodRecord":
      return { k1: sample(def.valueType as z.ZodTypeAny) };
    case "ZodUnion":
      return sample((def.options as z.ZodTypeAny[])[0]);
    case "ZodAny":
    case "ZodUnknown":
      return "x1";
    default:
      throw new Error(`drift sample: unsupported zod type ${def.typeName}`);
  }
}

function routeRegex(route: string): RegExp {
  const escaped = route.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{[^}]+\}/g, "[^/?]+");
  return new RegExp(`^${escaped}$`);
}

function sentKeys(call: Call): string[] {
  const [, query] = call.endpoint.split("?", 2);
  const keys = new Set<string>(Object.keys(call.payload ?? {}));
  if (query) for (const k of new URLSearchParams(query).keys()) keys.add(k);
  return [...keys].sort();
}

const sorted = (xs: Iterable<string>) => [...new Set(xs)].sort();

/** Every problem with one tool, as human-readable lines (empty = no drift). */
export async function checkTool(name: string, tool: Tool, entry: DriftEntry): Promise<string[]> {
  const problems: string[] = [];
  const path = entry.path ?? [];
  const fields = entry.fields ?? [];
  const constants = entry.constants ?? [];
  const local = Object.keys(entry.local ?? {});
  const spread = entry.spread ?? [];
  const omitted = Object.keys(entry.omitted ?? {});

  // 1. The input schema is exactly what the entry accounts for.
  const schemaKeys = sorted(Object.keys(tool.schema));
  const expectedKeys = sorted(["site", ...path, ...fields, ...local, ...spread]);
  if (JSON.stringify(schemaKeys) !== JSON.stringify(expectedKeys)) {
    problems.push(`schema keys ${JSON.stringify(schemaKeys)} != fixture ${JSON.stringify(expectedKeys)}`);
  }

  // 2. With every arg given, the tool calls the route and sends exactly the expected keys.
  const args: Record<string, unknown> = { site: "a" };
  for (const [k, v] of Object.entries(tool.schema)) if (k !== "site") args[k] = sample(v);
  // A null in `sample` leaves that arg out (JSON has no undefined).
  for (const [k, v] of Object.entries(entry.sample ?? {})) {
    if (v === null) delete args[k];
    else args[k] = v;
  }
  calls.length = 0;
  stubResponse = entry.response ?? {};
  try {
    await tool.handler(args);
  } catch (e) {
    problems.push(`handler threw with sample args: ${(e as Error).message}`);
  }
  const re = routeRegex(entry.route);
  const call = calls.find((c) => c.method === entry.method && re.test(c.endpoint.split("?")[0]));
  if (!call) {
    problems.push(`no ${entry.method} ${entry.route}; calls: ${calls.map((c) => `${c.method} ${c.endpoint}`).join(", ") || "none"}`);
  } else {
    const spreadKeys = spread.flatMap((k) => Object.keys((args[k] as Record<string, unknown>) ?? {}));
    const expectedSent = sorted(entry.sends ?? [...fields, ...constants, ...spreadKeys]);
    if (entry.raw && typeof call.raw !== "string") problems.push("expected a raw request body, sent none");
    if (!entry.raw && call.raw !== undefined) problems.push("sent a raw body the endpoint does not read");
    const sent = sentKeys(call);
    if (JSON.stringify(sent) !== JSON.stringify(expectedSent)) {
      problems.push(`sends ${JSON.stringify(sent)} != fixture ${JSON.stringify(expectedSent)}`);
    }
  }

  // 3. Against the endpoint: nothing sent that it does not take, nothing it takes left out silently.
  const server = new Set(entry.server);
  const exposed = new Set([...fields, ...constants, ...(entry.sends ?? [])]);
  for (const k of exposed) if (!server.has(k)) problems.push(`sends "${k}", which the endpoint does not accept`);
  for (const k of omitted) if (!server.has(k)) problems.push(`omits "${k}", which the endpoint does not accept anyway`);
  if (spread.length === 0) {
    for (const k of server) {
      if (!exposed.has(k) && !omitted.includes(k)) problems.push(`endpoint accepts "${k}" but the tool does not expose it`);
    }
  }
  return problems;
}

describe("drift: tools vs endpoint fixtures", () => {
  const tools = registeredTools();
  const fixtures = loadFixtures();

  beforeEach(() => {
    calls.length = 0;
  });

  it("every tool has a fixture entry and every entry has a tool", () => {
    const noEntry = [...tools.keys()].filter((n) => n !== "list_sites" && !fixtures.has(n));
    const noTool = [...fixtures.keys()].filter((n) => !tools.has(n));
    expect({ noEntry, noTool }).toEqual({ noEntry: [], noTool: [] });
  });

  for (const [name, entry] of fixtures) {
    it(name, async () => {
      const tool = tools.get(name);
      expect(tool, `${name} is not registered`).toBeDefined();
      expect(await checkTool(name, tool as Tool, entry)).toEqual([]);
    });
  }
});

// The check itself must be able to fail: synthetic tools with known drift.
describe("drift: checkTool goes red on known drift", () => {
  const entry: DriftEntry = {
    method: "PUT",
    route: "/x/{id}",
    source: "synthetic",
    server: ["a", "b"],
    path: ["id"],
    fields: ["a", "b"],
  };
  const make = (schema: z.ZodRawShape, send: (args: Record<string, unknown>) => Record<string, unknown>, method: Call["method"] = "PUT"): Tool => ({
    schema,
    handler: async (args) => record(method)(`/x/${args.id}`, send(args)),
  });
  const full = { site: z.string(), id: z.number(), a: z.string().optional(), b: z.number().optional() };

  it("green for a tool that matches", async () => {
    expect(await checkTool("t", make(full, ({ a, b }) => ({ a, b })), entry)).toEqual([]);
  });

  it("red when the tool lost a field the endpoint accepts", async () => {
    const { b: _b, ...lost } = full;
    const problems = await checkTool("t", make(lost, ({ a }) => ({ a })), entry);
    expect(problems.join("\n")).toMatch(/schema keys/);
    expect(problems.join("\n")).toMatch(/sends/);
  });

  it("red when the fixture drops the field but the endpoint still accepts it", async () => {
    const { b: _b, ...lost } = full;
    const problems = await checkTool("t", make(lost, ({ a }) => ({ a })), { ...entry, fields: ["a"] });
    expect(problems).toEqual([`endpoint accepts "b" but the tool does not expose it`]);
  });

  it("red when the tool sends a field the endpoint does not accept", async () => {
    const problems = await checkTool(
      "t",
      make({ ...full, c: z.string() }, ({ a, b, c }) => ({ a, b, c })),
      { ...entry, fields: ["a", "b", "c"] }
    );
    expect(problems).toEqual([`sends "c", which the endpoint does not accept`]);
  });

  it("red when the tool accepts a field but does not send it", async () => {
    const problems = await checkTool("t", make(full, ({ a }) => ({ a })), entry);
    expect(problems.join("\n")).toMatch(/sends \["a"\] != fixture \["a","b"\]/);
  });

  it("red on the wrong method", async () => {
    const problems = await checkTool("t", make(full, ({ a, b }) => ({ a, b }), "POST"), entry);
    expect(problems.join("\n")).toMatch(/no PUT \/x\/\{id\}/);
  });
});
