/**
 * Image optimization tools using the [cvrt] Media plugin.
 * Requires: [cvrt] Media >= 0.1.0 with the mcp/media/v1 API, capability manage_options
 * (satisfied by the app-password used by this MCP server). The GitHub updater token is
 * write-only and returned as { set: boolean }. File replace is not exposed: it needs a
 * file upload, WP-CLI covers it. These tools are separate from the cvrt-mcp-endpoints
 * `mcp_*_media` tools, which manage the WordPress media library itself.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { forSite } from "../client.js";
import { defined, jsonResult } from "../types.js";

const NS = "/mcp/media/v1";

const site = z.string().describe("Site id (see list_sites)");
const id = z.number().int().min(1).describe("Attachment id");

/** Same bounds as Cvrt_Media_Rest_Api::int_arg(). */
const limit = (max: number, what: string) =>
  z.number().int().min(1).max(max).describe(`${what}, 1..${max}`);

const confirm = z
  .boolean()
  .optional()
  .describe("Must be true for the action to run; anything else makes the site refuse it with 400");

/** `confirm: true` only when the caller passed exactly true. */
const confirmed = (value: boolean | undefined): Record<string, unknown> => (value === true ? { confirm: true } : {});

const LIST_STATUSES = ["optimized", "no-gain", "skipped", "restored", "failed", "pending"] as const;

export function register(server: McpServer) {
  server.tool(
    "media_get_status",
    "[cvrt] Media status: plugin version, available encoders (WebP/AVIF), entitlement, Elementor Image Optimizer state, and which configured output formats are missing on this server.",
    { site },
    async ({ site }) => jsonResult(await forSite(site).get<Record<string, unknown>>(`${NS}/status`))
  );

  server.tool(
    "media_get_settings",
    "Get the [cvrt] Media settings (output format, level, qualities, max dimension, metadata, backup retention, SVG). The GitHub updater token is write-only and shown as { set: boolean }.",
    { site },
    async ({ site }) => jsonResult(await forSite(site).get<Record<string, unknown>>(`${NS}/settings`))
  );

  server.tool(
    "media_update_settings",
    "Update [cvrt] Media settings; omitted keys keep their value, and nothing is stored when any value is invalid. github_token is write-only: it is never returned, and a blank value keeps the stored token. To remove the token pass clear_github_token: true explicitly.",
    {
      site,
      optimize_on_upload: z.boolean().optional().describe("Optimize new uploads in the background queue"),
      output_format: z
        .enum(["webp_avif", "webp", "keep"])
        .optional()
        .describe("webp_avif (WebP main, AVIF extra), webp, or keep (original format)"),
      level: z.enum(["lossy", "lossless"]).optional().describe("Compression level"),
      quality_webp: z.number().int().min(1).max(100).optional().describe("WebP quality, 1..100"),
      quality_avif: z.number().int().min(1).max(100).optional().describe("AVIF quality, 1..100"),
      quality_jpeg: z.number().int().min(1).max(100).optional().describe("JPEG quality, 1..100"),
      webp_method: z.number().int().min(0).max(6).optional().describe("WebP encoder method, 0 (fast) to 6 (slow, smaller)"),
      avif_speed: z.number().int().min(0).max(10).optional().describe("AVIF encoder speed, 0 (slow, smaller) to 10 (fast)"),
      max_dimension: z
        .number()
        .int()
        .refine((v) => v === 0 || (v >= 320 && v <= 10000), "0 (no resizing) or 320..10000")
        .optional()
        .describe("Longest side in px; 0 disables resizing, otherwise 320..10000"),
      strip_metadata: z.boolean().optional().describe("Remove EXIF and other metadata"),
      keep_copyright: z.boolean().optional().describe("Keep the copyright field when stripping metadata"),
      backup_retention_days: z
        .number()
        .int()
        .min(0)
        .max(3650)
        .optional()
        .describe("Days to keep backups of originals before automatic cleanup, 0..3650"),
      svg_enabled: z.boolean().optional().describe("Allow safe SVG upload"),
      svg_roles: z.array(z.string()).optional().describe("Roles allowed to upload SVG"),
      remove_data_on_uninstall: z.boolean().optional().describe("Delete plugin data when the plugin is deleted"),
      github_token: z
        .string()
        .optional()
        .describe("GitHub token for plugin updates. Write-only; blank keeps the stored token"),
      clear_github_token: z.boolean().optional().describe("true removes the stored GitHub token"),
    },
    async ({ site, ...settings }) =>
      jsonResult(await forSite(site).post<Record<string, unknown>>(`${NS}/settings`, defined(settings)))
  );

  server.tool(
    "media_get_stats",
    "Library statistics: attachments by state, bytes saved, and the backup summary.",
    { site },
    async ({ site }) => jsonResult(await forSite(site).get<Record<string, unknown>>(`${NS}/stats`))
  );

  server.tool(
    "media_list_attachments",
    "List image attachments, newest first, with their optimization records, optionally filtered by status.",
    {
      site,
      page: z.number().int().min(1).optional().describe("Page, default 1"),
      per_page: z.number().int().min(1).max(100).optional().describe("Per page, 1..100, default 20"),
      status: z.enum(LIST_STATUSES).optional().describe("Only attachments in this state"),
    },
    async ({ site, ...query }) =>
      jsonResult(await forSite(site).get<Record<string, unknown>>(`${NS}/attachments`, defined(query) as Record<string, string | number>))
  );

  server.tool(
    "media_get_attachment",
    "One attachment: its optimization records, job history and whether a file replace can be undone.",
    { site, id },
    async ({ site, id }) => jsonResult(await forSite(site).get<Record<string, unknown>>(`${NS}/attachments/${id}`))
  );

  server.tool(
    "media_optimize_attachment",
    "Optimize one attachment now. The optimized file replaces the original in uploads; a backup of the original is kept per the retention setting.",
    { site, id },
    async ({ site, id }) =>
      jsonResult(await forSite(site).post<Record<string, unknown>>(`${NS}/attachments/${id}/optimize`, {}))
  );

  server.tool(
    "media_restore_attachment",
    "Restore one attachment's original from its backup, replacing the optimized files. Fails when the backup was cleaned up; force: true restores even when the attachment was edited since.",
    { site, id, force: z.boolean().optional().describe("Restore even if the attachment changed since optimizing") },
    async ({ site, id, force }) =>
      jsonResult(await forSite(site).post<Record<string, unknown>>(`${NS}/attachments/${id}/restore`, defined({ force })))
  );

  server.tool(
    "media_reoptimize_attachment",
    "Re-optimize one attachment from its backed-up original with the current settings.",
    { site, id },
    async ({ site, id }) =>
      jsonResult(await forSite(site).post<Record<string, unknown>>(`${NS}/attachments/${id}/reoptimize`, {}))
  );

  server.tool(
    "media_undo_replace",
    "Undo the last file replace of one attachment (needs edit rights on the attachment). Only possible while can_undo_replace is true in media_get_attachment.",
    { site, id },
    async ({ site, id }) =>
      jsonResult(await forSite(site).post<Record<string, unknown>>(`${NS}/attachments/${id}/replace/undo`, {}))
  );

  server.tool(
    "media_get_bulk",
    "Bulk optimization state: running, paused or idle, with counts of done, pending and failed jobs.",
    { site },
    async ({ site }) => jsonResult(await forSite(site).get<Record<string, unknown>>(`${NS}/bulk`))
  );

  server.tool(
    "media_bulk_action",
    "Control bulk optimization: start (queues every attachment; type and include_restored apply only to start), pause, resume, cancel, or retry (re-queues the failed jobs).",
    {
      site,
      action: z.enum(["start", "pause", "resume", "cancel", "retry"]).describe("Bulk action"),
      type: z.enum(["optimize", "reoptimize"]).optional().describe("start only: optimize new files or reoptimize already optimized ones; default optimize"),
      include_restored: z.boolean().optional().describe("start only: also queue attachments that were restored on purpose"),
    },
    async ({ site, action, type, include_restored }) =>
      jsonResult(
        await forSite(site).post<Record<string, unknown>>(
          `${NS}/bulk/${action}`,
          action === "start" ? defined({ type, include_restored }) : {}
        )
      )
  );

  server.tool(
    "media_bulk_step",
    "Run one bulk batch (up to 20 jobs) now, for sites without a working cron. The site allows one step per 2 seconds per user and answers 429 otherwise.",
    { site },
    async ({ site }) => jsonResult(await forSite(site).post<Record<string, unknown>>(`${NS}/bulk/step`, {}))
  );

  server.tool(
    "media_bulk_restore",
    "Restore the originals of EVERY optimized attachment (one restore job each), replacing all optimized files. Large and slow; attachments whose backup was cleaned up cannot be restored. Needs confirm: true, otherwise the site refuses with 400.",
    { site, confirm },
    async ({ site, confirm }) =>
      jsonResult(await forSite(site).post<Record<string, unknown>>(`${NS}/bulk/restore`, confirmed(confirm)))
  );

  server.tool(
    "media_get_backups",
    "Backup summary of originals: count, bytes, oldest backup and whether a backup directory is configured. Never returns the path.",
    { site },
    async ({ site }) => jsonResult(await forSite(site).get<Record<string, unknown>>(`${NS}/backups`))
  );

  server.tool(
    "media_cleanup_backups",
    "Delete backups of originals. DESTRUCTIVE: originals of cleaned images can no longer be restored. Needs exactly one scope: older_than_days (backups older than N days), ids (attachment ids, at most 500) or all: true (every backup). Returns { deleted, bytes, remaining, skipped }.",
    {
      site,
      older_than_days: z.number().int().min(0).max(3650).optional().describe("Scope: delete backups older than this many days, 0..3650"),
      ids: z.array(z.number().int().min(1)).max(500).optional().describe("Scope: attachment ids whose backups to delete, at most 500"),
      all: z.boolean().optional().describe("Scope: true deletes every backup"),
    },
    async ({ site, older_than_days, ids, all }) => {
      const scopes = [older_than_days !== undefined, ids !== undefined && ids.length > 0, all === true].filter(Boolean).length;
      if (scopes !== 1) {
        throw new Error("media_cleanup_backups needs exactly one scope: older_than_days, ids (non-empty) or all: true");
      }
      return jsonResult(
        await forSite(site).post<Record<string, unknown>>(
          `${NS}/backups/cleanup`,
          defined({ older_than_days, ids, all: all === true ? true : undefined })
        )
      );
    }
  );

  server.tool(
    "media_eio_dry_run",
    "Dry run of the Elementor Image Optimizer migration: what would be adopted, changes nothing.",
    { site },
    async ({ site }) => jsonResult(await forSite(site).get<Record<string, unknown>>(`${NS}/migration/eio`))
  );

  server.tool(
    "media_eio_run",
    "Import Elementor Image Optimizer's work (no re-encoding): its optimized sizes become [cvrt] Media records, links to its originals are rewritten to the current files, and its originals move into the backup store, up to limit attachments per call (repeat until done, each step is resumable). Changes records, content links and files on the site; run media_eio_dry_run first. Needs confirm: true, otherwise the site refuses with 400.",
    { site, confirm, limit: limit(500, "Most attachments adopted in this call").optional() },
    async ({ site, confirm, limit }) =>
      jsonResult(
        await forSite(site).post<Record<string, unknown>>(`${NS}/migration/eio/run`, { ...confirmed(confirm), ...defined({ limit }) })
      )
  );

  server.tool(
    "media_eio_cleanup",
    "Delete Elementor Image Optimizer's leftover metadata and image_optimizer_* options once the migration is complete (the site answers 409 while EIO is active or imports are pending). DESTRUCTIVE: the deleted EIO data cannot be recovered; [cvrt] Media records and backups stay. Needs confirm: true, otherwise the site refuses with 400.",
    { site, confirm },
    async ({ site, confirm }) =>
      jsonResult(await forSite(site).post<Record<string, unknown>>(`${NS}/migration/eio/cleanup`, confirmed(confirm)))
  );

  server.tool(
    "media_svg_backfill",
    "Write width and height into SVG attachments that have none, up to limit per call; returns { updated, remaining }.",
    { site, limit: limit(500, "Most SVG attachments handled in this call").optional() },
    async ({ site, limit }) =>
      jsonResult(await forSite(site).post<Record<string, unknown>>(`${NS}/svg/backfill`, defined({ limit })))
  );

  server.tool(
    "media_scan_urls",
    "Scan content and options for links to old image URLs (e.g. .jpg that became .webp), reading at most limit rows. Read-only.",
    { site, limit: limit(5000, "Most links checked and rows read").optional() },
    async ({ site, limit }) =>
      jsonResult(await forSite(site).get<Record<string, unknown>>(`${NS}/scan`, defined({ limit }) as Record<string, number>))
  );
}
