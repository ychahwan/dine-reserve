import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { safeGet } from "./helpers";

/**
 * Read-only platform-admin views. Every query here is gated by requireAdmin so
 * only the platform admin (role === "admin") can enumerate restaurants, users,
 * and their interactions. This powers the admin console web app.
 */

async function requireAdmin(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("You must be signed in.");
  const user = await ctx.db.get(userId);
  if (user?.role !== "admin") throw new Error("Admins only.");
  return { userId, user };
}

/** Average rating + count for a list of review docs. */
function summarizeReviews(reviews: Doc<"reviews">[]) {
  const count = reviews.length;
  const avg =
    count > 0
      ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10
      : 0;
  return { avg, count };
}

/** Resolve restaurant names for a list of docs that carry restaurantId. */
async function restaurantNames(ctx: QueryCtx, ids: Iterable<string>) {
  const uniq = [...new Set(ids)];
  const entries = await Promise.all(
    uniq.map(async (id) => {
      const r = await safeGet<Doc<"restaurants">>(ctx, id);
      return [id, r?.name ?? null] as const;
    }),
  );
  return new Map(entries);
}

/** Resolve user display names for a list of docs that carry userId. */
async function userNames(ctx: QueryCtx, ids: Iterable<string>) {
  const uniq = [...new Set(ids)];
  const entries = await Promise.all(
    uniq.map(async (id) => {
      const u = await safeGet<Doc<"users">>(ctx, id);
      return [id, u?.name ?? null] as const;
    }),
  );
  return new Map(entries);
}

// ---------------------------------------------------------------------------
// Platform overview
// ---------------------------------------------------------------------------

export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const [restaurants, users, bookings, orders, reviews] = await Promise.all([
      ctx.db.query("restaurants").collect(),
      ctx.db.query("users").collect(),
      ctx.db.query("bookings").collect(),
      ctx.db.query("dineOrders").collect(),
      ctx.db.query("reviews").collect(),
    ]);

    // M-17: revenue counts only completed orders — open/preparing/served are
    // not yet money earned, cancelled never was.
    const revenueCents = orders
      .filter((o) => o.status === "completed")
      .reduce((s, o) => s + o.totalCents, 0);

    return {
      restaurants: restaurants.length,
      users: users.length,
      byRole: {
        admin: users.filter((u) => u.role === "admin").length,
        owner: users.filter((u) => u.role === "owner").length,
        customer: users.filter((u) => u.role === "customer").length,
        other: users.filter((u) => u.role !== "admin" && u.role !== "owner" && u.role !== "customer").length,
      },
      bookings: bookings.length,
      bookingsByStatus: {
        confirmed: bookings.filter((b) => b.status === "confirmed").length,
        completed: bookings.filter((b) => b.status === "completed").length,
        cancelled: bookings.filter((b) => b.status === "cancelled").length,
        noShow: bookings.filter((b) => b.status === "no_show").length,
      },
      orders: orders.length,
      revenueCents,
      reviews: reviews.length,
      avgRating: summarizeReviews(reviews).avg,
    };
  },
});

// ---------------------------------------------------------------------------
// Restaurants
// ---------------------------------------------------------------------------

export const listRestaurants = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const restaurants = await ctx.db.query("restaurants").collect();

    const rows = await Promise.all(
      restaurants.map(async (r) => {
        const owner = await safeGet<Doc<"users">>(ctx, r.ownerId);
        const [reviews, bookings, orders] = await Promise.all([
          ctx.db.query("reviews").withIndex("by_restaurant", (q) => q.eq("restaurantId", r._id)).collect(),
          ctx.db.query("bookings").withIndex("by_restaurant", (q) => q.eq("restaurantId", r._id)).collect(),
          ctx.db.query("dineOrders").withIndex("by_restaurant", (q) => q.eq("restaurantId", r._id)).collect(),
        ]);
        // M-17: completed orders only (see overview).
        const revenueCents = orders
          .filter((o) => o.status === "completed")
          .reduce((s, o) => s + o.totalCents, 0);
        return {
          ...r,
          ownerName: owner?.name ?? null,
          ownerPhone: owner?.phone ?? null,
          ownerEmail: owner?.email ?? null,
          rating: summarizeReviews(reviews),
          bookingCount: bookings.length,
          orderCount: orders.length,
          revenueCents,
        };
      }),
    );

    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Full restaurant record + owner + operational history for the admin detail view. */
export const restaurantDetail = query({
  args: { id: v.id("restaurants") },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    const restaurant = await ctx.db.get(id);
    if (!restaurant) return null;

    const owner = await safeGet<Doc<"users">>(ctx, restaurant.ownerId);
    const [sections, hours, menus, bookings, orders, reviews, notifications, assists, menuRequests, gifts] =
      await Promise.all([
        ctx.db.query("sections").withIndex("by_restaurant", (q) => q.eq("restaurantId", id)).collect(),
        ctx.db.query("hours").withIndex("by_restaurant", (q) => q.eq("restaurantId", id)).collect(),
        ctx.db.query("menus").withIndex("by_restaurant", (q) => q.eq("restaurantId", id)).collect(),
        ctx.db.query("bookings").withIndex("by_restaurant", (q) => q.eq("restaurantId", id)).collect(),
        ctx.db.query("dineOrders").withIndex("by_restaurant", (q) => q.eq("restaurantId", id)).collect(),
        ctx.db.query("reviews").withIndex("by_restaurant", (q) => q.eq("restaurantId", id)).collect(),
        ctx.db.query("notifications").withIndex("by_restaurant", (q) => q.eq("restaurantId", id)).collect(),
        ctx.db.query("assistRequests").withIndex("by_restaurant", (q) => q.eq("restaurantId", id)).collect(),
        ctx.db.query("menuRequests").withIndex("by_restaurant", (q) => q.eq("restaurantId", id)).collect(),
        ctx.db.query("giftDeliveries").withIndex("by_restaurant", (q) => q.eq("restaurantId", id)).collect(),
      ]);

    const bookingUserNames = await userNames(ctx, bookings.map((b) => b.userId));
    const orderUserNames = await userNames(ctx, orders.map((o) => o.userId));
    const reviewUserNames = await userNames(ctx, reviews.map((r) => r.userId));

    const bookingsView = bookings
      .map((b) => ({ ...b, userName: bookingUserNames.get(b.userId) ?? "Diner" }))
      .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`));
    const ordersView = orders
      .map((o) => ({ ...o, userName: orderUserNames.get(o.userId) ?? "Diner" }))
      .sort((a, b) => b.createdAt - a.createdAt);
    const reviewsView = reviews
      .map((r) => ({ ...r, authorName: reviewUserNames.get(r.userId) ?? "Diner" }))
      .sort((a, b) => b.createdAt - a.createdAt);

    // time-to-resolve for assist requests (createdAt → resolvedAt)
    const assistsView = assists
      .map((a) => ({
        ...a,
        resolveMs: a.resolvedAt ? a.resolvedAt - a.createdAt : null,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);

    return {
      restaurant,
      owner,
      sections,
      hours,
      menus,
      bookings: bookingsView,
      orders: ordersView,
      reviews: reviewsView,
      rating: summarizeReviews(reviews),
      notifications: notifications.sort((a, b) => b.createdAt - a.createdAt),
      assists: assistsView,
      menuRequests: menuRequests.sort((a, b) => b.createdAt - a.createdAt),
      gifts: gifts.sort((a, b) => b.createdAt - a.createdAt),
    };
  },
});

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();

    const rows = await Promise.all(
      users.map(async (u) => {
        const [bookings, orders, reviews] = await Promise.all([
          ctx.db.query("bookings").withIndex("by_user", (q) => q.eq("userId", u._id)).collect(),
          ctx.db.query("dineOrders").withIndex("by_user", (q) => q.eq("userId", u._id)).collect(),
          ctx.db.query("reviews").withIndex("by_user", (q) => q.eq("userId", u._id)).collect(),
        ]);
        // M-17: completed orders only (see overview).
        const totalSpendCents = orders
          .filter((o) => o.status === "completed")
          .reduce((s, o) => s + o.totalCents, 0);
        const owned = u.role === "owner" || u.role === "admin"
          ? await ctx.db.query("restaurants").withIndex("by_owner", (q) => q.eq("ownerId", u._id)).collect()
          : [];
        return {
          ...u,
          bookingCount: bookings.length,
          orderCount: orders.length,
          reviewCount: reviews.length,
          totalSpendCents,
          ownedRestaurants: owned.map((r) => ({ _id: r._id, name: r.name })),
        };
      }),
    );

    return rows.sort((a, b) => (b._creationTime ?? 0) - (a._creationTime ?? 0));
  },
});

/** Full user record + their bookings, orders, reviews and interactions. */
export const userDetail = query({
  args: { id: v.id("users") },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(id);
    if (!user) return null;

    const [bookings, orders, reviews, assists, menuRequests, giftsSent, giftsReceived, owned] =
      await Promise.all([
        ctx.db.query("bookings").withIndex("by_user", (q) => q.eq("userId", id)).collect(),
        ctx.db.query("dineOrders").withIndex("by_user", (q) => q.eq("userId", id)).collect(),
        ctx.db.query("reviews").withIndex("by_user", (q) => q.eq("userId", id)).collect(),
        ctx.db.query("assistRequests").withIndex("by_user", (q) => q.eq("userId", id)).collect(),
        ctx.db.query("menuRequests").withIndex("by_user", (q) => q.eq("userId", id)).collect(),
        ctx.db.query("giftDeliveries").withIndex("by_sender", (q) => q.eq("senderUserId", id)).collect(),
        ctx.db.query("giftDeliveries").withIndex("by_receiver", (q) => q.eq("receiverUserId", id)).collect(),
        ctx.db.query("restaurants").withIndex("by_owner", (q) => q.eq("ownerId", id)).collect(),
      ]);

    const bookingRestaurants = await restaurantNames(ctx, bookings.map((b) => b.restaurantId));
    const orderRestaurants = await restaurantNames(ctx, orders.map((o) => o.restaurantId));
    const reviewRestaurants = await restaurantNames(ctx, reviews.map((r) => r.restaurantId));
    const assistRestaurants = await restaurantNames(ctx, assists.map((a) => a.restaurantId));
    const giftRestaurants = await restaurantNames(ctx, [
      ...giftsSent.map((g) => g.restaurantId),
      ...giftsReceived.map((g) => g.restaurantId),
    ]);

    return {
      user,
      bookings: bookings
        .map((b) => ({ ...b, restaurantName: bookingRestaurants.get(b.restaurantId) ?? "Unknown" }))
        .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`)),
      orders: orders
        .map((o) => ({ ...o, restaurantName: orderRestaurants.get(o.restaurantId) ?? "Unknown" }))
        .sort((a, b) => b.createdAt - a.createdAt),
      reviews: reviews
        .map((r) => ({ ...r, restaurantName: reviewRestaurants.get(r.restaurantId) ?? "Unknown" }))
        .sort((a, b) => b.createdAt - a.createdAt),
      assists: assists
        .map((a) => ({
          ...a,
          restaurantName: assistRestaurants.get(a.restaurantId) ?? "Unknown",
          resolveMs: a.resolvedAt ? a.resolvedAt - a.createdAt : null,
        }))
        .sort((a, b) => b.createdAt - a.createdAt),
      menuRequests: menuRequests.sort((a, b) => b.createdAt - a.createdAt),
      giftsSent: giftsSent
        .map((g) => ({ ...g, restaurantName: giftRestaurants.get(g.restaurantId) ?? "Unknown" }))
        .sort((a, b) => b.createdAt - a.createdAt),
      giftsReceived: giftsReceived
        .map((g) => ({ ...g, restaurantName: giftRestaurants.get(g.restaurantId) ?? "Unknown" }))
        .sort((a, b) => b.createdAt - a.createdAt),
      ownedRestaurants: owned.map((r) => ({ _id: r._id, name: r.name })),
    };
  },
});

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export const listReviews = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const reviews = await ctx.db.query("reviews").collect();
    const names = await userNames(ctx, reviews.map((r) => r.userId));
    const rnames = await restaurantNames(ctx, reviews.map((r) => r.restaurantId));
    return reviews
      .map((r) => ({
        ...r,
        authorName: names.get(r.userId) ?? "Diner",
        restaurantName: rnames.get(r.restaurantId) ?? "Unknown",
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});
