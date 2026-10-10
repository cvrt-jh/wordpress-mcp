#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerAll } from "./register.js";

const server = new McpServer({
  name: "wordpress-mcp",
  version: "3.12.0",
});

registerAll(server);

const transport = new StdioServerTransport();
await server.connect(transport);

console.error("wordpress-mcp server running on stdio");
