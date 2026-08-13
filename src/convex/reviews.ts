import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Verified reviews. A diner can only review a restaurant they actually dined
 * at: the mutation requires a booking whose status is "completed" (or a
 * confirmed booking on a past date), and allows one review per booking.
 */

function canReview(booking: {
  status: string;
  date: string;
}): boolean {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const todayKey = `${y}-${m}-${d}`;
  if (booking.status === "completed") return true;
  return booking.status === "confirmed" && booking.date < todayKey;
}

export const create = mutation({
  args: {
    bookingId: v.id("bookings"),
    rating: v.number(),
    text: v.optional(v.string()),
  },
  handler: async (ctx, { bookingId, rating, text }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new Error("Rating must be between 1 and 5 stars.");
    }
    const cleanText = text?.trim().slice(0, 500) || undefined;

    const booking = await ctx.db.get(bookingId);
    if (!booking) throw new Error("Booking not found.");
    if (booking.userId !== userId) {
      throw new Error("You can only review your own visits.");
    }
    if (!canReview(booking)) {
      throw new Error("You can review a restaurant after your visit.");
    }

    // one review per booking
    const existing = await ctx.db
      .query("reviews")
      .withIndex("by_booking", (q) => q.eq("bookingId", bookingId))
      .first();
    if (existing) throw new Error("You already reviewed this visit.");

    const id = await ctx.db.insert("reviews", {
      restaurantId: booking.restaurantId,
      userId,
      bookingId,
      rating,
      text: cleanText,
      createdAt: Date.now(),
    });
    return await ctx.db.get(id);
  },
});

/** Diners can delete their own review. */
export const remove = mutation({
  args: { id: v.id("reviews") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const review = await ctx.db.get(id);
    if (!review) throw new Error("Review not found.");
    if (review.userId !== userId) throw new Error("You can only delete your own reviews.");
    await ctx.db.delete(id);
    return { deleted: true };
  },
});

/** Public: reviews + aggregate rating for a restaurant page. */
export const listForRestaurant = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, { restaurantId }) => {
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .order("desc")
      .take(50);

    const authors = await Promise.all(
      reviews.map((r) => ctx.db.get(r.userId)),
    );
    const withAuthor = reviews.map((r, i) => ({
      ...r,
      author: authors[i]?.name ?? "Verified diner",
    }));

    const count = reviews.length;
    const avg =
      count > 0
        ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / count) * 10) / 10
        : 0;
    return { reviews: withAuthor, avg, count };
  },
});

/** The diner's bookings that are reviewable but not yet reviewed. */
export const myReviewable = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const reviewedBookingIds = new Set(reviews.map((r) => r.bookingId));

    const out = [];
    for (const b of bookings) {
      if (!canReview(b)) continue;
      if (b.bookingId && reviewedBookingIds.has(b.bookingId as Id<"bookings">)) continue;
      const restaurant = await ctx.db.get(b.restaurantId);
      if (!restaurant) continue;
      out.push({
        ...b,
        restaurant: {
          _id: restaurant._id,
          name: restaurant.name,
          imageUrl: restaurant.imageUrl,
          city: restaurant.city,
        },
      });
    }
    // newest visits first
    return out.sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`));
  },
});
