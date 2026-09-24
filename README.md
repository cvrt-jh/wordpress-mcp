# wordpress-mcp

[![npm version](https://img.shields.io/npm/v/@cavort-it-systems/wordpress-mcp.svg)](https://www.npmjs.com/package/@cavort-it-systems/wordpress-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP SDK](https://img.shields.io/badge/MCP%20SDK-1.12.1-blue.svg)](https://modelcontextprotocol.io)

Lightweight WordPress MCP server for site management. **246 tools** with **token-optimized responses** - REST API responses automatically slimmed from kilobytes to essentials.

**v3.1**: Tools for our own plugins - `seo_*` (31) for [cvrt-seo-manager](https://github.com/cvrt-gmbh/cvrt-seo-manager), `legal_*` (15) for [cvrt-legal](https://github.com/cvrt-gmbh/cvrt-legal) incl. `legal_link_page` (cvrt-legal 0.4.2+), and `fulfillment_*` (8) for cvrt-order-fulfillment.

**v3.0 (BREAKING)**: Multi-site - one server instance manages any number of sites via a single `WORDPRESS_SITES` env var. Every tool now requires a `site` argument; use the new `list_sites` tool to discover configured ids. The old single-site env vars are removed. `wp_activate_plugin` / `wp_deactivate_plugin` / `wp_delete_plugin` now use `cvrt-mcp-endpoints` `mcp/v1` routes and take the plugin file path (e.g. `akismet/akismet.php`) instead of a slug.

**v2.1**: Now includes Pro modules for ACF and WooCommerce via [wp-pilot-pro](https://github.com/cvrt-gmbh/wp-pilot-pro).

**v2.0**: Extended tools for the [cvrt-mcp-endpoints](https://github.com/cvrt-gmbh/cvrt-mcp-endpoints) plugin - install plugins/themes from WordPress.org, database management, full widget/menu control, and more.

## Why This Server?

WordPress REST API returns extremely verbose JSON (~5-10KB per post). This server strips it down:

| Response | Before | After | Reduction |
|----------|--------|-------|-----------|
| `wp_list_posts` (10 posts) | ~50KB | ~2KB | **96%** |
| `wp_get_post` | ~5KB | ~200 bytes | **96%** |
| `wp_list_plugins` | ~15KB | ~800 bytes | **95%** |

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
npm install && npm run build
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

| Field | Where | Why |
|-------|-------|-----|
| `guid`, `_links` | everywhere | Internal WordPress data |
| `content.rendered` | lists | Only included when explicitly requested |
| `meta`, `class_list` | posts/pages | Theme/plugin metadata |
| `ping_status`, `comment_status` | posts | Rarely needed |
| `template`, `format`, `sticky` | posts | Theme-specific |
| HTML tags | excerpts | Clean text output |
| Pretty-print JSON | all | Compact single-line output |

## Tools (246)

Every tool below requires a `site` argument (the id from your `WORDPRESS_SITES` config), except `list_sites` itself.

### Sites (1)
- `list_sites` - List configured site ids and URLs (no `site` argument; passwords never returned)

### Standard WordPress REST API (42 tools)

These work with any WordPress site:

### Site (4)
- `wp_site_info` - Get site name, description, URL
- `wp_get_settings` - Get site settings
- `wp_update_settings` - Update site settings
- `wp_get_namespaces` - List REST API namespaces

### Posts (6)
- `wp_list_posts` - List posts with filters
- `wp_get_post` - Get single post
- `wp_create_post` - Create post
- `wp_update_post` - Update post
- `wp_delete_post` - Delete post
- `wp_search_posts` - Search posts

### Pages (5)
- `wp_list_pages` - List pages
- `wp_get_page` - Get single page
- `wp_create_page` - Create page
- `wp_update_page` - Update page
- `wp_delete_page` - Delete page

### Users (6)
- `wp_list_users` - List users
- `wp_me` - Get current user
- `wp_get_user` - Get user by ID
- `wp_create_user` - Create user
- `wp_update_user` - Update user
- `wp_delete_user` - Delete user

### Plugins (5)
- `wp_list_plugins` - List plugins
- `wp_get_plugin` - Get plugin details
- `wp_activate_plugin` - Activate plugin (mcp/v1; `plugin` is the file path, e.g. `akismet/akismet.php`)
- `wp_deactivate_plugin` - Deactivate plugin (mcp/v1; `plugin` is the file path)
- `wp_delete_plugin` - Delete plugin (mcp/v1; `plugin` is the file path)

### Themes (4)
- `wp_list_themes` - List themes
- `wp_get_active_theme` - Get active theme
- `wp_get_theme` - Get theme details
- `wp_activate_theme` - Switch themes

### Media (4)
- `wp_list_media` - List media library
- `wp_get_media` - Get media item
- `wp_update_media` - Update media metadata
- `wp_delete_media` - Delete media

### Categories & Tags (8)
- `wp_list_categories` - List categories
- `wp_create_category` - Create category
- `wp_update_category` - Update category
- `wp_delete_category` - Delete category
- `wp_list_tags` - List tags
- `wp_create_tag` - Create tag
- `wp_update_tag` - Update tag
- `wp_delete_tag` - Delete tag

### Comments (6)
- `wp_list_comments` - List comments
- `wp_get_comment` - Get comment
- `wp_create_comment` - Create comment
- `wp_update_comment` - Update/moderate comment
- `wp_delete_comment` - Delete comment
- `wp_moderate_comments` - Batch moderate

---

### Extended Tools (43 tools) - Requires cvrt-mcp-endpoints plugin

These require the [cvrt-mcp-endpoints](https://github.com/cvrt-gmbh/cvrt-mcp-endpoints) WordPress plugin to be installed and activated.

### Plugin Management (4)
- `mcp_search_plugins` - Search WordPress.org plugins
- `mcp_install_plugin` - Install plugin from WordPress.org
- `mcp_update_plugin` - Update single plugin
- `mcp_update_all_plugins` - Update all plugins

### Theme Management (5)
- `mcp_search_themes` - Search WordPress.org themes
- `mcp_install_theme` - Install theme from WordPress.org
- `mcp_update_theme` - Update single theme
- `mcp_update_all_themes` - Update all themes
- `mcp_delete_theme` - Delete inactive theme

### Core Management (6)
- `mcp_get_version` - Get WordPress version info
- `mcp_get_system_info` - Get comprehensive system info
- `mcp_check_updates` - Check for all updates
- `mcp_update_core` - Update WordPress core
- `mcp_flush_rewrite` - Flush rewrite rules
- `mcp_flush_cache` - Clear all caches

### Database Management (5)
- `mcp_get_tables` - List tables with sizes
- `mcp_search_replace` - Search/replace in database
- `mcp_optimize_tables` - Optimize all tables
- `mcp_clean_revisions` - Delete old revisions
- `mcp_clean_comments` - Delete spam/trash comments

### Options Management (5)
- `mcp_list_options` - List options with prefix filter
- `mcp_get_option` - Get single option
- `mcp_set_option` - Create/update option
- `mcp_delete_option` - Delete option
- `mcp_bulk_get_options` - Get multiple options

### Menu Management (8)
- `mcp_list_menus` - List navigation menus
- `mcp_get_menu_locations` - Get theme locations
- `mcp_get_menu` - Get menu with items
- `mcp_create_menu` - Create menu
- `mcp_delete_menu` - Delete menu
- `mcp_add_menu_item` - Add menu item
- `mcp_delete_menu_item` - Delete menu item
- `mcp_assign_menu_location` - Assign menu to location

### Widget Management (8)
- `mcp_list_sidebars` - List all sidebars
- `mcp_get_sidebar_widgets` - Get sidebar widgets
- `mcp_list_widget_types` - List widget types
- `mcp_get_widget` - Get widget details
- `mcp_add_widget` - Add widget to sidebar
- `mcp_update_widget` - Update widget settings
- `mcp_delete_widget` - Remove widget
- `mcp_move_widget` - Move widget to sidebar

### Health & Diagnostics (6)
- `mcp_get_health` - Site health score
- `mcp_get_debug_info` - Debug information
- `mcp_get_php_info` - PHP configuration
- `mcp_get_plugins_health` - Plugin health/updates
- `mcp_get_cron_status` - Cron jobs status
- `mcp_run_cron` - Run cron hook manually

---

### ACF Module (31 tools) - Requires wp-pilot-pro + ACF

Requires [wp-pilot-pro](https://github.com/cvrt-gmbh/wp-pilot-pro) and Advanced Custom Fields.

### Field Groups (4)
- `acf_list_field_groups` - List all field groups
- `acf_get_field_group` - Get field group with schema
- `acf_export_field_groups` - Export as JSON
- `acf_import_field_groups` - Import from JSON

### Post Fields (4)
- `acf_get_post_fields` - Get all fields for post
- `acf_update_post_fields` - Update multiple fields
- `acf_get_post_field` - Get single field value
- `acf_update_post_field` - Update single field

### Term & User Fields (4)
- `acf_get_term_fields` - Get term ACF fields
- `acf_update_term_fields` - Update term fields
- `acf_get_user_fields` - Get user ACF fields
- `acf_update_user_fields` - Update user fields

### Options Pages (3)
- `acf_list_options_pages` - List options pages
- `acf_get_options_fields` - Get options page fields
- `acf_update_options_fields` - Update options fields

### Repeater Fields (5)
- `acf_get_repeater` - Get repeater rows
- `acf_add_repeater_row` - Add row
- `acf_update_repeater_row` - Update row
- `acf_delete_repeater_row` - Delete row
- `acf_reorder_repeater` - Reorder rows

### Flexible Content (5)
- `acf_get_flexible` - Get layouts
- `acf_add_flexible_layout` - Add layout
- `acf_update_flexible_layout` - Update layout
- `acf_delete_flexible_layout` - Delete layout
- `acf_reorder_flexible` - Reorder layouts

### Relationship Fields (4)
- `acf_get_relationship` - Get related posts
- `acf_set_relationship` - Set related posts
- `acf_add_to_relationship` - Add posts
- `acf_remove_from_relationship` - Remove posts

### Utility (2)
- `acf_get_clone_references` - Get clone field refs
- `acf_get_field_object` - Get field schema

---

### WooCommerce Module (42 tools) - Requires wp-pilot-pro + WooCommerce

Requires [wp-pilot-pro](https://github.com/cvrt-gmbh/wp-pilot-pro) and WooCommerce.

### Products (5)
- `woo_list_products` - List products with filters
- `woo_get_product` - Get product details
- `woo_create_product` - Create product
- `woo_update_product` - Update product
- `woo_delete_product` - Delete product

### Variations (4)
- `woo_list_variations` - List product variations
- `woo_create_variation` - Create variation
- `woo_update_variation` - Update variation
- `woo_delete_variation` - Delete variation

### Attributes (4)
- `woo_list_attributes` - List attributes
- `woo_list_attribute_terms` - List attribute terms
- `woo_create_attribute` - Create attribute
- `woo_create_attribute_term` - Create term

### Categories & Tags (5)
- `woo_list_categories` - List product categories
- `woo_create_category` - Create category
- `woo_update_category` - Update category
- `woo_delete_category` - Delete category
- `woo_list_tags` - List product tags

### Orders (5)
- `woo_list_orders` - List orders
- `woo_get_order` - Get order details
- `woo_update_order_status` - Update status
- `woo_add_order_note` - Add note
- `woo_get_order_notes` - Get notes

### Customers (5)
- `woo_list_customers` - List customers
- `woo_get_customer` - Get customer
- `woo_create_customer` - Create customer
- `woo_update_customer` - Update customer
- `woo_get_customer_orders` - Get order history

### Coupons (5)
- `woo_list_coupons` - List coupons
- `woo_get_coupon` - Get coupon
- `woo_create_coupon` - Create coupon
- `woo_update_coupon` - Update coupon
- `woo_delete_coupon` - Delete coupon

### Reports (3)
- `woo_sales_report` - Sales report
- `woo_top_sellers` - Top selling products
- `woo_stock_report` - Stock status report

### Product Meta & Inventory (3)
- `woo_get_product_meta` - Get product meta
- `woo_update_product_meta` - Update product meta
- `woo_bulk_update_stock` - Bulk stock update

### SEO Module (31 tools) - Requires [cvrt-seo-manager](https://github.com/cvrt-gmbh/cvrt-seo-manager)

- `seo_status` - Get cvrt-seo-manager status (version, configured, dependencies)
- `seo_get_settings` - Get cvrt-seo-manager settings
- `seo_update_settings` - Update cvrt-seo-manager settings
- `seo_get_post_seo` - Get the SEO meta for a post
- `seo_update_post_seo` - Update the SEO meta for a post
- `seo_delete_post_seo` - Delete (reset) the SEO meta for a post
- `seo_get_post_analysis` - Get the SEO analysis (score, issues) for a post
- `seo_list_posts_seo` - List SEO meta across posts
- `seo_bulk_update_posts_seo` - Bulk update SEO meta across multiple posts
- `seo_get_term_seo` - Get the SEO meta for a taxonomy term
- `seo_update_term_seo` - Update the SEO meta for a taxonomy term
- `seo_delete_term_seo` - Delete (reset) the SEO meta for a taxonomy term
- `seo_keyword_check` - Run the keyword analysis check
- `seo_list_redirects` - List all redirects
- `seo_create_redirect` - Create a redirect
- `seo_get_redirect` - Get a redirect by id
- `seo_update_redirect` - Update a redirect by id
- `seo_delete_redirect` - Delete a redirect by id
- `seo_list_monitor_log` - List the 404/redirect monitor log entries
- `seo_clear_monitor_log` - Clear the 404/redirect monitor log
- `seo_create_redirect_from_log` - Create a redirect directly from a monitor log entry
- `seo_sitemap_status` - Get sitemap status
- `seo_sitemap_ping` - Ping search engines with the sitemap
- `seo_indexnow_ping` - Submit URLs to IndexNow
- `seo_export_settings` - Export cvrt-seo-manager settings
- `seo_import_settings` - Import cvrt-seo-manager settings
- `seo_export_csv` - Export post SEO meta as CSV
- `seo_import_csv` - Import post SEO meta from CSV
- `seo_export_redirects` - Export redirects
- `seo_import_redirects` - Import redirects
- `seo_import_migrate` - Run a migration import (e.g

### Legal Module (15 tools) - Requires [cvrt-legal](https://github.com/cvrt-gmbh/cvrt-legal) (`legal_get_page` / `legal_link_page` need 0.4.2+)

- `legal_status` - Legal document status for a site: which documents are required, filled and published, plus a single compliant flag
- `legal_list_documents` - List all legal document types with their required/filled state and linked page
- `legal_get_document` - Get one legal document including its ordered sections
- `legal_put_document` - Replace a legal document
- `legal_render_document` - Render a document to normalized HTML without saving
- `legal_get_page` - Get which page a legal document is linked to: linked, page_id, the page's post status, and ok (linked AND published)
- `legal_link_page` - Link a legal document to its WordPress page (post type page only; posts and products are refused)
- `legal_add_section` - Append a section to a legal document
- `legal_update_section` - Update a section
- `legal_delete_section` - Delete a section from a legal document
- `legal_get_consent` - Get the cookie consent banner configuration
- `legal_put_consent` - Configure the consent banner and every tracking credential the site uses
- `legal_get_theme` - Get the banner theme: preset name, CSS custom property overrides and the rendered CSS
- `legal_put_theme` - Set the banner theme preset and/or individual CSS custom properties
- `legal_get_settings` - Get cvrt-legal settings

### Order Fulfillment Module (8 tools) - Requires cvrt-order-fulfillment 0.2.0+

- `fulfillment_get_settings` - Get the cvrt-order-fulfillment plugin settings
- `fulfillment_update_settings` - Update cvrt-order-fulfillment settings
- `fulfillment_status` - Pipeline health: which credentials are set, ClickUp list/assignee, when the print agent last polled, and print-queue counts
- `fulfillment_queue` - Print-queue state: status counts (pending/printing/printed/failed) and the recent jobs with their errors
- `fulfillment_reprint_job` - Reset a print job to pending so the agent prints it again
- `fulfillment_fulfill_order` - Manually (force) run fulfillment for an order: renders the packing slip, creates the ClickUp task, notifies Slack
- `fulfillment_update_check` - Force an immediate plugin-update check (bypassing PUC's throttle) and report whether a newer version is available
- `fulfillment_update_apply` - Install a pending cvrt-order-fulfillment update via WordPress's own upgrader (same code path as the wp-admin one-click update)

## Architecture

```
src/
  index.ts          # Entry: McpServer + StdioServerTransport
  client.ts         # WordPress REST API client (Basic Auth)
  types.ts          # Shared Zod schemas + jsonResult helper
  slim.ts           # Response slimming transformers
  tools/
    # Standard WP REST API (wp/v2)
    site.ts         # 4 tools
    posts.ts        # 6 tools
    pages.ts        # 5 tools
    users.ts        # 6 tools
    plugins.ts      # 5 tools
    themes.ts       # 4 tools
    media.ts        # 4 tools
    taxonomies.ts   # 8 tools (categories + tags)
    comments.ts     # 6 tools
    # Extended (mcp/v1) - requires cvrt-mcp-endpoints plugin
    mcp-plugins.ts  # 4 tools - install from WordPress.org
    mcp-themes.ts   # 5 tools - install from WordPress.org
    mcp-core.ts     # 6 tools - updates, cache flush
    mcp-database.ts # 5 tools - search-replace, optimize
    mcp-options.ts  # 5 tools - full options CRUD
    mcp-menus.ts    # 8 tools - navigation menus
    mcp-widgets.ts  # 8 tools - sidebar widgets
    mcp-health.ts   # 6 tools - diagnostics, cron
    # Pro modules (mcp/v1) - requires wp-pilot-pro
    mcp-acf.ts      # 31 tools - ACF integration
    mcp-woo.ts      # 42 tools - WooCommerce
```

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
