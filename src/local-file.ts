/**
 * Files on the operator's machine (where this MCP server runs) for tools that
 * export to or import from a local file. Never a path on the site's server:
 * those tools send the file's content, not its path.
 *
 * Writing: a new file only. The path must be absolute, nothing may exist there
 * (no file, directory or symlink, dangling or not), and the file is created
 * exclusively (O_CREAT | O_EXCL: never follows a symlink, never replaces a file
 * that appeared in between) with mode 0600.
 * Reading: an absolute path to a regular file, size checked before it is read.
 */
import { lstat, open, readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";

function absolute(path: string, arg: string): void {
	if (!isAbsolute(path)) throw new Error(`${arg} must be an absolute path on this machine: ${path}`);
}

function code(e: unknown): string | undefined {
	return (e as NodeJS.ErrnoException).code;
}

/** Refuses unless `path` is absolute, nothing exists there and its directory does. Writes nothing. */
export async function assertNewFile(path: string, arg: string): Promise<void> {
	absolute(path, arg);
	const exists = await lstat(path).then(
		() => true,
		(e: unknown) => {
			if (code(e) === "ENOENT") return false;
			throw e;
		},
	);
	if (exists) throw new Error(`${arg} already exists (file, directory or symlink); give a new file: ${path}`);
	const parent = await stat(dirname(path)).catch(() => null);
	if (!parent?.isDirectory()) throw new Error(`${arg}: the directory does not exist: ${dirname(path)}`);
}

/** Creates `path` exclusively (mode 0600) and writes `text`. Returns the bytes written. */
export async function writeNewFile(path: string, text: string, arg: string): Promise<number> {
	absolute(path, arg);
	const handle = await open(path, "wx", 0o600).catch((e: unknown) => {
		if (code(e) === "EEXIST")
			throw new Error(`${arg} already exists (file, directory or symlink); give a new file: ${path}`);
		throw e;
	});
	try {
		const bytes = Buffer.from(text, "utf8");
		await handle.writeFile(bytes);
		return bytes.length;
	} finally {
		await handle.close();
	}
}

/** The JSON object in `path`: absolute, a regular file of at most `maxBytes` (checked before reading). */
export async function readJsonObject(path: string, maxBytes: number, arg: string): Promise<Record<string, unknown>> {
	absolute(path, arg);
	const info = await stat(path).catch(() => null);
	if (!info?.isFile()) throw new Error(`${arg} is not a readable file: ${path}`);
	if (info.size > maxBytes) {
		throw new Error(`${arg} is ${info.size} bytes, over the ${maxBytes / 1024 / 1024} MB limit: ${path}`);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(await readFile(path, "utf8"));
	} catch (e) {
		throw new Error(`${arg} is not valid JSON: ${(e as Error).message}`);
	}
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error(`${arg} must hold a JSON object`);
	}
	return parsed as Record<string, unknown>;
}
