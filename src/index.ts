#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Multi-site: list_sites has no `site` param; every other tool requires one.
import { register as registerSites } from "./tools/sites.js";

// Standard WordPress REST API tools (wp/v2)
import { register as registerSite } from "./tools/site.js";
import { register as registerPosts } from "./tools/posts.js";
import { register as registerPages } from "./tools/pages.js";
import { register as registerUsers } from "./tools/users.js";
import { register as registerPlugins } from "./tools/plugins.js";
import { register as registerThemes } from "./tools/themes.js";
import { register as registerMedia } from "./tools/media.js";
import { register as registerTaxonomies } from "./tools/taxonomies.js";
import { register as registerComments } from "./tools/comments.js";

// Extended MCP Endpoints tools (mcp/v1) — requires cvrt-mcp-endpoints plugin
import { register as registerMcpPlugins } from "./tools/mcp-plugins.js";
import { register as registerMcpThemes } from "./tools/mcp-themes.js";
import { register as registerMcpCore } from "./tools/mcp-core.js";
import { register as registerMcpDatabase } from "./tools/mcp-database.js";
import { register as registerMcpOptions } from "./tools/mcp-options.js";
import { register as registerMcpMenus } from "./tools/mcp-menus.js";
import { register as registerMcpWidgets } from "./tools/mcp-widgets.js";
import { register as registerMcpHealth } from "./tools/mcp-health.js";
import { register as registerMcpCpt } from "./tools/mcp-cpt.js";
import { register as registerMcpTaxonomies } from "./tools/mcp-taxonomies.js";
import { register as registerMcpUsers } from "./tools/mcp-users.js";
import { register as registerMcpMedia } from "./tools/mcp-media.js";

// Elementor tools (mcp/v1/elementor) — requires cvrt-mcp-endpoints plugin + Elementor active
import { register as registerMcpElementor } from "./tools/mcp-elementor.js";

// ACF tools (mcp/v1/acf) — requires cvrt-mcp-endpoints plugin + ACF Pro active
import { register as registerAcf } from "./tools/mcp-acf.js";

// WooCommerce tools — requires future cvrt-woo-endpoints plugin (mcp/v1/woo)
import { register as registerWoo } from "./tools/mcp-woo.js";
import { register as registerFulfillment } from "./tools/fulfillment.js";
import { register as registerLegal } from "./tools/legal.js";
import { register as registerSeo } from "./tools/seo.js";

const server = new McpServer({
  name: "wordpress-mcp",
  version: "3.0.0",
});

// Multi-site: list_sites has no `site` param; every other tool requires one.
registerSites(server);

// Standard WordPress REST API tools
registerSite(server);
registerPosts(server);
registerPages(server);
registerUsers(server);
registerPlugins(server);
registerThemes(server);
registerMedia(server);
registerTaxonomies(server);
registerComments(server);

// Extended tools (require cvrt-mcp-endpoints plugin)
registerMcpPlugins(server);
registerMcpThemes(server);
registerMcpCore(server);
registerMcpDatabase(server);
registerMcpOptions(server);
registerMcpMenus(server);
registerMcpWidgets(server);
registerMcpHealth(server);
registerMcpCpt(server);
registerMcpTaxonomies(server);
registerMcpUsers(server);
registerMcpMedia(server);

// Elementor tools (require cvrt-mcp-endpoints plugin + Elementor)
registerMcpElementor(server);

// ACF tools (require cvrt-mcp-endpoints plugin + ACF Pro)
registerAcf(server);

// WooCommerce tools (require future cvrt-woo-endpoints plugin)
registerWoo(server);
registerFulfillment(server);
registerLegal(server);
registerSeo(server);

const transport = new StdioServerTransport();
await server.connect(transport);

console.error("wordpress-mcp server running on stdio");
