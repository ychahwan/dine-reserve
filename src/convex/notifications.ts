import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, action, type MutationCtx } from "./_generated/server";
import { api } from "./_generated/api";
import { NOTIFICATION_TYPE } from "./schema";
import type { Id, Doc } from "./_generated/dataModel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format today as YYYY-MM-DD in the server's local timezone. */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Accept an optional client-supplied date so that diners near midnight can
 * still send alerts when their local date differs from UTC.  If the client
 * date is within ±1 day of the server's today, use it; otherwise fall back.
 */
function resolveTodayKey(clientDate?: string): string {
  const serverToday = todayKey();
  if (!clientDate || !/^\d{4}-\d{2}-\d{2}$/.test(clientDate)) return serverToday;
  const msPerDay = 24 * 60 * 60 * 1000;
  const diffMs = Math.abs(
    new Date(`${clientDate}T00:00:00Z`).getTime() - new Date(`${serverToday}T00:00:00Z`).getTime(),
  );
  return diffMs <= msPerDay ? clientDate : serverToday;
}

// ---------------------------------------------------------------------------
// notifyRestaurant — shared helper called by bookings, dining, socialize
// ---------------------------------------------------------------------------

type NotifyOpts = {
  restaurantId: Id<"restaurants">;
  bookingId: Id<"bookings">;
  userId: Id<"users">;
  type: Doc<"notifications">["type"];
  message?: string;
};

/**
 * Insert a notification row for the restaurant dashboard.  Called inside other
 * mutations so it shares the same transaction.
 */
export async function notifyRestaurant(
  ctx: MutationCtx,
  opts: NotifyOpts,
): Promise<Id<"notifications">> {
  return ctx.db.insert("notifications", {
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
// sendForBooking — diner sends a check-in alert (Idea #31)
// ---------------------------------------------------------------------------

export const sendForBooking = mutation({
  args: {
    bookingId: v.id("bookings"),
    type: v.union(
      v.literal("on_my_way"),
      v.literal("running_late"),
      v.literal("arrived"),
      v.literal("special_request"),
    ),
    message: v.optional(v.string()),
    clientDate: v.optional(v.string()),
  },
  handler: async (ctx, { bookingId, type, message, clientDate }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Please sign in.");

    const booking = await ctx.db.get(bookingId);
    if (!booking) throw new Error("Booking not found.");
    if (booking.userId !== userId)
      throw new Error("You can only notify the restaurant for your own booking.");
    if (booking.status !== "confirmed")
      throw new Error("This booking is no longer confirmed.");

    // KB-04: use clientDate when available so diners near midnight aren't
    // blocked by the UTC clock running a day ahead.
    if (booking.date < resolveTodayKey(clientDate))
      throw new Error("You can send alerts on the day of your booking.");

    await notifyRestaurant(ctx, {
      restaurantId: booking.restaurantId,
      bookingId: booking._id,
      userId,
      type,
      message: message?.trim() || undefined,
    });

    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// myAlerts — diner's own sent alerts (for the "notified" badge on cards)
// ---------------------------------------------------------------------------

export const myAlerts = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];

    const ALERT_TYPES = new Set([
      "on_my_way",
      "running_late",
      "arrived",
      "special_request",
    ]);

    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);

    return rows
      .filter((r) => ALERT_TYPES.has(r.type))
      .map((r) => ({
        _id: r._id,
        bookingId: r.bookingId,
        type: r.type,
        message: r.message,
        createdAt: r.createdAt,
      }));
  },
});

// ---------------------------------------------------------------------------
// forRestaurant — owner dashboard: all notifications for a restaurant,
// optionally filtered by bookingId.  Joins with diner name + booking info.
// ---------------------------------------------------------------------------

export const forRestaurant = query({
  args: {
    restaurantId: v.id("restaurants"),
    bookingId: v.optional(v.id("bookings")),
  },
  handler: async (ctx, { restaurantId, bookingId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];

    const restaurant = await ctx.db.get(restaurantId);
    if (!restaurant || restaurant.ownerId !== userId) return [];

    let q = ctx.db
      .query("notifications")
      .withIndex("by_restaurant", (i) => i.eq("restaurantId", restaurantId));

    if (bookingId) {
      q = ctx.db
        .query("notifications")
        .withIndex("by_booking", (i) => i.eq("bookingId", bookingId));
    }

    const rows = await q.order("desc").take(200);

    return Promise.all(
      rows.map(async (r) => {
        const diner = await ctx.db.get(r.userId);
        const booking = r.bookingId ? await ctx.db.get(r.bookingId) : null;
        return {
          _id: r._id,
          type: r.type,
          message: r.message,
          read: r.read,
          createdAt: r.createdAt,
          bookingId: r.bookingId,
          dinerName: (diner as any)?.name ?? (diner as any)?.email ?? "Diner",
          booking: booking
            ? {
                _id: booking._id,
                date: booking.date,
                time: booking.time,
                partySize: booking.partySize,
                code: booking.code,
                sectionName: (booking as any).sectionName,
              }
            : null,
        };
      }),
    );
  },
});

// ---------------------------------------------------------------------------
// unreadCount — owner tab badge
// ---------------------------------------------------------------------------

export const unreadCount = query({
  args: {
    restaurantId: v.id("restaurants"),
  },
  handler: async (ctx, { restaurantId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return 0;

    const restaurant = await ctx.db.get(restaurantId);
    if (!restaurant || restaurant.ownerId !== userId) return 0;

    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_restaurant_read", (q) =>
        q.eq("restaurantId", restaurantId).eq("read", false),
      )
      .collect();

    return rows.length;
  },
});

// ---------------------------------------------------------------------------
// markRead — mark a single notification as read
// ---------------------------------------------------------------------------

export const markRead = mutation({
  args: {
    id: v.id("notifications"),
  },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Please sign in.");

    const notif = await ctx.db.get(id);
    if (!notif) throw new Error("Notification not found.");

    const restaurant = await ctx.db.get(notif.restaurantId);
    if (!restaurant || restaurant.ownerId !== userId)
      throw new Error("Only the restaurant owner can mark notifications as read.");

    await ctx.db.patch(id, { read: true });
  },
});

// ---------------------------------------------------------------------------
// markAllRead — mark all notifications for a restaurant as read
// ---------------------------------------------------------------------------

export const markAllRead = mutation({
  args: {
    restaurantId: v.id("restaurants"),
  },
  handler: async (ctx, { restaurantId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Please sign in.");

    const restaurant = await ctx.db.get(restaurantId);
    if (!restaurant || restaurant.ownerId !== userId)
      throw new Error("Only the restaurant owner can mark notifications as read.");

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_restaurant_read", (q) =>
        q.eq("restaurantId", restaurantId).eq("read", false),
      )
      .collect();

    for (const n of unread) {
      await ctx.db.patch(n._id, { read: true });
    }

    return { marked: unread.length };
  },
});

// ===========================================================================
// Firebase Cloud Messaging — push notification token management
// ===========================================================================

/**
 * Save a push notification token for a user
 */
export const saveToken = mutation({
  args: {
    token: v.string(),
    platform: v.union(v.literal("android"), v.literal("ios"), v.literal("web")),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("notificationTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        userId: args.userId,
        platform: args.platform,
        lastUsed: Date.now(),
        active: true,
      });
      return existing._id;
    }

    return await ctx.db.insert("notificationTokens", {
      token: args.token,
      platform: args.platform,
      userId: args.userId,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      active: true,
    });
  },
});

/**
 * Remove a push notification token
 */
export const removeToken = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("notificationTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { active: false });
    }
  },
});

/**
 * Get all active tokens for a user
 */
export const getUserTokens = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("notificationTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("active"), true))
      .collect();
  },
});

/**
 * Get all active tokens (for broadcasting)
 */
export const getAllActiveTokens = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("notificationTokens")
      .filter((q) => q.eq(q.field("active"), true))
      .collect();
  },
});

/**
 * Send a push notification to a specific user
 */
export const sendToUser = action({
  args: {
    userId: v.id("users"),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const tokens = await ctx.runQuery(api.notifications.getUserTokens, {
      userId: args.userId,
    });

    if (tokens.length === 0) {
      console.log("No active tokens for user:", args.userId);
      return { sent: 0 };
    }

    const serverKey = process.env.FIREBASE_SERVER_KEY;
    if (!serverKey) {
      console.error("FIREBASE_SERVER_KEY not configured");
      return { sent: 0, error: "Server key not configured" };
    }

    let sentCount = 0;
    for (const tokenRecord of tokens) {
      try {
        const response = await fetch("https://fcm.googleapis.com/fcm/send", {
          method: "POST",
          headers: {
            Authorization: `key=${serverKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: tokenRecord.token,
            notification: {
              title: args.title,
              body: args.body,
            },
            data: args.data || {},
          }),
        });

        if (response.ok) {
          sentCount++;
          await ctx.runMutation(api.notifications.updateTokenLastUsed, {
            tokenId: tokenRecord._id,
          });
        }
      } catch (error) {
        console.error("Failed to send notification:", error);
      }
    }

    return { sent: sentCount, total: tokens.length };
  },
});

/**
 * Send a broadcast notification to all users
 */
export const broadcast = action({
  args: {
    title: v.string(),
    body: v.string(),
    data: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const tokens = await ctx.runQuery(api.notifications.getAllActiveTokens);

    if (tokens.length === 0) {
      return { sent: 0 };
    }

    const serverKey = process.env.FIREBASE_SERVER_KEY;
    if (!serverKey) {
      return { sent: 0, error: "Server key not configured" };
    }

    const BATCH_SIZE = 500;
    let sentCount = 0;

    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batch = tokens.slice(i, i + BATCH_SIZE);
      const registration_ids = batch.map((t) => t.token);

      try {
        const response = await fetch("https://fcm.googleapis.com/fcm/send", {
          method: "POST",
          headers: {
            Authorization: `key=${serverKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            registration_ids,
            notification: {
              title: args.title,
              body: args.body,
            },
            data: args.data || {},
          }),
        });

        if (response.ok) {
          sentCount += registration_ids.length;
        }
      } catch (error) {
        console.error("Failed to send batch notification:", error);
      }
    }

    return { sent: sentCount, total: tokens.length };
  },
});

/**
 * Update token last used timestamp
 */
export const updateTokenLastUsed = mutation({
  args: {
    tokenId: v.id("notificationTokens"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.tokenId, {
      lastUsed: Date.now(),
    });
  },
});

/**
 * Clean up old inactive tokens (run periodically)
 */
export const cleanupTokens = mutation({
  args: {
    olderThanDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.olderThanDays || 90;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const oldTokens = await ctx.db
      .query("notificationTokens")
      .filter((q) =>
        q.and(
          q.eq(q.field("active"), false),
          q.lt(q.field("lastUsed"), cutoff),
        ),
      )
      .collect();

    let deleted = 0;
    for (const token of oldTokens) {
      await ctx.db.delete(token._id);
      deleted++;
    }

    return { deleted };
  },
});
