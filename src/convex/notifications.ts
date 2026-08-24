import { v } from "convex/values";
import { mutation, query, action } from "../_generated/server";

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
    // Check if token already exists
    const existing = await ctx.db
      .query("notificationTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (existing) {
      // Update existing token
      await ctx.db.patch(existing._id, {
        userId: args.userId,
        platform: args.platform,
        lastUsed: Date.now(),
        active: true,
      });
      return existing._id;
    }

    // Create new token
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
          // Update lastUsed timestamp
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

    // FCM supports multicast (up to 500 tokens)
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
