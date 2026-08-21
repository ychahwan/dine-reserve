import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, mutation, query, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

// ---------------------------------------------------------------------------
// Kamix Points — loyalty program (Idea #18)
//
// Diners earn points for verified activity (completed bookings, reviews,
// gifts sent). Points are stored on the user doc and awarded idempotently:
// each awarding source passes a unique `sourceId` so the same booking can
// never be credited twice even if the mutation is retried.
// ---------------------------------------------------------------------------

export const POINTS = {
  COMPLETED_BOOKING: 50,
  REVIEW: 20,
  GIFT_SENT: 10,
  CHECK_IN: 5,
} as const;

/**
 * Award points to a user once per source (idempotent). Called from the
 * booking/review mutations; safe to retry.
 */
export async function awardPoints(
  ctx: MutationCtx,
  opts: {
    userId: Id<"users">;
    amount: number;
    source: "booking_completed" | "review" | "gift_sent" | "check_in";
    sourceId: string;
  },
) {
  const user = await ctx.db.get(opts.userId);
  if (!user) return;
  // idempotency: a per-user ledger row exists per source
  const existing = await ctx.db
    .query("loyaltyLedger")
    .withIndex("by_user_source", (q) => q.eq("userId", opts.userId).eq("sourceId", opts.sourceId))
    .first();
  if (existing) return;
  await ctx.db.insert("loyaltyLedger", {
    userId: opts.userId,
    amount: opts.amount,
    source: opts.source,
    sourceId: opts.sourceId,
    createdAt: Date.now(),
  });
  await ctx.db.patch(opts.userId, { points: (user.points ?? 0) + opts.amount });
}

// ---------------------------------------------------------------------------
// diner side
// ---------------------------------------------------------------------------

/** The diner's point balance + recent activity (public mutations expose
 *  only their own ledger). */
export const myBalance = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { points: 0, activity: [] as any[] };
    const user = await ctx.db.get(userId as Id<"users">);
    const entries = await ctx.db
      .query("loyaltyLedger")
      .withIndex("by_user", (q) => q.eq("userId", userId as Id<"users">))
      .collect();
    return {
      points: user?.points ?? 0,
      activity: entries
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 20)
        .map((e) => ({
          _id: e._id,
          amount: e.amount,
          source: e.source,
          createdAt: e.createdAt,
        })),
    };
  },
});

// ---------------------------------------------------------------------------
// admin / owner visibility (optional, useful in the admin console)
// ---------------------------------------------------------------------------

/** Top diners by lifetime points — used by the admin console. */
export const leaderboard = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    // Only admins can see other users' points.
    const me = await ctx.db.get(userId as Id<"users">);
    if (me?.role !== "admin") return [];
    const users = await ctx.db.query("users").collect();
    return users
      .filter((u) => (u.points ?? 0) > 0)
      .map((u) => ({ _id: u._id, name: u.name ?? "Diner", phone: u.phone, points: u.points ?? 0 }))
      .sort((a, b) => b.points - a.points)
      .slice(0, Math.min(limit ?? 25, 100));
  },
});

/** Internal helper used by booking completion to award points once. */
export const awardBookingPoints = internalMutation({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, { bookingId }) => {
    const booking = await ctx.db.get(bookingId);
    if (!booking || booking.status !== "completed") return;
    await awardPoints(ctx, {
      userId: booking.userId,
      amount: POINTS.COMPLETED_BOOKING,
      source: "booking_completed",
      sourceId: `booking:${booking._id}`,
    });
  },
});
