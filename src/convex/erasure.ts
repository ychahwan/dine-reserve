import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const FAVORITES_CLEANUP_PAGE = 200;

async function cleanupFavoritesPage(
  ctx: MutationCtx,
  restaurantId: Id<"restaurants">,
  cursor: string | null,
) {
  const users = await ctx.db
    .query("users")
    .paginate({ numItems: FAVORITES_CLEANUP_PAGE, cursor });
  await Promise.all(
    users.page.map((user) => {
      const favorites = user.favorites ?? [];
      return favorites.includes(restaurantId)
        ? ctx.db.patch(user._id, {
            favorites: favorites.filter((id) => id !== restaurantId),
          })
        : Promise.resolve();
    }),
  );
  if (!users.isDone) {
    await ctx.scheduler.runAfter(
      0,
      internal.erasure.cleanupRestaurantFavorites,
      {
        restaurantId,
        cursor: users.continueCursor,
      },
    );
  }
}

export const cleanupRestaurantFavorites = internalMutation({
  args: {
    restaurantId: v.id("restaurants"),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, { restaurantId, cursor }) => {
    await cleanupFavoritesPage(ctx, restaurantId, cursor ?? null);
  },
});

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
export async function invalidateUserSessions(
  ctx: MutationCtx,
  userId: Id<"users">,
) {
  const sessions = await ctx.db
    .query("authSessions")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .collect();
  for (const s of sessions) {
    const tokens = await ctx.db
      .query("authRefreshTokens")
      .withIndex("sessionIdAndParentRefreshTokenId", (q) =>
        q.eq("sessionId", s._id),
      )
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
 * ledger, notification inbox, pending phone changes, walk-in requests, FCM
 * tokens, AI conversations + messages, booking-queue entries, auth accounts
 * and sessions.
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
      ctx.db
        .query("dineOrders")
        .withIndex("by_booking", (q) => q.eq("bookingId", b._id))
        .collect(),
      ctx.db
        .query("assistRequests")
        .withIndex("by_booking", (q) => q.eq("bookingId", b._id))
        .collect(),
      ctx.db
        .query("notifications")
        .withIndex("by_booking", (q) => q.eq("bookingId", b._id))
        .collect(),
      ctx.db
        .query("dinerPresence")
        .withIndex("by_booking", (q) => q.eq("bookingId", b._id))
        .collect(),
      ctx.db
        .query("giftDeliveries")
        .withIndex("by_booking", (q) => q.eq("bookingId", b._id))
        .collect(),
    ]);
    for (const rows of [orders, assists, notifs, presence, gifts]) {
      for (const row of rows) await ctx.db.delete(row._id);
    }
    await ctx.db.delete(b._id);
  }

  // Remaining user-scoped rows (outside bookings).
  // H-13: also covers walkInRequests, notificationTokens (FCM tokens must not
  // outlive "permanent deletion"), AI conversations + messages, and
  // bookingQueue entries.
  const [
    reviews,
    waitlist,
    dineOrders,
    assists,
    menuReqs,
    presence,
    notifs,
    dn,
    ledger,
    phoneReqs,
    delReqs,
    walkIns,
    pushTokens,
    aiConvs,
    aiMsgs,
    queueEntries,
  ] = await Promise.all([
    ctx.db
      .query("reviews")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("waitlist")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("dineOrders")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("assistRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("menuRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("dinerPresence")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("dinerNotifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("loyaltyLedger")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("phoneChangeRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("accountDeleteRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("walkInRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("notificationTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("aiConversations")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("aiMessages")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("bookingQueue")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
  ]);
  for (const rows of [
    reviews,
    waitlist,
    dineOrders,
    assists,
    menuReqs,
    presence,
    notifs,
    dn,
    ledger,
    phoneReqs,
    delReqs,
    walkIns,
    pushTokens,
    aiConvs,
    aiMsgs,
    queueEntries,
  ]) {
    for (const row of rows) await ctx.db.delete(row._id);
  }

  const [sentGifts, receivedGifts] = await Promise.all([
    ctx.db
      .query("giftDeliveries")
      .withIndex("by_sender", (q) => q.eq("senderUserId", userId))
      .collect(),
    ctx.db
      .query("giftDeliveries")
      .withIndex("by_receiver", (q) => q.eq("receiverUserId", userId))
      .collect(),
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

/**
 * Permanently delete a restaurant and everything attached to it: sections,
 * hours, slots, rules, custom slots, menus + items (releasing uploaded photos
 * from storage), bookings + all dine-in data, waitlist, notifications,
 * reviews, stories, gifts, menu requests, presence, table QR codes, walk-in
 * requests and booking-queue entries. Also removes it from every diner's
 * favorites.
 *
 * Shared by the owner-facing restaurants.remove AND the admin moderation
 * console (admin.deleteRestaurant) so the two paths can never drift.
 */
export async function cascadeDeleteRestaurant(
  ctx: MutationCtx,
  restaurantId: Id<"restaurants">,
) {
  const sections = await ctx.db
    .query("sections")
    .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
    .collect();

  const [
    hours,
    slots,
    rules,
    customSlots,
    menus,
    waitlist,
    notifs,
    reviews,
    stories,
    gifts,
    menuReqs,
    presence,
    bookings,
    orders,
    assists,
    qrCodes,
    walkIns,
    queueEntries,
  ] = await Promise.all([
    ctx.db
      .query("hours")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect(),
    ctx.db
      .query("slots")
      .withIndex("by_restaurant_date", (q) =>
        q.eq("restaurantId", restaurantId),
      )
      .collect(),
    ctx.db
      .query("slotRules")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect(),
    ctx.db
      .query("customSlots")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect(),
    ctx.db
      .query("menus")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect(),
    ctx.db
      .query("waitlist")
      .withIndex("by_restaurant_date", (q) =>
        q.eq("restaurantId", restaurantId),
      )
      .collect(),
    ctx.db
      .query("notifications")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect(),
    ctx.db
      .query("reviews")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect(),
    ctx.db
      .query("stories")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect(),
    ctx.db
      .query("giftTypes")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect(),
    ctx.db
      .query("menuRequests")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect(),
    ctx.db
      .query("dinerPresence")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect(),
    ctx.db
      .query("bookings")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect(),
    ctx.db
      .query("dineOrders")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect(),
    ctx.db
      .query("assistRequests")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect(),
    ctx.db
      .query("tableQRCodes")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect(),
    ctx.db
      .query("walkInRequests")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect(),
    // M-19: bookingQueue has no by_restaurant index — by_slot is
    // (restaurantId, date, time), and an eq on the leading field is a valid
    // prefix scan.
    ctx.db
      .query("bookingQueue")
      .withIndex("by_slot", (q) => q.eq("restaurantId", restaurantId))
      .collect(),
  ]);

  for (const rows of [
    hours,
    slots,
    rules,
    customSlots,
    waitlist,
    notifs,
    reviews,
    stories,
    gifts,
    menuReqs,
    presence,
    orders,
    assists,
    qrCodes,
    walkIns,
    queueEntries,
  ]) {
    for (const row of rows) await ctx.db.delete(row._id);
  }
  for (const b of bookings) {
    const [bo, ba, bn, bp, bg] = await Promise.all([
      ctx.db
        .query("dineOrders")
        .withIndex("by_booking", (q) => q.eq("bookingId", b._id))
        .collect(),
      ctx.db
        .query("assistRequests")
        .withIndex("by_booking", (q) => q.eq("bookingId", b._id))
        .collect(),
      ctx.db
        .query("notifications")
        .withIndex("by_booking", (q) => q.eq("bookingId", b._id))
        .collect(),
      ctx.db
        .query("dinerPresence")
        .withIndex("by_booking", (q) => q.eq("bookingId", b._id))
        .collect(),
      ctx.db
        .query("giftDeliveries")
        .withIndex("by_booking", (q) => q.eq("bookingId", b._id))
        .collect(),
    ]);
    for (const rows of [bo, ba, bn, bp, bg])
      for (const row of rows) await ctx.db.delete(row._id);
    await ctx.db.delete(b._id);
  }
  const [giftsDelivered, menuItems] = await Promise.all([
    ctx.db
      .query("giftDeliveries")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect(),
    ctx.db
      .query("menuItems")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect(),
  ]);
  for (const g of giftsDelivered) await ctx.db.delete(g._id);
  for (const m of menuItems) {
    // Release the uploaded photo from storage (best-effort, never blocks).
    if (m.imageStorageId) {
      try {
        await ctx.storage.delete(m.imageStorageId);
      } catch {
        // storage cleanup is best-effort
      }
    }
    await ctx.db.delete(m._id);
  }
  for (const m of menus) await ctx.db.delete(m._id);
  for (const s of sections) await ctx.db.delete(s._id);

  // Start the bounded favorites cleanup; later pages continue after deletion.
  await cleanupFavoritesPage(ctx, restaurantId, null);

  await ctx.db.delete(restaurantId);
}
