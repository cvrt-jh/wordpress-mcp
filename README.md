# wordpress-mcp

[![npm version](https://img.shields.io/npm/v/@cavort-it-systems/wordpress-mcp.svg)](https://www.npmjs.com/package/@cavort-it-systems/wordpress-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP SDK](https://img.shields.io/badge/MCP%20SDK-1.12.1-blue.svg)](https://modelcontextprotocol.io)

Lightweight WordPress MCP server for site management. **85 tools** with **token-optimized responses** — REST API responses automatically slimmed from kilobytes to essentials.

**v2.0**: Now includes extended tools for the [mcp-endpoints](https://github.com/cvrt-gmbh/mcp-endpoints) plugin — install plugins/themes from WordPress.org, database management, full widget/menu control, and more.

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

### Claude Code CLI

```bash
claude mcp add wordpress \
  -e WORDPRESS_SITE_URL=https://example.com \
  -e WORDPRESS_USERNAME=admin \
  -e WORDPRESS_PASSWORD="xxxx xxxx xxxx xxxx" \
  -- npx @cavort-it-systems/wordpress-mcp
```

### Claude Desktop / Manual

Add to your MCP config (`~/.claude.json` or Claude Desktop settings):

```json
{
  "mcpServers": {
    "wordpress": {
      "command": "npx",
      "args": ["@cavort-it-systems/wordpress-mcp"],
      "env": {
        "WORDPRESS_SITE_URL": "https://example.com",
        "WORDPRESS_USERNAME": "admin",
        "WORDPRESS_PASSWORD": "xxxx xxxx xxxx xxxx"
      }
    }
  }
}
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

**`wp_get_post`** — from ~5KB to ~200 bytes:
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

## Tools (85)

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
- `wp_activate_plugin` - Activate plugin
- `wp_deactivate_plugin` - Deactivate plugin
- `wp_delete_plugin` - Delete plugin

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

### Extended Tools (43 tools) — Requires mcp-endpoints plugin

These require the [mcp-endpoints](https://github.com/cvrt-gmbh/mcp-endpoints) WordPress plugin to be installed and activated.

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
    # Extended (mcp/v1) - requires mcp-endpoints plugin
    mcp-plugins.ts  # 4 tools - install from WordPress.org
    mcp-themes.ts   # 5 tools - install from WordPress.org
    mcp-core.ts     # 6 tools - updates, cache flush
    mcp-database.ts # 5 tools - search-replace, optimize
    mcp-options.ts  # 5 tools - full options CRUD
    mcp-menus.ts    # 8 tools - navigation menus
    mcp-widgets.ts  # 8 tools - sidebar widgets
    mcp-health.ts   # 6 tools - diagnostics, cron
```

## Multi-Site Support

For managing multiple WordPress sites, run separate MCP instances:

```json
{
  "mcpServers": {
    "wordpress-site1": {
      "command": "npx",
      "args": ["@cavort-it-systems/wordpress-mcp"],
      "env": {
        "WORDPRESS_SITE_URL": "https://site1.com",
        "WORDPRESS_USERNAME": "admin",
        "WORDPRESS_PASSWORD": "xxxx xxxx xxxx xxxx"
      }
    },
    "wordpress-site2": {
      "command": "npx",
      "args": ["@cavort-it-systems/wordpress-mcp"],
      "env": {
        "WORDPRESS_SITE_URL": "https://site2.com",
        "WORDPRESS_USERNAME": "admin",
        "WORDPRESS_PASSWORD": "yyyy yyyy yyyy yyyy"
      }
    }
  }
}
```

## License

MIT
