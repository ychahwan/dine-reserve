import { internalMutation, MutationCtx } from "./_generated/server";
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

  // KB-07: `.first()` (not `.unique()`) — two concurrent first-hits for the
  // same (key, window) can both insert before either sees the other, and a
  // later `.unique()` would then throw and turn the limiter into a hard
  // error for that user. `.first()` is order-agnostic and the count logic
  // below stays correct: worst case a concurrent pair increments two rows,
  // which only ever over-counts toward the limit (fail-safe), never under.
  const existing = await ctx.db
    .query("rateLimits")
    .withIndex("by_key_window", (q) =>
      q.eq("key", rateKey).eq("windowStart", windowStart),
    )
    .first();

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

/**
 * Garbage-collect stale rate-limit rows (N-7 / P-6). Every window older than
 * `maxAgeMs` is dead weight — the limiter only ever queries the current
 * window, so old rows can be dropped safely. Runs daily via cron.
 */
export const pruneOldLimits = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 48 * 60 * 60_000; // 48 hours
    const rows = await ctx.db.query("rateLimits").withIndex("by_window", (q) => q.lt("windowStart", cutoff)).collect();
    for (const row of rows) await ctx.db.delete(row._id);
    return { pruned: rows.length };
  },
});
