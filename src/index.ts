#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { register as registerSite } from "./tools/site.js";
import { register as registerPosts } from "./tools/posts.js";
import { register as registerPages } from "./tools/pages.js";
import { register as registerUsers } from "./tools/users.js";
import { register as registerPlugins } from "./tools/plugins.js";
import { register as registerThemes } from "./tools/themes.js";
import { register as registerMedia } from "./tools/media.js";
import { register as registerTaxonomies } from "./tools/taxonomies.js";
import { register as registerComments } from "./tools/comments.js";

const server = new McpServer({
  name: "wordpress-mcp",
  version: "1.0.0",
});

registerSite(server);
registerPosts(server);
registerPages(server);
registerUsers(server);
registerPlugins(server);
registerThemes(server);
registerMedia(server);
registerTaxonomies(server);
registerComments(server);

const transport = new StdioServerTransport();
await server.connect(transport);

console.error("wordpress-mcp server running on stdio");
