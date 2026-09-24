# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
