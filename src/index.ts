#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

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

// Extended MCP Endpoints tools (mcp/v1) - requires mcp-endpoints plugin
import { register as registerMcpPlugins } from "./tools/mcp-plugins.js";
import { register as registerMcpThemes } from "./tools/mcp-themes.js";
import { register as registerMcpCore } from "./tools/mcp-core.js";
import { register as registerMcpDatabase } from "./tools/mcp-database.js";
import { register as registerMcpOptions } from "./tools/mcp-options.js";
import { register as registerMcpMenus } from "./tools/mcp-menus.js";
import { register as registerMcpWidgets } from "./tools/mcp-widgets.js";
import { register as registerMcpHealth } from "./tools/mcp-health.js";

const server = new McpServer({
  name: "wordpress-mcp",
  version: "2.0.0",
});

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

// Extended tools (require mcp-endpoints plugin)
registerMcpPlugins(server);
registerMcpThemes(server);
registerMcpCore(server);
registerMcpDatabase(server);
registerMcpOptions(server);
registerMcpMenus(server);
registerMcpWidgets(server);
registerMcpHealth(server);

const transport = new StdioServerTransport();
await server.connect(transport);

console.error("wordpress-mcp server running on stdio");
