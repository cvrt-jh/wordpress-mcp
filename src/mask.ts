/**
 * Secret masking for everything a tool returns to the model.
 *
 * Mirrors Cvrt_MCPE_Secrets in cvrt-mcp-endpoints (1.15.0): a value is masked
 * when the key it sits under looks like a secret name, or when the value looks
 * like a credential whatever it is called. JSON object/array strings are decoded
 * and masked inside. This is the second line of defence: a fort on an older
 * mu-plugin, or any other plugin's endpoint, must not leak through a tool result.
 * Applied at the output (jsonResult, error messages), never to data a tool
 * writes back, so a read-modify-write never stores the mask.
 */

export const MASK = "[masked]";

const NAME =
  /(?:^|[_-])(?:token|secret|password|passwd|passphrase|api[_-]?key|private[_-]?key|licen[cs]e[_-]?key|client[_-]?secret|app[_-]?password|auth[_-]?key|nonce[_-]?key|logged[_-]in[_-]key|salt|credentials?|whsec|signing[_-]?key)s?(?:$|[_-])/i;

const SHAPES = [
  /github_pat_[A-Za-z0-9_]{20,}/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  /\bglpat-[A-Za-z0-9_-]{20,}/,
  /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}/,
  /\bwhsec_[A-Za-z0-9]{16,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/,
  /-----BEGIN [A-Z0-9 ]+-----/,
];

/** Flag-like values that stay visible under a secret-looking name. */
const HARMLESS = new Set(["", "yes", "no", "0", "1", "true", "false", "on", "off"]);

export function isSecretName(name: string): boolean {
  return NAME.test(name);
}

export function looksSecret(value: string): boolean {
  return SHAPES.some((shape) => shape.test(value));
}

function jsonContainer(value: string): unknown[] | Record<string, unknown> | null {
  const trimmed = value.trimStart();
  if (trimmed[0] !== "{" && trimmed[0] !== "[") return null;
  try {
    const decoded: unknown = JSON.parse(value);
    return decoded !== null && typeof decoded === "object" ? (decoded as Record<string, unknown>) : null;
  } catch {
    return null; // Not JSON after all: an ordinary string, checked as one below.
  }
}

function mask(value: unknown, name: string, hit: { masked: boolean }): unknown {
  if (Array.isArray(value)) return value.map((item) => mask(item, name, hit));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mask(v, k, hit)]));
  }
  if (typeof value !== "string") return value;
  const decoded = jsonContainer(value);
  if (decoded !== null) {
    const inner = { masked: false };
    const result = mask(decoded, name, inner);
    if (!inner.masked) return value;
    hit.masked = true;
    return JSON.stringify(result);
  }
  if (looksSecret(value) || (isSecretName(name) && !HARMLESS.has(value.trim().toLowerCase()))) {
    hit.masked = true;
    return MASK;
  }
  return value;
}

/** A copy of `value` with every secret replaced by MASK. */
export function maskSecrets(value: unknown): unknown {
  return mask(value, "", { masked: false });
}

/** A text (e.g. an error body) with secrets masked: JSON is masked structurally, anything else by shape. */
export function maskText(text: string): string {
  const decoded = jsonContainer(text);
  if (decoded !== null) return JSON.stringify(maskSecrets(decoded));
  return SHAPES.reduce((t, shape) => t.replace(new RegExp(shape.source, "g"), MASK), text);
}
