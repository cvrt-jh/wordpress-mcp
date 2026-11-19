/**
 * Files on the operator's machine (where this MCP server runs) for tools that
 * export to or import from a local file. Never a path on the site's server:
 * those tools send the file's content, not its path.
 *
 * Writing: a new file only. The path must be absolute, nothing may exist there
 * (no file, directory or symlink, dangling or not). The text goes to a temp file
 * in the same directory (O_CREAT | O_EXCL, mode 0600), which is then hard-linked
 * to the target: link() never replaces a file that appeared in between and never
 * follows a symlink there, and a failed write leaves no partial file at the
 * target. The temp file is always removed.
 * Reading: an absolute path to a regular file, size checked before it is read.
 * Errors never quote file content (a JSON parse error would show its start).
 */
import { randomBytes } from "node:crypto";
import { link, lstat, open, readFile, stat, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";

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

/** Writes `text` to the new file `path` (mode 0600) through a temp file and link(). Returns the bytes written. */
export async function writeNewFile(path: string, text: string, arg: string): Promise<number> {
	absolute(path, arg);
	const temp = join(dirname(path), `.${basename(path)}.${randomBytes(6).toString("hex")}.tmp`);
	const bytes = Buffer.from(text, "utf8");
	const handle = await open(temp, "wx", 0o600);
	try {
		try {
			await handle.writeFile(bytes);
		} finally {
			await handle.close();
		}
		await link(temp, path).catch((e: unknown) => {
			if (code(e) === "EEXIST")
				throw new Error(`${arg} already exists (file, directory or symlink); give a new file: ${path}`);
			throw e;
		});
		return bytes.length;
	} finally {
		await unlink(temp);
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
	} catch {
		// The parser's message quotes the start of the input: never shown (it may be a secret).
		throw new Error(`${arg} is not valid JSON: ${path}`);
	}
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error(`${arg} must hold a JSON object`);
	}
	return parsed as Record<string, unknown>;
}
