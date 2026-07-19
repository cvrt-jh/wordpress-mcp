# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
