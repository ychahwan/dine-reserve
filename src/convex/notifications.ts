import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// Diner-sent check-in alerts ("moving now" style). booking_created /
// booking_cancelled are written automatically by the booking engine.
export const DINER_ALERT_TYPES = v.union(
  v.literal("on_my_way"),
  v.literal("running_late"),
  v.literal("arrived"),
  v.literal("special_request"),
);

export const ALL_NOTIFICATION_TYPES = v.union(
  DINER_ALERT_TYPES,
  v.literal("booking_created"),
  v.literal("booking_cancelled"),
);

/**
 * Shared insert helper used by the booking engine and by sendForBooking.
 * Not exported as a public function — call it from within other mutations.
 */
export async function notifyRestaurant(
  ctx: MutationCtx,
  opts: {
    restaurantId: Id<"restaurants">;
    bookingId?: Id<"bookings">;
    userId: Id<"users">;
    type: "on_my_way" | "running_late" | "arrived" | "special_request" | "booking_created" | "booking_cancelled";
    message?: string;
  },
) {
  await ctx.db.insert("notifications", {
    restaurantId: opts.restaurantId,
    bookingId: opts.bookingId,
    userId: opts.userId,
    type: opts.type,
    message: opts.message,
    read: false,
    createdAt: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// diner side
// ---------------------------------------------------------------------------

/** Diner sends a check-in alert tied to one of their confirmed bookings. */
export const sendForBooking = mutation({
  args: {
    bookingId: v.id("bookings"),
    type: DINER_ALERT_TYPES,
    message: v.optional(v.string()),
  },
  handler: async (ctx, { bookingId, type, message }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Please sign in to notify the restaurant.");

    const booking = await ctx.db.get(bookingId);
    if (!booking || booking.userId !== userId) throw new Error("Booking not found.");
    if (booking.status !== "confirmed") {
      throw new Error("Only confirmed bookings can send alerts.");
    }
    // only for upcoming bookings
    const now = new Date();
    const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate(),
    ).padStart(2, "0")}`;
    if (booking.date < localToday) throw new Error("This booking is in the past.");

    const cleaned = message?.trim().slice(0, 300);
    await notifyRestaurant(ctx, {
      restaurantId: booking.restaurantId,
      bookingId: booking._id,
      userId,
      type,
      message: cleaned || undefined,
    });
    return await ctx.db.get(bookingId);
  },
});

/** The diner's own sent alerts, for showing "you notified the restaurant" state. */
export const myAlerts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const items = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const restaurants = await Promise.all(items.map((n) => ctx.db.get(n.restaurantId)));
    return items
      .map((n, i) => ({
        ...n,
        restaurantName: restaurants[i]?.name ?? "Restaurant",
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

// ---------------------------------------------------------------------------
// owner side
// ---------------------------------------------------------------------------

async function isOwnerOf(
  ctx: MutationCtx | QueryCtx,
  userId: string,
  restaurantId: Id<"restaurants">,
): Promise<boolean> {
  const restaurant = await ctx.db.get(restaurantId);
  return !!restaurant && restaurant.ownerId === userId;
}

/** All notifications for one restaurant — optionally filtered to one booking. */
export const forRestaurant = query({
  args: {
    restaurantId: v.id("restaurants"),
    bookingId: v.optional(v.id("bookings")),
  },
  handler: async (ctx, { restaurantId, bookingId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    if (!(await isOwnerOf(ctx, userId, restaurantId))) return [];

    const items = bookingId
      ? await ctx.db
          .query("notifications")
          .withIndex("by_booking", (q) => q.eq("bookingId", bookingId))
          .collect()
      : await ctx.db
          .query("notifications")
          .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
          .collect();

    const [users, bookings] = await Promise.all([
      Promise.all(items.map((n) => ctx.db.get(n.userId))),
      Promise.all(items.map((n) => (n.bookingId ? ctx.db.get(n.bookingId) : null))),
    ]);

    return items
      .map((n, i) => ({
        ...n,
        dinerName: users[i]?.name ?? "Guest",
        booking: bookings[i]
          ? {
              _id: bookings[i]!._id,
              date: bookings[i]!.date,
              time: bookings[i]!.time,
              partySize: bookings[i]!.partySize,
              code: bookings[i]!.code,
              sectionName: bookings[i]!.sectionName,
            }
          : null,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Unread count for the owner tab badge. */
export const unreadCount = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, { restaurantId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return 0;
    if (!(await isOwnerOf(ctx, userId, restaurantId))) return 0;
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_restaurant_read", (q) => q.eq("restaurantId", restaurantId).eq("read", false))
      .collect();
    return unread.length;
  },
});

/** Mark one notification as read (owner). */
export const markRead = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const n = await ctx.db.get(id);
    if (!n) return null;
    if (!(await isOwnerOf(ctx, userId, n.restaurantId))) throw new Error("Not allowed.");
    if (!n.read) await ctx.db.patch(id, { read: true });
    return await ctx.db.get(id);
  },
});

/** Mark every unread notification of the restaurant as read. */
export const markAllRead = mutation({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, { restaurantId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    if (!(await isOwnerOf(ctx, userId, restaurantId))) throw new Error("Not allowed.");
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_restaurant_read", (q) => q.eq("restaurantId", restaurantId).eq("read", false))
      .collect();
    await Promise.all(unread.map((n) => ctx.db.patch(n._id, { read: true })));
    return unread.length;
  },
});
