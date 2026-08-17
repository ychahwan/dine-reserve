import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { safeGet } from "./helpers";
import { parseOrThrow, reviewArgsSchema } from "./validation";

/**
 * Verified diner reviews.
 *
 * A review is only possible after a real visit: the diner must own the
 * booking and the owner must have marked it `completed` (past visits shown in
 * My Bookings). One review per booking, so the ratings can't be gamed by
 * re-reviewing the same visit.
 */

/** Create a review for one of the diner's completed bookings. */
export const create = mutation({
  args: {
    bookingId: v.id("bookings"),
    rating: v.number(),
    text: v.optional(v.string()),
  },
  handler: async (ctx, { bookingId, rating, text }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    // Zod: integer rating 1–5, text ≤1000 chars.
    parseOrThrow(reviewArgsSchema, { rating, text });

    const booking = await ctx.db.get(bookingId);
    if (!booking) throw new Error("Booking not found.");

    if (booking.userId !== userId) {
      throw new Error("You can only review your own visits.");
    }
    if (booking.status !== "completed") {
      throw new Error("You can only review after your visit.");
    }

    const existing = await ctx.db
      .query("reviews")
      .withIndex("by_booking", (q) => q.eq("bookingId", bookingId))
      .first();
    if (existing) {
      throw new Error("You already reviewed this visit.");
    }

    const cleanText = text?.trim().slice(0, 1000) || undefined;
    const reviewId = await ctx.db.insert("reviews", {
      restaurantId: booking.restaurantId,
      userId,
      bookingId,
      rating,
      text: cleanText,
      createdAt: Date.now(),
    });
    return await ctx.db.get(reviewId);
  },
});

/** Reviews + aggregate rating for a restaurant's detail page. */
export const listForRestaurant = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, { restaurantId }) => {
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect();
    // safeGet: tolerate review rows whose author is a bare auth subject
    // (legacy/test identities) — never crash the restaurant detail page.
    const users = await Promise.all(reviews.map((r) => safeGet<Doc<"users">>(ctx, r.userId)));
    const sorted = reviews
      .map((r, i) => ({
        _id: r._id,
        rating: r.rating,
        text: r.text,
        createdAt: r.createdAt,
        author: users[i]?.name ?? "Diner",
      }))
      .sort((a, b) => b.createdAt - a.createdAt);

    const count = sorted.length;
    const avg =
      count > 0
        ? Math.round((sorted.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10
        : 0;

    return { count, avg, reviews: sorted };
  },
});

/**
 * The diner's completed, not-yet-reviewed bookings (with restaurant info),
 * so My Bookings can show the "Rate visit" action.
 */
export const myReviewable = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];

    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const reviewed = await ctx.db
      .query("reviews")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const reviewedBookingIds = new Set(reviewed.map((r) => r.bookingId));

    const candidates = bookings.filter(
      (b) => b.status === "completed" && !reviewedBookingIds.has(b._id),
    );
    const restaurants = await Promise.all(candidates.map((b) => ctx.db.get(b.restaurantId)));

    return candidates
      .map((b, i) => ({
        ...b,
        restaurant: restaurants[i]
          ? {
              _id: restaurants[i]!._id,
              name: restaurants[i]!.name,
              imageUrl: restaurants[i]!.imageUrl,
              cuisine: restaurants[i]!.cuisine,
              city: restaurants[i]!.city,
            }
          : null,
      }))
      .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  },
});
