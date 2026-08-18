import type { MutationCtx, QueryCtx } from "./_generated/server";

/**
 * `ctx.db.get` that never throws for ids that aren't real document ids.
 *
 * Auth subjects created through `convex run --identity` (and a few legacy
 * seed rows) are stored as plain strings in `userId` / `ownerId` fields.
 * Those strings are not valid Convex doc ids, so a direct `ctx.db.get(id)`
 * throws "Invalid ID length N" and takes the whole query down with it (the
 * restaurant detail page, the owner notification center, …). This helper
 * returns `null` for them so callers fall back to a friendly label.
 */
export async function safeGet<T>(
  ctx: QueryCtx | MutationCtx,
  id: string,
): Promise<T | null> {
  try {
    return (await ctx.db.get(id as never)) as T | null;
  } catch {
    return null;
  }
}
