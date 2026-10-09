# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.8.0] - 2026-10-09

### Added
- Fort tools through the Bearfort API (no SSH), for sites hosted on Bearfort. They need
  `BEARFORT_API_KEY` (admin key; optional `BEARFORT_API_URL`) and fail closed without it.
  A site's fort is found from its URL (`<hex>.bearfort.io`, or the fort's domain).
  - `fort_backup_create`, `fort_backup_list`, `fort_job_get` (restore deliberately not exposed)
  - `fort_cache_purge`: nginx page cache + the fort's object-cache keys + OPcache
  - `fort_logs_read`: access, error, php, wp-cron with `lines`, `grep`, `since` applied on
    the worker; secret URL parameters and credential shapes masked
- Needs Bearfort fleet 2026-10-09.1+ (worker log paths, cache purge and Content-Length fixes).

## [3.7.1] - 2026-10-08

### Changed
- `mcp_scan_uploads` describes `reason` and the known-plugin-file rule (cvrt-mcp-endpoints 1.16.1).

## [3.7.0] - 2026-10-08

Needs cvrt-mcp-endpoints 1.16.0 for the new tools.

### Added
- `mcp_check_plugin_updates`: run Plugin Update Checker (GitHub-released plugins) and wp.org checks now; lists updates with source.
- `mcp_update_plugin` takes `refresh` to check first, so a just-released GitHub update installs without SSH.
- `mcp_get_action_scheduler` / `mcp_run_action_scheduler`: queue status (failures secret-masked) and on-demand run of due actions.
- `mcp_scan_uploads`: executable files under uploads with sha256 and a benign flag.
- `mcp_get_audit_log`: the site's audit trail of state-changing MCP calls.

### Changed
- `mcp_run_cron` describes the 1.16.0 behaviour (reschedule/unschedule like `wp cron event run`, `next_run_timestamp`).
- `mcp_flush_cache` says it does not purge a page cache in front of WordPress.

## [3.6.0] - 2026-10-08

### Security
- Every tool result is secret-masked on the way out (`src/mask.ts`, same rules as
  cvrt-mcp-endpoints 1.15.0 `Cvrt_MCPE_Secrets`): values under secret-looking keys
  (token, secret, password, api_key, whsec, signing_key, ...) and credential shapes
  (`sk_live_`, `rk_live_`, `whsec_`, GitHub/GitLab/Slack/AWS/SendGrid tokens, any
  PEM block) are replaced by `[masked]`, recursively and inside JSON strings. A fort
  on an older mu-plugin or another plugin's endpoint can no longer leak a secret
  through a tool. WordPress error bodies are masked too. Masking happens only at
  the output, never on data a tool writes back.

### Added
- Drift check (`src/drift.test.ts`, `src/drift/*.json`): every tool is verified
  against a fixture of the endpoint it calls (route, method, every accepted param).
- Tools expose the filters and fields their endpoints accept; partial updates send
  only the fields set.

### Removed
- `fulfillment_update_apply`: cvrt-order-fulfillment deliberately has no
  update-apply route (a plugin must not upgrade itself in-request).

## [3.5.0] - 2026-10-01

### Added
- `fields_*` (12 tools) for cvrt-fields 0.1.2+ (`mcp/fields/v1`): `fields_status`, `fields_get_settings` / `fields_update_settings` (update token write-only, stored encrypted), `fields_list_types`, `fields_get_location_values`, `fields_get_schema`, and `fields_list_definitions` / `fields_get_definition` / `fields_create_definition` / `fields_update_definition` / `fields_delete_definition` / `fields_sync_definition` for field groups, post types, taxonomies and options pages. Keys are validated against `[a-z0-9_]+` before they reach the URL.

## [3.4.0] - 2026-09-29

### Added
- `legal_get_accessibility_report` / `legal_reset_accessibility_report` for cvrt-legal 0.9.0's markup repair report.
- `legal_put_accessibility` takes `repairs` (rule => on/off).
- Document and generator tools accept `barrierefreiheit` (BFSG statement, cvrt-legal 0.9.0+).

## [3.3.0] - 2026-09-29

### Added
- Every cvrt-legal admin route is now a tool, so a rollout never falls back to raw REST:
  - `legal_get_facts` / `legal_put_facts` - Impressum fields (cvrt-legal 0.7.0+)
  - `legal_get_generator` / `legal_put_generator` - tick Datenschutz modules and options, regenerate (0.7.0+)
  - `legal_get_generator_library` / `legal_put_generator_library` - import a text library, inline or from a local `.json` file (`library_file`), since the Datenschutz library is ~120 KB (0.7.0+)
  - `legal_restore_generator` - back to the document before generation (0.7.0+)
  - `legal_get_social` / `legal_put_social` / `legal_get_social_modules` / `legal_put_social_modules` (`modules_file`) - the social-media section (0.6.0+)
  - `legal_update_settings` - GitHub token (write-only) and required-document override
  - `legal_get_accessibility` / `legal_put_accessibility` - the self-hosted accessibility tool that replaces the Ally widget (0.8.0+)
- Tests for all of them, including the file-import errors (both/neither source, non-.json, invalid JSON, non-object).

## [3.2.1] - 2026-09-28

### Fixed
- `wp_activate_theme` never switched a theme: it POSTed `stylesheet` to `/wp/v2/settings`, which WordPress ignores, and still answered `{"activated": ...}`. It now uses `POST /mcp/v1/themes/activate` and returns an error when the theme is not active afterwards.

### Added
- `mcp_update_elementor_element` takes `widget_type` (replace a widget in place) and `settings_mode` (`merge` | `replace`), both supported by cvrt-mcp-endpoints since 1.13.0 but unreachable through the tool.
- Tests for both tools (`themes.test.ts`, `mcp-elementor.test.ts`).

## [3.2.0] - 2026-09-24

### Added
- `legal_consent_log_get` / `legal_consent_log_stats` / `legal_consent_log_export` for the cvrt-legal consent decision log (`mcp/legal/v1/consent/log*`, needs cvrt-legal 0.5.0+). Reads require `manage_options`; logging itself stays off on the plugin side until `legal_put_consent`'s new `log_enabled` is set, which should only happen after the Datenschutz document has an `einwilligungsnachweis` section describing it.
- `legal_put_consent` takes optional `log_enabled: boolean`.

## [3.1.0] - 2026-09-24

### Added
- `legal_get_page` / `legal_link_page`: link a cvrt-legal document to its page (needs cvrt-legal 0.4.2). Linking mirrors the rendered text into the page and fills the consent banner's imprint/privacy link while it is unset. `page_id: 0` unlinks.
- `legal_*` tools (15) for the cvrt-legal plugin (`mcp/legal/v1`): documents, sections, render, consent banner, theme, settings, status.
- `legal_put_consent` takes `ga4_id` and `ahrefs_key`; the loader defaults to googletagmanager.com.
- `seo_*` tools (31) for cvrt-seo-manager (`mcp/seo/v1`): per-post/term SEO, analysis, redirects, 404 monitor, sitemaps, IndexNow, import/export, RankMath migration.
- First unit tests for the legal tools (`src/tools/legal.test.ts`).

## [3.0.0] - 2026-07-19

### Changed (BREAKING)
- Multi-site: sites are now defined in a single `WORDPRESS_SITES` env var (JSON array of `{id, url, username, password}`). The old `WORDPRESS_SITE_URL` / `WORDPRESS_USERNAME` / `WORDPRESS_PASSWORD` vars are removed.
- Every tool now requires a `site` argument naming the target site id. Use the new `list_sites` tool to discover configured ids.
- `wp_activate_plugin` / `wp_deactivate_plugin` / `wp_delete_plugin` now use the `cvrt-mcp-endpoints` `mcp/v1` routes instead of the core `wp/v2/plugins` route (avoids hosts that block it). Their `plugin` argument is now the plugin file path (e.g. `akismet/akismet.php`).

### Added
- `list_sites` tool.

## [2.1.0]

### Added
- Order-fulfillment tools (`fulfillment_*`) wrapping the cvrt-order-fulfillment plugin's MCP admin API (`mcp/fulfillment/v1/admin/*`): get/update settings (secrets masked), status, queue, reprint job, force-fulfill order, and update-check/update-apply. Requires the plugin v0.2.0+ and manage_woocommerce (app-password auth).

## [1.0.0] - 2026-02-02

### Added
- Initial release with 42 tools
- Posts: CRUD, revisions, meta, terms
- Pages, media, comments management
- Users, categories, tags
- Plugins and themes listing
- Settings and options
- Search and site info
- Token-optimized API responses
