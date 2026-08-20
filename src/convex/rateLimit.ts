import { MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Database-backed per-user rate limiter for Convex mutations.
 *
 * Usage:
 *   await checkRateLimit(ctx, { key: "sendGift", userId, limit: 20, windowMs: 60_000 });
 *
 * Uses an atomic insert-or-increment pattern inside the calling mutation's
 * transaction, so concurrent requests from the same user are correctly
 * serialized and counted.
 *
 * key     — a namespace string (e.g. the function name)
 * userId  — the caller's user id (or any stable identifier)
 * limit   — max calls per window
 * windowMs — window duration in milliseconds (e.g. 60_000 = 1 minute)
 */
export async function checkRateLimit(
  ctx: MutationCtx,
  {
    key,
    userId,
    limit,
    windowMs,
  }: {
    key: string;
    userId: string;
    limit: number;
    windowMs: number;
  },
): Promise<void> {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const rateKey = `${key}:${userId}`;

  const existing = await ctx.db
    .query("rateLimits")
    .withIndex("by_key_window", (q) =>
      q.eq("key", rateKey).eq("windowStart", windowStart),
    )
    .unique();

  if (existing) {
    if (existing.count >= limit) {
      throw new Error("You're doing that too often. Please try again later.");
    }
    await ctx.db.patch(existing._id, { count: existing.count + 1 });
  } else {
    await ctx.db.insert("rateLimits", {
      key: rateKey,
      windowStart,
      count: 1,
    });
  }
}
