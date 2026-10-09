/**
 * Fort tools: operations on the Bearfort worker that hosts a site (backups,
 * jobs, logs). They go through the Bearfort API (src/bearfort.ts), never SSH,
 * and need BEARFORT_API_KEY. Restore is deliberately not exposed.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { filterLog, forFort } from "../bearfort.js";
import { defined, jsonResult } from "../types.js";

const site = z.string().describe("Site id (see list_sites); must be hosted on Bearfort");

export function register(server: McpServer) {
  server.tool(
    "fort_backup_create",
    "Start a backup of the site's whole fort (files + database) on Bearfort now, e.g. before risky changes. Returns { jobId, status }; follow it with fort_job_get. Audit-logged by Bearfort. Needs BEARFORT_API_KEY.",
    { site },
    async ({ site: id }) => {
      const fort = await forFort(id);
      return jsonResult({ fort: fort.hex, ...(await fort.post<Record<string, unknown>>("/backup")) });
    }
  );

  server.tool(
    "fort_backup_list",
    "List the fort's backup generations on Bearfort (newest first, as the worker reports them). Restore is not available here: use the Bearfort dashboard. Needs BEARFORT_API_KEY.",
    { site },
    async ({ site: id }) => {
      const fort = await forFort(id);
      return jsonResult({ fort: fort.hex, ...(await fort.get<Record<string, unknown>>("/backups")) });
    }
  );

  server.tool(
    "fort_job_get",
    "Status of a Bearfort job on this fort (backup, restore, migration, ...). with_log:true adds the job's log text. Needs BEARFORT_API_KEY.",
    {
      site,
      job_id: z.string().uuid().describe("Job id (e.g. from fort_backup_create)"),
      with_log: z.boolean().optional().describe("Also return the job log"),
    },
    async ({ site: id, job_id, with_log }) => {
      const fort = await forFort(id);
      const job = await fort.get<Record<string, unknown>>(`/jobs/${job_id}`);
      if (!with_log) return jsonResult({ fort: fort.hex, job });
      const log = filterLog(await fort.getText(`/jobs/${job_id}/log`), { lines: 500 });
      return jsonResult({ fort: fort.hex, job, log });
    }
  );

  server.tool(
    "fort_cache_purge",
    "Purge the fort's nginx page cache (through Bearfort's cache-purge service, the same request WordPress itself makes on content changes), flush the fort's own object-cache keys and reset OPcache. details says 'Page cache: purged', or 'requested' if the purger had not run yet (it runs every 2 s). Needs BEARFORT_API_KEY and Bearfort fleet 2026-10-08.3+ (before that the page cache was not actually purged).",
    { site },
    async ({ site: id }) => {
      const fort = await forFort(id);
      return jsonResult({ fort: fort.hex, ...(await fort.post<Record<string, unknown>>("/cache/clear")) });
    }
  );

  server.tool(
    "fort_logs_read",
    "Read the fort's server logs: access (nginx), error (nginx), php (PHP errors) or wp-cron (its systemd journal). Filters run on the worker: lines = last N matching lines (1-2000, default 200), grep = keep lines containing this text (case-insensitive literal, no regex), since = drop lines older than this ISO time with zone (stack-trace lines stay with their entry). A missing log is an error, not an empty answer. Secret URL parameters (token=, key=, pass=, ...) and credential shapes are masked. Needs BEARFORT_API_KEY (Bearfort fleet 2026-10-08.3+ for the filters).",
    {
      site,
      type: z.enum(["access", "error", "php", "wp-cron"]).describe("Which log"),
      lines: z.number().int().min(1).max(2000).optional().describe("Last N matching lines (default 200)"),
      grep: z.string().min(1).max(200).optional().describe("Keep only lines containing this text"),
      since: z.string().datetime({ offset: true }).optional().describe("Only lines at or after this time, e.g. 2026-10-08T12:00:00Z"),
    },
    async ({ site: id, type, lines, grep, since }) => {
      const fort = await forFort(id);
      const text = await fort.getText(`/logs/${type}`, defined({ lines, grep, since }));
      const out = filterLog(text, { lines: lines ?? 2000 });
      return jsonResult({ fort: fort.hex, type, count: out.length, lines: out });
    }
  );
}
