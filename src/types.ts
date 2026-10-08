import { z } from "zod";
import { maskSecrets } from "./mask.js";

// Common schemas
export const IdSchema = z.object({ id: z.number() });
export const SlugSchema = z.object({ slug: z.string() });

// Post status
export const PostStatusSchema = z.enum(["publish", "future", "draft", "pending", "private", "trash"]);

// Helper for JSON results. Every tool result passes here, so secrets are masked here (src/mask.ts).
export function jsonResult(data: unknown): { content: { type: "text"; text: string }[] } {
  return {
    content: [{ type: "text", text: JSON.stringify(maskSecrets(data)) }],
  };
}

/**
 * The given object without its undefined values, so a partial update sends
 * only the fields the caller set (endpoints merge them into the stored data).
 */
export function defined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
