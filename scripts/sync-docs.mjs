// Regenerates the README tool lists and every tool count from the registered
// tools (build/tool-catalog.js). Run via `pnpm run sync-docs` (builds first).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BLOCK_END, BLOCK_START, renderTools, totalTools } from "../build/tool-catalog.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const total = totalTools();

const readmePath = join(root, "README.md");
let readme = readFileSync(readmePath, "utf8");
const start = readme.indexOf(BLOCK_START);
const end = readme.indexOf(BLOCK_END);
if (start < 0 || end < 0) throw new Error("README.md has no tools:start / tools:end markers");
readme = readme.slice(0, start) + renderTools() + readme.slice(end + BLOCK_END.length);
readme = readme
	.replace(/\*\*\d+ tools\*\*/, `**${total} tools**`)
	.replace(/^## Tools \(\d+\)$/m, `## Tools (${total})`);
writeFileSync(readmePath, readme);

const serverPath = join(root, "server.json");
const server = readFileSync(serverPath, "utf8").replace(/\d+ tools/, `${total} tools`);
writeFileSync(serverPath, server);

console.log(`synced README.md and server.json to ${total} tools`);
