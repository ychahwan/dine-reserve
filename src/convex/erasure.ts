import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/**
 * Shared GDPR-style account erasure.
 *
 * Used by BOTH the admin moderation console (admin.deleteUser) and the diner
 * self-service "delete my account" flow (users.deleteAccount) so the two
 * paths can never drift apart in what they wipe.
 */

/**
 * Delete every auth session + refresh token for a user (equivalent to the
 * auth library's `invalidateSessions`, implemented inline so it runs inside
 * a single mutation transaction — a deleted/disabled user is kicked out
 * immediately).
 */
export async function invalidateUserSessions(ctx: MutationCtx, userId: Id<"users">) {
  const sessions = await ctx.db
    .query("authSessions")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .collect();
  for (const s of sessions) {
    const tokens = await ctx.db
      .query("authRefreshTokens")
      .withIndex("sessionIdAndParentRefreshTokenId", (q) => q.eq("sessionId", s._id))
      .collect();
    for (const t of tokens) await ctx.db.delete(t._id);
    await ctx.db.delete(s._id);
  }
}

/**
 * Permanently delete a user and every piece of data that references them.
 *
 * Cascades: bookings (+ their dine orders, assist requests, notifications,
 * presence, gifts), waitlist, dine-in history, messages, reviews, loyalty
 * ledger, notification inbox, pending phone changes, auth accounts and
 * sessions.
 *
 * NOTE: does NOT check for owned restaurants — callers decide that policy
 * (the admin flow refuses while restaurants exist; the self-service flow is
 * only offered to non-owners anyway).
 */
export async function cascadeDeleteUser(ctx: MutationCtx, userId: Id<"users">) {
  // Bookings → their dependents first.
  const bookings = await ctx.db
    .query("bookings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const b of bookings) {
    const [orders, assists, notifs, presence, gifts] = await Promise.all([
      ctx.db.query("dineOrders").withIndex("by_booking", (q) => q.eq("bookingId", b._id)).collect(),
      ctx.db.query("assistRequests").withIndex("by_booking", (q) => q.eq("bookingId", b._id)).collect(),
      ctx.db.query("notifications").withIndex("by_booking", (q) => q.eq("bookingId", b._id)).collect(),
      ctx.db.query("dinerPresence").withIndex("by_booking", (q) => q.eq("bookingId", b._id)).collect(),
      ctx.db.query("giftDeliveries").withIndex("by_booking", (q) => q.eq("bookingId", b._id)).collect(),
    ]);
    for (const rows of [orders, assists, notifs, presence, gifts]) {
      for (const row of rows) await ctx.db.delete(row._id);
    }
    await ctx.db.delete(b._id);
  }

  // Remaining user-scoped rows (outside bookings).
  const [reviews, waitlist, dineOrders, assists, menuReqs, presence, notifs, dn, ledger, phoneReqs, delReqs] =
    await Promise.all([
      ctx.db.query("reviews").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("waitlist").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("dineOrders").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("assistRequests").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("menuRequests").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("dinerPresence").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("notifications").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("dinerNotifications").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("loyaltyLedger").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("phoneChangeRequests").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("accountDeleteRequests").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
    ]);
  for (const rows of [reviews, waitlist, dineOrders, assists, menuReqs, presence, notifs, dn, ledger, phoneReqs, delReqs]) {
    for (const row of rows) await ctx.db.delete(row._id);
  }

  const [sentGifts, receivedGifts] = await Promise.all([
    ctx.db.query("giftDeliveries").withIndex("by_sender", (q) => q.eq("senderUserId", userId)).collect(),
    ctx.db.query("giftDeliveries").withIndex("by_receiver", (q) => q.eq("receiverUserId", userId)).collect(),
  ]);
  for (const g of [...sentGifts, ...receivedGifts]) await ctx.db.delete(g._id);

  // Auth identity + sessions.
  const accounts = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
    .collect();
  for (const a of accounts) await ctx.db.delete(a._id);
  await invalidateUserSessions(ctx, userId);

  await ctx.db.delete(userId);
}
