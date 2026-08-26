import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { NOTIFICATION_TYPE } from "./schema";
import type { Id, Doc } from "./_generated/dataModel";
import { checkRateLimit } from "./rateLimit";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Server "today" as "YYYY-MM-DD". Built from local clock components — the
 * same way booking dates are produced elsewhere (lib/format, socialize) — so
 * every module derives the same calendar day (L-13). Exported so
 * socialize.ts shares this exact implementation.
 */
export function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

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
  bookingId?: Id<"bookings">;
  userId: Id<"users">;
  type: Doc<"notifications">["type"];
  message?: string;
};

export async function notifyRestaurant(
  ctx: MutationCtx,
  opts: NotifyOpts,
): Promise<Id<"notifications">> {
  return ctx.db.insert("notifications", {
    restaurantId: opts.restaurantId,
    ...(opts.bookingId !== undefined ? { bookingId: opts.bookingId } : {}),
    userId: opts.userId,
    type: opts.type,
    message: opts.message,
    read: false,
    createdAt: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// sendForBooking
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

    // H-7: alerts are only allowed ON the day of the booking (not days
    // ahead), and throttled per user+booking so the owner feed can't be
    // flooded.
    await checkRateLimit(ctx, {
      key: `sendForBooking:${bookingId}`,
      userId,
      limit: 10,
      windowMs: 60 * 60_000,
    });

    if (booking.date !== resolveTodayKey(clientDate))
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
// myAlerts
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

    // L-12: walk the feed in pages and filter as we go — a bare take(50)
    // fills the page with non-alert rows so older matching alerts vanish.
    const results: {
      _id: Id<"notifications">;
      bookingId: Id<"bookings"> | undefined;
      type: string;
      message: string | undefined;
      createdAt: number;
    }[] = [];
    const PAGE_SIZE = 200;
    let cursor: string | null = null;
    for (let page = 0; page < 10 && results.length < 50; page++) {
      const batch = await ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .order("desc")
        .paginate({ numItems: PAGE_SIZE, cursor });
      for (const r of batch.page) {
        if (!ALERT_TYPES.has(r.type)) continue;
        results.push({
          _id: r._id,
          bookingId: r.bookingId,
          type: r.type,
          message: r.message,
          createdAt: r.createdAt,
        });
        if (results.length >= 50) break;
      }
      if (batch.isDone) break;
      cursor = batch.continueCursor;
    }
    return results.slice(0, 50);
  },
});

// ---------------------------------------------------------------------------
// forRestaurant
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
      // H-4: the booking must belong to this restaurant, or an owner of A
      // could read restaurant B's notifications by passing any booking id.
      const booking = await ctx.db.get(bookingId);
      if (!booking || booking.restaurantId !== restaurantId) return [];
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
// unreadCount
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
// markRead
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
// markAllRead
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

export const saveToken = mutation({
  args: {
    token: v.string(),
    platform: v.union(v.literal("android"), v.literal("ios"), v.literal("web")),
  },
  handler: async (ctx, args) => {
    // C-2: the token is always bound to the CALLER — userId is never accepted
    // as an argument, or any client could route a victim's pushes to its own
    // device.
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Please sign in.");

    const existing = await ctx.db
      .query("notificationTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        userId,
        platform: args.platform,
        lastUsed: Date.now(),
        active: true,
      });
      return existing._id;
    }

    return await ctx.db.insert("notificationTokens", {
      token: args.token,
      platform: args.platform,
      userId,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      active: true,
    });
  },
});

export const removeToken = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    // L-9: public (called on logout) but restricted to the caller's own
    // tokens so no one can deactivate another user's device.
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Please sign in.");

    const existing = await ctx.db
      .query("notificationTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!existing || existing.userId !== userId)
      throw new Error("Token not found.");
    await ctx.db.patch(existing._id, { active: false });
  },
});

export const getUserTokens = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // C-4: a caller may only enumerate their OWN tokens.
    const authUserId = await getAuthUserId(ctx);
    if (authUserId === null || authUserId !== args.userId) return [];

    return await ctx.db
      .query("notificationTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("active"), true))
      .collect();
  },
});

/** Internal twin of getUserTokens for push-sending to an arbitrary target. */
export const _getUserTokensForPush = internalQuery({
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
 * Internal dump of every active token — C-3: never exposed as a public query
 * (the former public `getAllActiveTokens` was an unauthenticated credential
 * dump). Used only by the broadcast action.
 */
export const _getAllActiveTokensForPush = internalQuery({
  handler: async (ctx) => {
    return await ctx.db
      .query("notificationTokens")
      .filter((q) => q.eq(q.field("active"), true))
      .collect();
  },
});

export const updateTokenLastUsed = internalMutation({
  args: {
    tokenId: v.id("notificationTokens"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.tokenId, {
      lastUsed: Date.now(),
    });
  },
});

export const cleanupTokens = internalMutation({
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

// ===========================================================================
// FCM HTTP v1 — push notification sending (Web Crypto API, no Node.js)
// ===========================================================================

/** Base64url-encode a string without padding. */
function b64url(input: string): string {
  return btoa(input)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Import a PEM PKCS#8 private key for RS256 signing. */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/** Get an OAuth2 access token via Google's JWT bearer flow (RFC 7523). */
async function getAccessToken(saJson: string): Promise<string> {
  const sa = JSON.parse(saJson);
  const now = Math.floor(Date.now() / 1000);

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    }),
  );

  const key = await importPrivateKey(sa.private_key);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  );

  const jwt = `${header}.${claims}.${b64url(String.fromCharCode(...new Uint8Array(sig)))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

/** Send a single FCM v1 message. */
async function sendFcmV1(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>,
  accessToken?: string,
  projectId?: string,
): Promise<boolean> {
  if (!accessToken || !projectId) return false;
  try {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body },
            ...(data && { data }),
          },
        }),
      },
    );
    if (!res.ok) {
      console.error(`FCM v1 ${res.status}:`, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("FCM send error:", err);
    return false;
  }
}

/** Resolve service account credentials (cached per invocation). */
async function resolveCredentials() {
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saJson) return null;
  const projectId = JSON.parse(saJson).project_id;
  const accessToken = await getAccessToken(saJson);
  return { projectId, accessToken };
}

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
  handler: async (
    ctx,
    args,
  ): Promise<{ sent: number; total?: number; error?: string }> => {
    const tokens = await ctx.runQuery(internal.notifications._getUserTokensForPush, {
      userId: args.userId,
    });
    if (tokens.length === 0) return { sent: 0 };

    const creds = await resolveCredentials();
    if (!creds) return { sent: 0, error: "FIREBASE_SERVICE_ACCOUNT not configured" };

    let sent = 0;
    for (const t of tokens) {
      if (
        await sendFcmV1(
          t.token,
          args.title,
          args.body,
          args.data as Record<string, string> | undefined,
          creds.accessToken,
          creds.projectId,
        )
      ) {
        sent++;
        await ctx.runMutation(internal.notifications.updateTokenLastUsed, {
          tokenId: t._id,
        });
      }
    }
    return { sent, total: tokens.length };
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
  handler: async (
    ctx,
    args,
  ): Promise<{ sent: number; total?: number; error?: string }> => {
    const tokens = await ctx.runQuery(internal.notifications._getAllActiveTokensForPush);
    if (tokens.length === 0) return { sent: 0 };

    const creds = await resolveCredentials();
    if (!creds) return { sent: 0, error: "FIREBASE_SERVICE_ACCOUNT not configured" };

    let sent = 0;
    for (const t of tokens) {
      if (
        await sendFcmV1(
          t.token,
          args.title,
          args.body,
          args.data as Record<string, string> | undefined,
          creds.accessToken,
          creds.projectId,
        )
      )
        sent++;
    }
    return { sent, total: tokens.length };
  },
});
