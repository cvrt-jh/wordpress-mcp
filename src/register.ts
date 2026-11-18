/**
 * Registers every tool on a server. Shared by index.ts and the drift test,
 * so the test sees exactly the tool set the published server exposes.
 *
 * The modules and their order live in tool-catalog.ts, which also generates
 * the README tool lists; add a new tool module there.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SECTIONS } from "./tool-catalog.js";

export function registerAll(server: McpServer): void {
	for (const section of SECTIONS) section.register(server);
}
