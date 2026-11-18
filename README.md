# wordpress-mcp

[![npm version](https://img.shields.io/npm/v/@cavort-it-systems/wordpress-mcp.svg)](https://www.npmjs.com/package/@cavort-it-systems/wordpress-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP SDK](https://img.shields.io/badge/MCP%20SDK-1.12.1-blue.svg)](https://modelcontextprotocol.io)

Lightweight WordPress MCP server for site management. **353 tools** with **token-optimized responses** - REST API responses automatically slimmed from kilobytes to essentials.

**v3.5**: `fields_*` (12 tools) for [cvrt-fields](https://github.com/cvrt-gmbh/cvrt-fields) 0.1.2+ - status, settings, field types, location values, schemas and CRUD + JSON sync for field groups, post types, taxonomies and options pages.

**v3.4**: cvrt-legal 0.9.0 - markup repair switches (`repairs` on `legal_put_accessibility`) and report (`legal_get_accessibility_report` / `legal_reset_accessibility_report`), document type `barrierefreiheit`.

**v3.3**: every cvrt-legal admin route is a tool - generator (`legal_*_generator*`, library import from a local file), Impressum facts, social-media section, settings, and the self-hosted accessibility tool (`legal_get_accessibility` / `legal_put_accessibility`, cvrt-legal 0.8.0+).

**v3.2**: `legal_consent_log_get` / `legal_consent_log_stats` / `legal_consent_log_export` for the cvrt-legal consent decision log (needs cvrt-legal 0.5.0+); `legal_put_consent` takes `log_enabled`.

**v3.1**: Tools for our own plugins - `seo_*` (31) for [cvrt-seo-manager](https://github.com/cvrt-gmbh/cvrt-seo-manager), `legal_*` (15) for [cvrt-legal](https://github.com/cvrt-gmbh/cvrt-legal) incl. `legal_link_page` (cvrt-legal 0.4.2+), and `fulfillment_*` (8) for cvrt-order-fulfillment.

**v3.0 (BREAKING)**: Multi-site - one server instance manages any number of sites via a single `WORDPRESS_SITES` env var. Every tool now requires a `site` argument; use the new `list_sites` tool to discover configured ids. The old single-site env vars are removed. `wp_activate_plugin` / `wp_deactivate_plugin` / `wp_delete_plugin` now use `cvrt-mcp-endpoints` `mcp/v1` routes and take the plugin file path (e.g. `akismet/akismet.php`) instead of a slug.

**v2.1**: Now includes Pro modules for ACF and WooCommerce via [wp-pilot-pro](https://github.com/cvrt-gmbh/wp-pilot-pro).

**v2.0**: Extended tools for the [cvrt-mcp-endpoints](https://github.com/cvrt-gmbh/cvrt-mcp-endpoints) plugin - install plugins/themes from WordPress.org, database management, full widget/menu control, and more.

## Why This Server?

WordPress REST API returns extremely verbose JSON (~5-10KB per post). This server strips it down:

| Response                   | Before | After      | Reduction |
| -------------------------- | ------ | ---------- | --------- |
| `wp_list_posts` (10 posts) | ~50KB  | ~2KB       | **96%**   |
| `wp_get_post`              | ~5KB   | ~200 bytes | **96%**   |
| `wp_list_plugins`          | ~15KB  | ~800 bytes | **95%**   |

Less tokens = faster responses, lower costs, more context for your AI.

## Installation

```bash
npm install -g @cavort-it-systems/wordpress-mcp
```

Or run directly:

```bash
npx @cavort-it-systems/wordpress-mcp
```

## Configuration

**v3.0 is multi-site (BREAKING CHANGE).** A single server instance now manages any number of WordPress sites, defined in one `WORDPRESS_SITES` env var as a JSON array of `{id, url, username, password}` objects. The old single-site env vars (`WORDPRESS_SITE_URL`, `WORDPRESS_USERNAME`, `WORDPRESS_PASSWORD`) are **no longer read** - set `WORDPRESS_SITES` instead.

Every tool (except `list_sites`) now requires a `site` argument naming the target site id. Call `list_sites` first to discover which ids are configured - it returns `{id, url}` for each site (passwords are never returned or logged).

### Claude Desktop / Manual

Add to your MCP config (`~/.claude.json` or Claude Desktop settings):

```json
{
	"mcpServers": {
		"wordpress": {
			"command": "npx",
			"args": ["@cavort-it-systems/wordpress-mcp"],
			"env": {
				"WORDPRESS_SITES": "[{\"id\":\"boardcouture\",\"url\":\"https://boardcouture.shop\",\"username\":\"cavortkonzepte\",\"password\":\"xxxx xxxx xxxx\"}]"
			}
		}
	}
}
```

Add more sites by appending objects to the `WORDPRESS_SITES` array - one server instance handles them all.

### Claude Code CLI

```bash
claude mcp add wordpress \
  -e WORDPRESS_SITES='[{"id":"boardcouture","url":"https://boardcouture.shop","username":"cavortkonzepte","password":"xxxx xxxx xxxx"}]' \
  -- npx @cavort-it-systems/wordpress-mcp
```

### From Source

```bash
git clone https://github.com/cvrt-jh/wordpress-mcp.git
cd wordpress-mcp
pnpm install --frozen-lockfile && pnpm run build
```

## Authentication

Uses **Application Passwords** (WordPress 5.6+):

1. Go to **Users → Profile** in WordPress admin
2. Scroll to **Application Passwords**
3. Create new password for "Claude MCP"
4. Use the generated password (keep the spaces)

## Response Slimming

All responses are automatically trimmed. Example:

**`wp_get_post`** - from ~5KB to ~200 bytes:

```json
// Before (WordPress REST API raw)
{"id":123,"date":"2026-01-15T10:30:00","date_gmt":"2026-01-15T09:30:00",
"guid":{"rendered":"https://example.com/?p=123"},"modified":"2026-01-20T14:00:00",
"modified_gmt":"2026-01-20T13:00:00","slug":"my-post","status":"publish",
"type":"post","link":"https://example.com/my-post/","title":{"rendered":"My Post"},
"content":{"rendered":"<p>Full content...</p>","protected":false},
"excerpt":{"rendered":"<p>Excerpt...</p>","protected":false},
"author":1,"featured_media":456,"comment_status":"open","ping_status":"open",
"sticky":false,"template":"","format":"standard","meta":{"footnotes":""},
"categories":[1,5],"tags":[10,20],"class_list":["post-123","type-post",...],
"_links":{"self":[...],"collection":[...],"about":[...],...}}

// After (slimmed)
{"id":123,"title":"My Post","slug":"my-post","status":"publish",
"date":"2026-01-15T10:30:00","modified":"2026-01-20T14:00:00",
"link":"https://example.com/my-post/","excerpt":"Excerpt...",
"author":1,"categories":[1,5],"tags":[10,20],"featured_media":456}
```

**What gets stripped:**

| Field                           | Where       | Why                                     |
| ------------------------------- | ----------- | --------------------------------------- |
| `guid`, `_links`                | everywhere  | Internal WordPress data                 |
| `content.rendered`              | lists       | Only included when explicitly requested |
| `meta`, `class_list`            | posts/pages | Theme/plugin metadata                   |
| `ping_status`, `comment_status` | posts       | Rarely needed                           |
| `template`, `format`, `sticky`  | posts       | Theme-specific                          |
| HTML tags                       | excerpts    | Clean text output                       |
| Pretty-print JSON               | all         | Compact single-line output              |

## Tools (353)

Every tool below requires a `site` argument (the id from your `WORDPRESS_SITES` config), except `list_sites` itself. The lists are generated from the registered tools (`pnpm run sync-docs`); a test fails when they drift.

<!-- tools:start (generated by `pnpm run sync-docs`, do not edit) -->

### Sites (1)

Requires nothing (reads `WORDPRESS_SITES`; no `site` argument).

- `list_sites` - List the WordPress sites this server can manage

### Site (4)

Requires any WordPress site (core REST API, `wp/v2`).

- `wp_site_info` - Get WordPress site information (name, description, URL, timezone)
- `wp_get_settings` - Get the WordPress settings exposed by wp/v2/settings (title, tagline, url, email, timezone, date/time format, language, reading and discussion settings, site logo/icon, plus plugin-registered ones)
- `wp_update_settings` - Update WordPress site settings (only the given fields change); returns all settings afterwards
- `wp_get_namespaces` - List available REST API namespaces (plugins may add custom endpoints)

### Posts (6)

Requires any WordPress site (core REST API, `wp/v2`).

- `wp_list_posts` - List WordPress posts with optional filters
- `wp_get_post` - Get a single post by ID (content, when requested, is the raw stored markup)
- `wp_create_post` - Create a new WordPress post
- `wp_update_post` - Update an existing post (only the given fields change)
- `wp_delete_post` - Delete a post (moves to trash, or permanently if force=true)
- `wp_search_posts` - Search posts by keyword (shortcut; wp_list_posts has every filter)

### Pages (5)

Requires any WordPress site (core REST API, `wp/v2`).

- `wp_list_pages` - List WordPress pages
- `wp_get_page` - Get a single page by ID (content, when requested, is the raw stored markup)
- `wp_create_page` - Create a new WordPress page
- `wp_update_page` - Update an existing page (only the given fields change)
- `wp_delete_page` - Delete a page (moves to trash, or permanently if force=true)

### Users (6)

Requires any WordPress site (core REST API, `wp/v2`).

- `wp_list_users` - List WordPress users
- `wp_me` - Get the currently authenticated user
- `wp_get_user` - Get a user by ID
- `wp_create_user` - Create a new WordPress user
- `wp_update_user` - Update an existing user (only the given fields change)
- `wp_delete_user` - Delete a user permanently, reassigning their content to another user

### Plugins (5)

Requires any WordPress site (core REST API, `wp/v2`).

- `wp_list_plugins` - List all installed plugins
- `wp_get_plugin` - Get plugin details by slug
- `wp_activate_plugin` - Activate an installed plugin (via cvrt-mcp-endpoints, avoids the often-blocked core route)
- `wp_deactivate_plugin` - Deactivate an installed plugin (via cvrt-mcp-endpoints)
- `wp_delete_plugin` - Delete an installed plugin (via cvrt-mcp-endpoints; deactivates first)

### Themes (4)

Requires any WordPress site (core REST API, `wp/v2`).

- `wp_list_themes` - List all installed themes
- `wp_get_active_theme` - Get the currently active theme
- `wp_get_theme` - Get theme details by stylesheet name
- `wp_activate_theme` - Activate a theme (switch themes)

### Media (4)

Requires any WordPress site (core REST API, `wp/v2`).

- `wp_list_media` - List media library items
- `wp_get_media` - Get a media item by ID
- `wp_update_media` - Update media item metadata (title, alt text, caption, description, attachment, ...); only the given fields change
- `wp_delete_media` - Delete a media item and its files

### Categories & Tags (8)

Requires any WordPress site (core REST API, `wp/v2`).

- `wp_list_categories` - List categories
- `wp_create_category` - Create a new category
- `wp_update_category` - Update a category (only the given fields change)
- `wp_delete_category` - Delete a category permanently (its posts fall back to the default category)
- `wp_list_tags` - List tags
- `wp_create_tag` - Create a new tag
- `wp_update_tag` - Update a tag (only the given fields change)
- `wp_delete_tag` - Delete a tag permanently

### Comments (6)

Requires any WordPress site (core REST API, `wp/v2`).

- `wp_list_comments` - List comments
- `wp_get_comment` - Get a comment by ID
- `wp_create_comment` - Create a comment on a post (or a block note with type=note)
- `wp_update_comment` - Update a comment (approve, edit content, move, ...); only the given fields change
- `wp_delete_comment` - Delete a comment (moves to trash, or permanently if force=true)
- `wp_moderate_comments` - Batch moderate comments by status

### Plugin Management (6)

Requires the cvrt-mcp-endpoints mu-plugin.

- `mcp_search_plugins` - Search the WordPress.org plugin repository
- `mcp_install_plugin` - Install a plugin from WordPress.org by slug
- `mcp_update_plugin` - Update a single plugin to the latest version. refresh:true first runs a fresh update check for it (wp.org and Plugin Update Checker / GitHub releases), so a just-released update is seen without ...
- `mcp_check_plugin_updates` - Check for plugin updates now: runs every Plugin Update Checker instance (GitHub-released plugins such as the cvrt-* and wp-woo-pdf-builder; their own check otherwise runs every 12 h) and a fresh ...
- `mcp_update_all_plugins` - Update all plugins with available updates. cvrt-mcp-endpoints itself is never bulk-updated and is listed under skipped
- `mcp_install_plugin_zip` - Install a plugin from a ZIP URL (GitHub releases, custom sources)

### Theme Management (6)

Requires the cvrt-mcp-endpoints mu-plugin.

- `mcp_search_themes` - Search the WordPress.org theme repository
- `mcp_install_theme` - Install a theme from WordPress.org by slug
- `mcp_update_theme` - Update a single theme to latest version
- `mcp_update_all_themes` - Update all themes with available updates
- `mcp_delete_theme` - Delete an inactive theme (the active theme is refused)
- `mcp_install_theme_zip` - Install a theme from a ZIP, either a public URL (url, must end in .zip) or a local file (file_path, absolute path to a .zip, max 64 MB)

### Core Management (6)

Requires the cvrt-mcp-endpoints mu-plugin.

- `mcp_get_version` - Get WordPress version and update status
- `mcp_get_system_info` - Get comprehensive system information
- `mcp_check_updates` - Force a check for WordPress core, plugin, and theme updates
- `mcp_update_core` - Update WordPress to the latest version
- `mcp_flush_rewrite` - Flush permalink rewrite rules
- `mcp_flush_cache` - Flush the WordPress object cache and delete all transients and site transients

### Database Management (5)

Requires the cvrt-mcp-endpoints mu-plugin.

- `mcp_get_tables` - List the site's database tables (current table prefix only) with data/index size in MB and approximate row count, largest first
- `mcp_search_replace` - Search and replace a string in every text column of the site's tables (current table prefix only)
- `mcp_optimize_tables` - Run OPTIMIZE TABLE on every table with the site's table prefix
- `mcp_clean_revisions` - Delete old post revisions, keeping the newest `keep` per post
- `mcp_clean_comments` - Permanently delete all spam and trashed comments

### Options Management (5)

Requires the cvrt-mcp-endpoints mu-plugin.

- `mcp_list_options` - List WordPress options (name ascending) with an optional name prefix filter
- `mcp_get_option` - Get a single option value
- `mcp_set_option` - Create or update an option (any option, no allow-list: be careful with siteurl, home, active_plugins etc.)
- `mcp_delete_option` - Delete an option (404 if it does not exist)
- `mcp_bulk_get_options` - Get multiple options at once

### Menu Management (10)

Requires the cvrt-mcp-endpoints mu-plugin.

- `mcp_list_menus` - List all navigation menus (id, name, slug, item count, assigned locations)
- `mcp_get_menu_locations` - Get registered menu locations and the menu assigned to each
- `mcp_get_menu` - Get a menu with all its items
- `mcp_create_menu` - Create a new navigation menu
- `mcp_delete_menu` - Delete a navigation menu
- `mcp_add_menu_item` - Add an item to a menu
- `mcp_delete_menu_item` - Delete a menu item
- `mcp_update_menu` - Rename a navigation menu (the menu's description and parent are kept)
- `mcp_update_menu_item` - Partially update a menu item: only the given fields are sent and changed, every other stored field (type, linked object, url, ...) is kept (cvrt-mcp-endpoints 1.14.2+)
- `mcp_assign_menu_location` - Assign a menu to a registered theme location (see mcp_get_menu_locations); menu_id 0 unassigns

### Widget Management (9)

Requires the cvrt-mcp-endpoints mu-plugin.

- `mcp_list_sidebars` - List all registered sidebars
- `mcp_get_sidebar_widgets` - Get all widgets in a sidebar
- `mcp_list_widget_types` - List all available widget types
- `mcp_get_widget` - Get a widget's details
- `mcp_add_widget` - Add a widget to a sidebar
- `mcp_update_widget` - Update a widget's settings
- `mcp_delete_widget` - Remove a widget from its sidebar
- `mcp_reorder_widgets` - Set the widget order of a sidebar
- `mcp_move_widget` - Move a widget to a different sidebar

### Health & Diagnostics (10)

Requires the cvrt-mcp-endpoints mu-plugin.

- `mcp_get_health` - Get a quick site health status and score (100 minus 20 per issue: WP_DEBUG on, no HTTPS, pending updates)
- `mcp_get_debug_info` - Get debug information: WordPress settings, server, database (name, prefix, charset), paths and debug constants
- `mcp_get_php_info` - Get PHP configuration details
- `mcp_get_plugins_health` - Get plugin health status and available updates
- `mcp_get_cron_status` - Get WordPress cron status: schedules and the next 50 events (total_events counts all)
- `mcp_run_cron` - Run the earliest scheduled event of a cron hook now, like `wp cron event run`: a recurring event moves to its next slot, a single event is unscheduled, then the hook fires (404 if not scheduled)
- `mcp_get_action_scheduler` - Action Scheduler queue (WooCommerce emails, webhooks, PDF jobs): counts per status, past_due pending actions and the 10 most recent failures with their last log message (secret-masked). ...
- `mcp_run_action_scheduler` - Run due (past-due pending) Action Scheduler actions now through Action Scheduler's own runner, oldest first
- `mcp_scan_uploads` - Scan the uploads directory for executable files (.php, .phtml, .phar, .pht, .phps, .shtml, .cgi, also double extensions like x.php.jpg)
- `mcp_get_audit_log` - Audit trail of state-changing MCP calls on this site (cron runs, Action Scheduler runs, update checks), newest first: time, action, user, context (secret-masked)

### Custom Post Types (6)

Requires the cvrt-mcp-endpoints mu-plugin.

- `mcp_list_post_types` - List all public post types (name, labels, hierarchical, has_archive, rest_base, supports, taxonomies, published count)
- `mcp_get_post_type` - Get detailed schema for a post type (supports, taxonomies, counts per status, labels)
- `mcp_list_cpt_posts` - List posts of any post type (id, title, slug, status, date, modified, author, excerpt, parent) with paging totals
- `mcp_create_cpt_post` - Create a post of any post type
- `mcp_update_cpt_post` - Update a post of any post type
- `mcp_delete_cpt_post` - Delete a post of any post type (moves to trash unless force is true)

### Taxonomies and Terms (7)

Requires the cvrt-mcp-endpoints mu-plugin.

- `mcp_list_taxonomies` - List all public taxonomies (name, labels, hierarchical, post_types, rest_base, term count)
- `mcp_get_taxonomy` - Get taxonomy details (labels, description, hierarchical, post_types, term count)
- `mcp_list_terms` - List terms for any taxonomy (categories, tags, custom taxonomies): id, name, slug, description, parent, count
- `mcp_create_term` - Create a term in any taxonomy
- `mcp_update_term` - Update a term in any taxonomy
- `mcp_delete_term` - Delete a term from any taxonomy (permanent; terms have no trash)
- `mcp_assign_terms` - Assign taxonomy terms to a post

### Users and Roles (extended) (9)

Requires the cvrt-mcp-endpoints mu-plugin.

- `mcp_list_users` - List WordPress users (id, username, email, display_name, first_name, last_name, roles, registered) with role/search filters
- `mcp_get_user` - Get user details by ID (profile fields, roles, capabilities, registered, posts_count)
- `mcp_create_user` - Create a new WordPress user
- `mcp_update_user` - Update an existing user
- `mcp_delete_user` - Delete a user
- `mcp_list_roles` - List all available WordPress user roles (slug, name, capabilities, user count)
- `mcp_change_user_role` - Change a user's role (replaces all current roles)
- `mcp_get_user_meta` - Get all meta data for a user (keys starting with _ are hidden; single values are flattened)
- `mcp_update_user_meta` - Set meta data for a user (merged per key; keys are run through sanitize_key, so lowercase a-z0-9_-)

### Media Library (extended) (8)

Requires the cvrt-mcp-endpoints mu-plugin.

- `mcp_list_media` - List media library items (id, title, url, mime_type, date; images also alt, width, height) with paging totals
- `mcp_get_media` - Get detailed media item info (caption, description, filename, filesize, image sizes, attached_to)
- `mcp_sideload_media` - Upload media to WordPress from a public external URL (private/internal hosts are refused)
- `mcp_update_media` - Update media item metadata (title, alt text, caption, description)
- `mcp_delete_media` - Delete a media item and its files
- `mcp_bulk_delete_media` - Delete multiple media items at once
- `mcp_regenerate_thumbnails` - Regenerate image thumbnails for a media item (images only)
- `mcp_get_media_stats` - Get media library statistics (counts by MIME type, total size, upload path/url, max upload size)

### Elementor (11)

Requires the cvrt-mcp-endpoints mu-plugin and Elementor.

- `mcp_get_elementor_build` - Get full Elementor page build (containers, widgets, settings tree) with element and widget counts
- `mcp_get_elementor_flat` - Get flat list of all Elementor elements on a page (id, elType, widgetType, parent_id, depth, settings); easier to search/filter than the tree
- `mcp_get_elementor_element` - Get a single Elementor element with full settings, its parent id and child ids
- `mcp_update_elementor_element` - Update settings on a single Elementor element (merge by default)
- `mcp_get_elementor_page_settings` - Get Elementor page-level settings (hide title, custom CSS, etc.)
- `mcp_update_elementor_page_settings` - Update Elementor page-level settings
- `mcp_list_elementor_templates` - List Elementor library templates (headers, footers, singles, loop items, popups) with theme builder conditions; at most 100, ordered by title
- `mcp_get_elementor_conditions` - Get theme builder display conditions for an Elementor template (Elementor Pro)
- `mcp_get_elementor_kit` - Get Elementor global kit settings (colors, fonts, typography, spacing, button defaults)
- `mcp_update_elementor_kit` - Update Elementor global kit settings (colors, fonts, typography)
- `mcp_search_elementor` - Search published Elementor-built posts for widgets, settings, or text in string setting values (case-insensitive)

### ACF (11)

Requires wp-pilot-pro and ACF.

- `acf_list_field_groups` - List all ACF field groups with their fields (key, name, label, type)
- `acf_get_field_group` - Get ACF field group with full field configuration
- `acf_create_field_group` - Create an ACF field group with fields (active, shown in REST, labels on top)
- `acf_update_field_group` - Update an existing ACF field group
- `acf_delete_field_group` - Delete an ACF field group and its fields (stored post values are kept)
- `acf_export_field_group` - Export a field group in ACF JSON format (for import/backup)
- `acf_import_field_groups` - Import ACF field groups from JSON export format (each needs key, title and fields)
- `acf_get_post_fields` - Get all ACF field values for a post (name => { value, type, label })
- `acf_update_post_fields` - Update multiple ACF field values for a post (field names are run through sanitize_key, so use lowercase names or field keys)
- `acf_get_post_field` - Get a single ACF field value for a post
- `acf_update_post_field` - Update a single ACF field value for a post (updated is false when the value did not change)

### WooCommerce (39)

Requires wp-pilot-pro and WooCommerce.

- `woo_list_products` - List WooCommerce products (slim: id, name, slug, type, status, sku, prices, stock, category ids)
- `woo_get_product` - Get WooCommerce product details (descriptions, stock, tags, images, attributes, dates)
- `woo_create_product` - Create a WooCommerce product
- `woo_update_product` - Update a WooCommerce product; only the given fields change (type, images and attributes cannot be changed here)
- `woo_delete_product` - Delete a WooCommerce product (to trash unless force)
- `woo_list_variations` - List the available (purchasable, visible) variations of a variable product
- `woo_create_variation` - Create a variation of a variable product
- `woo_update_variation` - Update a product variation; only the given fields change
- `woo_delete_variation` - Delete a product variation permanently
- `woo_list_attributes` - List global product attributes
- `woo_list_attribute_terms` - List terms of a global attribute (including empty ones)
- `woo_create_attribute` - Create a global product attribute (taxonomy pa_{slug})
- `woo_create_attribute_term` - Create a term for a global attribute
- `woo_list_categories` - List product categories
- `woo_create_category` - Create a product category
- `woo_update_category` - Update a product category; only the given fields change
- `woo_delete_category` - Delete a product category
- `woo_list_tags` - List product tags (including empty ones)
- `woo_list_orders` - List WooCommerce orders (slim)
- `woo_get_order` - Get WooCommerce order details (payment, billing, shipping, line items, totals)
- `woo_update_order_status` - Update order status (triggers the usual WooCommerce status emails)
- `woo_add_order_note` - Add a note to an order
- `woo_get_order_notes` - Get order notes
- `woo_list_customers` - List WooCommerce customers (users with the given role)
- `woo_get_customer` - Get customer details (incl. billing and shipping address)
- `woo_create_customer` - Create a customer
- `woo_update_customer` - Update a customer; only the given fields (and address keys) change
- `woo_get_customer_orders` - Get a customer's latest 20 orders plus total spent and order count
- `woo_list_coupons` - List published WooCommerce coupons
- `woo_get_coupon` - Get coupon details
- `woo_create_coupon` - Create a coupon
- `woo_update_coupon` - Update a coupon; only the given fields change
- `woo_delete_coupon` - Delete a coupon permanently
- `woo_sales_report` - Get sales report (completed + processing orders)
- `woo_top_sellers` - Get top selling products by quantity (completed + processing orders)
- `woo_stock_report` - Get stock status report (stock-managed products, lowest stock first)
- `woo_get_product_meta` - Get all product meta data plus _regular_price, _sale_price, _price, _stock, _stock_status, _sku
- `woo_update_product_meta` - Update product meta data (merged; _regular_price, _sale_price, _stock, _stock_status, _sku go through the product setters)
- `woo_bulk_update_stock` - Bulk update product stock; per product only the given fields change

### Order Fulfillment (7)

Requires cvrt-order-fulfillment 0.2.0+.

- `fulfillment_get_settings` - Get the cvrt-order-fulfillment plugin settings
- `fulfillment_update_settings` - Update cvrt-order-fulfillment settings
- `fulfillment_status` - Pipeline health: which credentials are set, ClickUp list/assignee, when the print agent last polled, and print-queue counts
- `fulfillment_queue` - Print-queue state: status counts (pending/printing/printed/failed) and the 20 most recent jobs (id, order_id, type, status, attempts, error, created_at, printed_at)
- `fulfillment_reprint_job` - Reset a print job to pending so the agent prints it again
- `fulfillment_fulfill_order` - Manually (force) run fulfillment for an order: renders the packing slip, creates the ClickUp task, notifies Slack
- `fulfillment_update_check` - Force an immediate plugin-update check (bypassing PUC's throttle) and report { available, current, remote, error } (plus throttled: true when answered from the cached check, about once per 30s)

### Legal (37)

Requires [cvrt-legal](https://github.com/cvrt-gmbh/cvrt-legal) (`legal_get_page` / `legal_link_page` need 0.4.2+, `legal_consent_log_*` 0.5.0+, social 0.6.0+, generator and facts 0.7.0+, accessibility 0.8.0+).

- `legal_status` - Legal document status for a site: which documents are required, filled and published, plus a single compliant flag
- `legal_list_documents` - List all legal document types with their required/filled state and linked page
- `legal_get_document` - Get one legal document including its ordered sections
- `legal_put_document` - Replace a whole legal document (every section not listed is gone)
- `legal_render_document` - Render a document to normalized HTML without saving
- `legal_get_page` - Get which page a legal document is linked to: linked, page_id, the page's post status, and ok (linked AND published)
- `legal_link_page` - Link a legal document to its WordPress page (post type page only; posts and products are refused)
- `legal_add_section` - Append a section to a legal document (creates the document if it is still empty)
- `legal_update_section` - Update a section
- `legal_delete_section` - Delete a section from a legal document
- `legal_get_consent` - Get the cookie consent banner configuration: enabled, gtm_id, loader_url, ga4_id, ahrefs_key, ads_id, gtm_services { analytics, marketing }, privacy_page, imprint_page, log_enabled, backdrop
- `legal_put_consent` - Configure the consent banner and every tracking credential the site uses
- `legal_get_theme` - Get the banner theme: preset name, CSS custom property overrides and the rendered CSS
- `legal_put_theme` - Set the banner theme preset and/or individual CSS custom properties
- `legal_get_settings` - Get cvrt-legal settings
- `legal_consent_log_get` - Get every logged consent decision for one consent_id (the banner's own record of what it asked and what the visitor chose)
- `legal_consent_log_stats` - Aggregate consent decision counts by action and banner_version over a day range [from, to) (both optional, default the last 30 days including today; at most 366 days)
- `legal_consent_log_export` - Export the raw consent decision log as CSV for a day range (same optional from/to rules as legal_consent_log_stats)
- `legal_update_settings` - Update cvrt-legal settings. github_token (PUC auto-updates on a private repo) is write-only: a blank value keeps the stored one. required_override forces a document required or not ({agb: false})
- `legal_get_facts` - Get the Impressum fields (company, address, register, VAT id, ...) the generator fills into both Impressum and Datenschutz, plus which required ones are missing
- `legal_put_facts` - Set Impressum fields
- `legal_get_generator` - Get a generated document's state: active, library loaded, the selection (ticked modules, options, kept custom sections) and the sections it writes
- `legal_put_generator` - Tick or untick modules and options, then regenerate the document (the Datenschutz tab over the API)
- `legal_get_generator_library` - Get the imported text library of a generated document (the texts come from websites/bin/legal-v4/privacy, the plugin ships none)
- `legal_put_generator_library` - Import the text library of a generated document and regenerate it if active
- `legal_restore_generator` - Restore a generated document to how it was before the generator first wrote it, and stop generating it
- `legal_get_social` - Get the social-media section configurator: networks on offer, which are switched on with their profile URLs, and the rendered preview
- `legal_put_social` - Switch social networks and set their profile URLs (plain https only), then rewrite the Datenschutz social-media section; with nothing on, the section is removed
- `legal_get_social_modules` - Get the imported social-media text modules
- `legal_put_social_modules` - Import the social-media text modules, inline or as modules_file (websites/bin/legal-v4/social-media/library.json)
- `legal_get_accessibility` - Get the self-hosted accessibility tool's settings (enabled, position, colour, tools, statement link) and the tools on offer
- `legal_put_accessibility` - Configure the self-hosted accessibility tool (replaces the Ally widget; no third-party request, needs no consent)
- `legal_get_accessibility_report` - Get the markup repair report: totals per rule (fixed / open) and per page what was repaired and what is still open, i.e. what the site's own markup must fix
- `legal_reset_accessibility_report` - Clear the markup repair report, e.g. after fixing the source, so new page views record afresh
- `legal_get_shop_withdrawal` - Withdrawal function settings (Widerrufsbutton, § 356a BGB / § 13a FAGG) of cvrt-legal 0.12.1+ on a WooCommerce shop: whether WooCommerce's own withdrawal feature is on, the prescribed labels, single ...
- `legal_put_shop_withdrawal` - Change the withdrawal function settings; only the keys given change, an invalid value is a 400 and nothing is written. core_feature switches WooCommerce's own withdrawal feature (409 below ...
- `legal_list_withdrawal_requests` - Withdrawal requests customers submitted through the shop's withdrawal function, newest first

### Media Optimization (23)

Requires [cvrt-media](https://github.com/cvrt-gmbh/cvrt-media) 0.1.0+ (`media_get_recovery` / `media_retry_recovery` need 0.1.1+); separate from the cvrt-mcp-endpoints `mcp_*_media` tools (library management).

File replace is not a tool (it needs an upload; use WP-CLI).

- `media_get_status` - [cvrt] Media status: plugin version, available encoders (WebP/AVIF), entitlement, Elementor Image Optimizer state, and which configured output formats are missing on this server
- `media_get_settings` - Get the [cvrt] Media settings (output format, level, qualities, max dimension, metadata, backup retention, SVG)
- `media_update_settings` - Update [cvrt] Media settings; omitted keys keep their value, and nothing is stored when any value is invalid. github_token is write-only: it is never returned, and a blank value keeps the stored token
- `media_get_stats` - Library statistics: attachments by state, bytes saved, and the backup summary
- `media_list_attachments` - List image attachments, newest first, with their optimization records, optionally filtered by status
- `media_get_attachment` - One attachment: its optimization records, job history and whether a file replace can be undone
- `media_optimize_attachment` - Optimize one attachment now
- `media_restore_attachment` - Restore one attachment's original from its backup, replacing the optimized files
- `media_reoptimize_attachment` - Re-optimize one attachment from its backed-up original with the current settings
- `media_undo_replace` - Undo the last file replace of one attachment (needs edit rights on the attachment)
- `media_get_bulk` - Bulk optimization state: running, paused or idle, with counts of done, pending and failed jobs
- `media_bulk_action` - Control bulk optimization: start (queues every attachment; type and include_restored apply only to start), pause, resume, cancel, or retry (re-queues the failed jobs)
- `media_bulk_step` - Run one bulk batch (up to 20 jobs) now, for sites without a working cron
- `media_bulk_restore` - Restore the originals of EVERY optimized attachment (one restore job each), replacing all optimized files
- `media_get_backups` - Backup summary of originals: count, bytes, oldest backup and whether a backup directory is configured
- `media_cleanup_backups` - Delete backups of originals
- `media_get_recovery` - Unfinished [cvrt] Media records the background runner backs off or skips (needs [cvrt] Media 0.1.1+)
- `media_retry_recovery` - Make unfinished [cvrt] Media records due again (needs [cvrt] Media 0.1.1+): resets the back-off counters only, never touches a file; the runner's next pass works them
- `media_eio_dry_run` - Dry run of the Elementor Image Optimizer migration: what would be adopted, changes nothing
- `media_eio_run` - Import Elementor Image Optimizer's work (no re-encoding): its optimized sizes become [cvrt] Media records, links to its originals are rewritten to the current files, and its originals move into the ...
- `media_eio_cleanup` - Delete Elementor Image Optimizer's leftover metadata and image_optimizer_* options once the migration is complete (the site answers 409 while EIO is active or imports are pending)
- `media_svg_backfill` - Write width and height into SVG attachments that have none, up to limit per call; returns { updated, remaining }
- `media_scan_urls` - Scan content and options for links to old image URLs (e.g. .jpg that became .webp), reading at most limit rows

### Fields (14)

Requires [cvrt-fields](https://github.com/cvrt-gmbh/cvrt-fields) 0.1.2+ (`fields_get_values` / `fields_update_values` need 0.2.1+, `compat_acf_functions` / `shortcode_options_pages` in `fields_update_settings` 0.4.0+).

- `fields_status` - cvrt-fields status: plugin version, definition counts per kind, whether ACF / Elementor / Elementor Pro are active, JSON sync state and JSON read error
- `fields_get_settings` - Get cvrt-fields settings
- `fields_update_settings` - Update cvrt-fields settings. github_token is write-only and stored encrypted; a blank or omitted token keeps the stored one. clear_github_token: true deletes it. compat_acf_functions switches the ...
- `fields_get_values` - Read every field value of one object (post, term, user or options page) that the field groups located on it define: name, key, type, group, the raw stored value and an escaped HTML rendering. 404 for ...
- `fields_update_values` - Write field values of one object by field name, validated by the field types and all-or-nothing: when any value is invalid nothing is saved (400 cvrt_fields_invalid_values with per-field errors)
- `fields_list_types` - List the available field types (text, date_picker, image, relationship, ...) with their settings
- `fields_get_location_values` - Values usable in field-group location rules: post types, page templates, taxonomies, options pages, user forms
- `fields_get_schema` - Editor form schema of one definition kind (fields and their options)
- `fields_list_definitions` - List all definitions of one kind from every source (database, JSON, PHP) with their _source
- `fields_get_definition` - Get one definition by kind and key
- `fields_create_definition` - Create a definition (field group, post type, taxonomy or options page)
- `fields_update_definition` - Replace a definition as a whole: omitted keys fall back to the kind's defaults (it is not a merge, so send the full definition from fields_get_definition with your changes)
- `fields_delete_definition` - Delete a database definition
- `fields_sync_definition` - Copy a JSON-sourced definition into the database

### SEO (35)

Requires [cvrt-seo-manager](https://github.com/cvrt-gmbh/cvrt-seo-manager).

- `seo_status` - Get cvrt-seo-manager status: { version, configured, permalinks, dependencies: { php, wordpress }, features }. features (cvrt-seo-manager 1.15.0+) lists capabilities: migrate_dry_run ...
- `seo_get_settings` - Get cvrt-seo-manager settings grouped by section (titles, robots, social, knowledge_graph, schema, verification, indexnow, search_console, advanced, sitemap, breadcrumbs, images, links, local_seo, ...
- `seo_update_settings` - Update cvrt-seo-manager settings (partial: only the keys you send change)
- `seo_get_post_seo` - Get the SEO meta for a post (every field, null when unset; plus language and translations when Polylang is active)
- `seo_update_post_seo` - Update the SEO meta for a post (partial: only the fields you give change; null deletes a field)
- `seo_delete_post_seo` - Delete (reset) every SEO meta field of a post
- `seo_get_post_analysis` - Run the SEO content analysis for a post: { score, checks }
- `seo_list_posts_seo` - List SEO meta of published posts, newest ID first: [{ id, title, url, seo, language?, translations? }]
- `seo_bulk_update_posts_seo` - Bulk update SEO meta of up to 100 posts
- `seo_get_term_seo` - Get the SEO meta for a taxonomy term: { title, description, robots, og_image, schema } (null when unset)
- `seo_update_term_seo` - Update the SEO meta for a taxonomy term (partial; null deletes a field)
- `seo_delete_term_seo` - Delete (reset) every SEO meta field of a taxonomy term
- `seo_keyword_check` - Check whether a focus keyword is already used by another post (case-insensitive)
- `seo_list_redirects` - List redirects, newest first: { items: [{ id, from_url, to_url, type, is_regex, hits, enabled, created_at, updated_at }], total, pages }
- `seo_create_redirect` - Create a redirect
- `seo_get_redirect` - Get a redirect by id
- `seo_redirects_audit` - Check the stored redirect rules (cvrt-seo-manager 1.15.0+, feature redirect_audit)
- `seo_redirects_known_hosts` - Confirm redirect target hosts as intended (cvrt-seo-manager 1.15.0+, feature redirect_audit): REPLACES the stored list (pass every host to keep; [] clears it), so external_target_host stops flagging ...
- `seo_update_redirect` - Update a redirect (partial: omitted fields keep their stored value)
- `seo_delete_redirect` - Delete a redirect by id
- `seo_list_monitor_log` - List the 404 monitor log: { items: [{ id, url, hits, first_seen, last_seen, ... }], total, pages }
- `seo_clear_monitor_log` - Delete 404 monitor log entries: one entry by id, or every entry last seen within from..to (inclusive dates, either bound optional)
- `seo_create_redirect_from_log` - Create a 301 redirect from a 404 monitor log entry's URL to to_url
- `seo_sitemap_status` - Get sitemap status: { sitemap_url, post_types, taxonomies, total_urls, search_console? }
- `seo_sitemap_health` - Check the sitemap (cvrt-seo-manager 1.15.0+, feature sitemap_health; refused with a clear message on an older plugin): the site fetches every sitemap file and every listed URL on its own host ...
- `seo_sitemap_ping` - Submit the sitemap to Google Search Console (needs the search_console settings) and return the status Search Console reports
- `seo_sitemap_flush` - Flush the XML and HTML sitemap caches of cvrt-seo-manager (POST /sitemap/flush; the next request rebuilds them)
- `seo_indexnow_ping` - Submit URLs to IndexNow (one request per URL)
- `seo_export_settings` - Export every csm_* option as a flat { csm_name: value } map
- `seo_import_settings` - Import settings from a flat { csm_name: value } map (the seo_export_settings shape)
- `seo_export_csv` - Export post SEO meta as a CSV string (post_id, post_title, url, seo_title, seo_description, focus_keywords, seo_score)
- `seo_import_csv` - Import post SEO meta from CSV in the seo_export_csv format (header row, then one row per post with at least 7 columns; export first and edit that)
- `seo_export_redirects` - Export every redirect as a CSV string (source, target, type, is_regex, enabled)
- `seo_import_redirects` - Import redirects from CSV in the seo_export_redirects format (header row source,target,type[,is_regex],enabled; the is_regex column is detected from the header)
- `seo_import_migrate` - Migrate from RankMath or Yoast

### Language (machine translation) (10)

Requires [cvrt-lang](https://github.com/cvrt-gmbh/cvrt-lang) with machine translation (Azure AI Translator); `lang_list_pending` / `lang_submit_translations` / `lang_fail_job` are the external queue for manual or agent use (no recurring job). No tool sets the provider key: use the fort constant or the admin.

- `lang_mt_status` - cvrt-lang machine translation status: provider and readiness, pause state, settings, queue counts, month usage and cap, the last 50 failed jobs with codes, the last worker run (with its `lost` and ...
- `lang_mt_estimate` - Estimate what lang_mt_enqueue would queue for the same arguments: jobs, units and characters
- `lang_mt_enqueue` - Queue bulk machine translation jobs (published default-language originals only; manual translations stay)
- `lang_mt_pause` - Pause machine translation (reason admin): the worker sends nothing until lang_mt_resume
- `lang_mt_resume` - Lift any machine translation pause (admin, cap or auth)
- `lang_list_pending` - External queue, for manual or agent use (no recurring job runs it): claim up to `limit` due jobs (POST /mt/jobs/claim)
- `lang_submit_translations` - External queue, for manual or agent use: submit translations for a claimed job (POST /mt/jobs/{id})
- `lang_fail_job` - External queue, for manual or agent use: report a claimed job as failed (POST /mt/jobs/{id}/fail)
- `lang_get_units` - The side-by-side editor's translation units of a translation post (GET /units/post/{id}): per unit key the source text and hash, the stored translation and its status
- `lang_update_units` - Update a translation post's units (PUT /units/post/{id}). units writes manual translations (key -> text, only keys of the source); approve marks keys reviewed; machine queues those keys for machine ...

### Fort (Bearfort) (5)

Requires `BEARFORT_API_KEY` (Bearfort API, not the site).

- `fort_backup_create` - Start a backup of the site's whole fort (files + database) on Bearfort now, e.g. before risky changes
- `fort_backup_list` - List the fort's backup generations on Bearfort (newest first, as the worker reports them)
- `fort_job_get` - Status of a Bearfort job on this fort (backup, restore, migration, ...). with_log:true adds the job's log text
- `fort_cache_purge` - Purge the fort's nginx page cache (through Bearfort's cache-purge service, the same request WordPress itself makes on content changes), flush the fort's own object-cache keys and reset OPcache. ...
- `fort_logs_read` - Read the fort's server logs: access (nginx), error (nginx), php (PHP errors) or wp-cron (its systemd journal)

### WooCommerce Helper (16)

Requires cvrt-woo-helper.

- `woo_helper_status` - cvrt-woo-helper status: plugin version, WooCommerce and Stripe Gateway active/version, whether the CVRT hub is on, GitHub token { set }
- `woo_helper_get_settings` - cvrt-woo-helper settings (secrets as { set }, never raw)
- `woo_helper_update_settings` - Update cvrt-woo-helper settings. github_token is write-only (blank or omitted keeps the stored one); clear_github_token:true deletes it
- `woo_helper_get_stripe` - The Stripe express-checkout settings cvrt-woo-helper manages: express checkout on/off, button locations per type and what they mean per page, and whether Stripe.js loads only on the checkout ...
- `woo_helper_update_stripe` - Change Stripe express checkout through cvrt-woo-helper
- `woo_helper_stripe_status` - Read-only WooCommerce Stripe Gateway status from cvrt-woo-helper (recursively masked): mode, enabled methods, express checkout and Stripe.js loading per page
- `woo_helper_get_emails` - WooCommerce email look managed by cvrt-woo-helper 0.2.0+: logo (id, url, warning for unsafe formats), logo width, colours, footer text, product images, certificate link once, plus the environment ...
- `woo_helper_update_emails` - Change the WooCommerce email look through cvrt-woo-helper 0.2.0+. Only the keys given change; an invalid value is a 400 naming the field and nothing is written
- `woo_helper_send_test_email` - SENDS A REAL EMAIL: a WooCommerce order-email preview to `to`. settings (same keys as woo_helper_update_emails) are applied to this one email only and NOT saved, to try a look before saving it
- `woo_helper_get_invoices` - Invoice settings of cvrt-woo-helper 0.4.0+ (sevDesk / Lexware Office): settings, API keys per provider as { set, constant } (never the key), the cached provider lists (contact persons, templates, ...
- `woo_helper_put_invoices` - Change cvrt-woo-helper invoice settings; only the keys given change, an invalid value is a 400 and nothing is written. api_keys is WRITE-ONLY (a blank key keeps the stored one) and is never returned; ...
- `woo_helper_invoices_test_connection` - Test the invoice provider connection (read-only GETs: company, tax type, small-business status)
- `woo_helper_invoices_refresh` - Reload the provider's lists (contact persons, templates, letter papers, payment methods, units, print layouts, payment conditions) into the settings cache
- `woo_helper_list_invoice_orders` - Orders by invoice status: done, dry_run, queued, retry or failed
- `woo_helper_get_invoice_order` - Invoice state of one order: status, invoice number, error, attempts, has_pdf, the dry-run request preview, and credit notes
- `woo_helper_create_invoice` - DESTRUCTIVE, IRREVERSIBLE: creates a REAL invoice for this order in the live sevDesk/Lexware ledger

### Stripe and Payments (9)

Requires cvrt-mcp-endpoints 1.17.0+.

- `stripe_get_settings` - WooCommerce Stripe Gateway settings, secrets masked, plus the active mode (live/test)
- `stripe_get_account` - The Stripe account behind the gateway: country, default currency, charges/payouts enabled, details submitted, requirements (currently_due, past_due, disabled_reason)
- `stripe_list_webhooks` - Webhook endpoints of the Stripe account: id, url, status, api_version, number of events; configured:true marks the endpoint that delivers to this site's gateway URL
- `stripe_recreate_webhook` - Recreate this site's Stripe webhook with the gateway's own routine: a new endpoint is created first, then older endpoints for this site's URL are deleted, and the new signing secret is stored on the ...
- `stripe_list_payment_method_configs` - Stripe payment method configurations: per configuration every payment method with available, preference (what was chosen) and value (what is in effect)
- `stripe_set_payment_method` - Turn one payment method of a Stripe payment method configuration on or off (display preference)
- `stripe_list_charges` - Recent Stripe charges: id, amount, currency, status, created, paid/refunded, payment method type, outcome, failure code/message, WooCommerce order_id
- `stripe_list_refunds` - Recent Stripe refunds: id, amount, currency, status, created, charge, reason, WooCommerce order_id
- `woo_gateway_status` - WooCommerce payment gateways for a customer country: id, title, enabled, available (offered at checkout, WooCommerce's own check for an empty cart, so minimum-total gateways show unavailable), plus ...

<!-- tools:end -->

## Architecture

```
src/
  index.ts          # Entry: McpServer + StdioServerTransport
  register.ts       # Registers every section of tool-catalog.ts
  tool-catalog.ts   # One section per tool module; generates the Tools section above
  client.ts         # WordPress REST API client (Basic Auth)
  types.ts          # Shared Zod schemas + jsonResult helper
  slim.ts           # Response slimming transformers
  tools/            # One module per endpoint family (see Tools above)
  drift/            # Endpoint fixtures the drift test checks every tool against
```

## Fort Tools (Bearfort)

For sites hosted on Bearfort, `fort_*` tools reach the worker through the Bearfort API:
backups (`fort_backup_create`, `fort_backup_list`, `fort_job_get`), page-cache purge
(`fort_cache_purge`) and server logs (`fort_logs_read`: access, error, php, wp-cron, with
`lines`, `grep`, `since`). Set `BEARFORT_API_KEY` (admin key) and optionally
`BEARFORT_API_URL`; without the key these tools refuse to run. The fort is resolved from the
site URL. Restore is not exposed.

## Stripe and Payments

`stripe_*` tools (cvrt-mcp-endpoints 1.17.0+) read the Stripe account behind the WooCommerce
Stripe Gateway through the site itself: the key never leaves WordPress and results are
whitelisted. Writes (`stripe_recreate_webhook`, `stripe_set_payment_method`) need
`confirm: true` and are audit-logged on the site. `woo_gateway_status` shows which gateways a
customer from a given country gets. Express checkout and where Stripe.js loads belong to
cvrt-woo-helper (`woo_helper_*`).

## Secret Masking

Every tool result passes through `src/mask.ts` before it reaches the model. Values under
secret-looking keys (`token`, `secret`, `password`, `api_key`, `whsec`, `signing_key`, ...)
and credential-shaped values (`sk_live_`, `whsec_`, GitHub/Slack/AWS tokens, PEM blocks)
become `[masked]`, recursively and inside JSON strings. Flag values (`yes`, `0`, empty)
stay visible so "not set" is still readable. Writing a secret works; it is never read back.
The same rules run server-side in cvrt-mcp-endpoints 1.15.0+.

## Multi-Site Support

One server instance manages all your sites via the `WORDPRESS_SITES` env var (see [Configuration](#configuration)). Call `list_sites` to see configured ids, then pass `site: "<id>"` to any other tool:

```json
{
	"mcpServers": {
		"wordpress": {
			"command": "npx",
			"args": ["@cavort-it-systems/wordpress-mcp"],
			"env": {
				"WORDPRESS_SITES": "[{\"id\":\"site1\",\"url\":\"https://site1.com\",\"username\":\"admin\",\"password\":\"xxxx xxxx xxxx xxxx\"},{\"id\":\"site2\",\"url\":\"https://site2.com\",\"username\":\"admin\",\"password\":\"yyyy yyyy yyyy yyyy\"}]"
			}
		}
	}
}
```

## License

MIT
