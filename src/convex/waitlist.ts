import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, MutationCtx, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { parseOrThrow, waitlistJoinSchema } from "./validation";

/** Payload scheduled to sms.sendWaitlistSms when a waitlist spot frees up. */
export type WaitlistSmsPayload = {
  to: string;
  restaurantName: string;
  city: string;
  date: string;
  time: string;
  partySize: number;
};

/**
 * VIP score (Idea #7): how valuable a waiting diner is to the restaurant.
 * Rewards repeat visits and good reviews, penalizes no-shows. Used to give
 * high-value diners a head start when a table frees up.
 */
async function vipScore(ctx: MutationCtx, userId: Id<"users">): Promise<number> {
  const [bookings, reviews] = await Promise.all([
    ctx.db.query("bookings").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
    ctx.db.query("reviews").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
  ]);
  const completed = bookings.filter((b) => b.status === "completed").length;
  const noShows = bookings.filter((b) => b.status === "no_show").length;
  const goodReviews = reviews.filter((r) => r.rating >= 4).length;
  // repeat diners are gold; a no-show streak eats the score
  return completed * 3 + goodReviews * 2 - noShows * 5;
}

/**
 * Called by bookings.ts right after a cancellation restores seats. Marks the
 * first matching waiting diner as notified and returns the SMS payload for
 * the caller to schedule — returns null when nobody is waiting.
 *
 * Ordering (Idea #7): VIP diners get a head start — when a table frees up
 * the highest-scoring waiting diner is picked first; ties break by who
 * joined earlier (FIFO). Everyone else keeps strict FIFO.
 */
export async function notifyWaitlistForFreedSeats(
  ctx: MutationCtx,
  opts: {
    restaurantId: Id<"restaurants">;
    sectionId?: Id<"sections">;
    date: string;
    time: string;
    partySize: number;
  },
): Promise<WaitlistSmsPayload | null> {
  const entries = await ctx.db
    .query("waitlist")
    .withIndex("by_restaurant_date", (q) => q.eq("restaurantId", opts.restaurantId).eq("date", opts.date))
    .collect();
  const candidates = entries
    .filter(
      (e) =>
        e.status === "waiting" &&
        e.time === opts.time &&
        e.partySize <= opts.partySize &&
        (opts.sectionId == null || e.sectionId == null || e.sectionId === opts.sectionId),
    )
    .sort((a, b) => a.createdAt - b.createdAt);

  // VIP head start: sort by (score desc, joined asc) so repeat diners are
  // alerted before casual waiters for the same freed table.
  const scored = await Promise.all(
    candidates.map(async (c) => ({ c, score: await vipScore(ctx, c.userId) })),
  );
  scored.sort((a, b) => b.score - a.score || a.c.createdAt - b.c.createdAt);
  const winner = scored[0]?.c;
  if (!winner) return null;

  await ctx.db.patch(winner._id, { status: "notified", notifiedAt: Date.now() });
  const restaurant = await ctx.db.get(opts.restaurantId);
  // Idea #4: mirror the freed table into the diner's inbox (fire-and-forget)
  await ctx.scheduler.runAfter(0, internal.dinerNotify.mirrorWaitlistFreed, {
    waitlistId: winner._id,
    restaurantId: opts.restaurantId,
    date: opts.date,
    time: opts.time,
  });
  return {
    to: winner.phone ?? "",
    restaurantName: restaurant?.name ?? "",
    city: restaurant?.city ?? "",
    date: opts.date,
    time: opts.time,
    partySize: winner.partySize,
  };
}

// ---------------------------------------------------------------------------
// diner flow
// ---------------------------------------------------------------------------

/** Join the waitlist for a sold-out time. Idempotent per (user, slot). */
export const join = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    sectionId: v.optional(v.id("sections")),
    date: v.string(), // YYYY-MM-DD
    time: v.string(), // HH:mm
    partySize: v.number(),
    name: v.string(),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Please sign in to join the waitlist.");
    // Zod: real calendar date, HH:mm time, party size 1–20, non-empty name.
    parseOrThrow(waitlistJoinSchema, args);

    // KB-19: no waitlist entries for past dates.
    const serverToday = (() => {
      const n = new Date();
      return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
    })();
    if (args.date < serverToday) throw new Error("You can't join a waitlist for a past date.");

    const name = args.name.trim().slice(0, 80);
    const restaurant = await ctx.db.get(args.restaurantId);
    if (!restaurant) throw new Error("Restaurant not found.");
    // M-1: every other entry point refuses suspended venues — so does the waitlist.
    if (restaurant.disabled) throw new Error("This restaurant is currently unavailable.");

    // If a slot at this time still has room, point the diner at booking instead.
    const slots = await ctx.db
      .query("slots")
      .withIndex("by_restaurant_date", (q) => q.eq("restaurantId", args.restaurantId).eq("date", args.date))
      .collect();
    const hasRoom = slots.some(
      (s) => s.time === args.time && !s.closed && (!args.sectionId || s.sectionId === args.sectionId) && s.remaining >= args.partySize,
    );
    if (hasRoom) {
      throw new Error("Tables are still available at this time — book directly instead.");
    }

    // Idempotent per (user, slot): reuse an active entry (waiting/notified).
    // KB-05: a previously-cancelled entry is NOT a duplicate — it's revived
    // so the diner is genuinely back on the list (before, join returned the
    // stale cancelled row and the UI showed success while nothing happened).
    const mine = await ctx.db.query("waitlist").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    const dup = mine.find(
      (e) =>
        e.restaurantId === args.restaurantId &&
        e.date === args.date &&
        e.time === args.time &&
        (e.sectionId ?? null) === (args.sectionId ?? null),
    );
    if (dup) {
      if (dup.status === "cancelled") {
        await ctx.db.patch(dup._id, {
          status: "waiting",
          createdAt: Date.now(),
          partySize: args.partySize,
          name,
          phone: args.phone?.trim().slice(0, 20) || undefined,
        });
        return await ctx.db.get(dup._id);
      }
      return dup;
    }

    let sectionName: string | undefined;
    if (args.sectionId) {
      const section = await ctx.db.get(args.sectionId);
      sectionName = section?.name;
    }

    return await ctx.db.insert("waitlist", {
      restaurantId: args.restaurantId,
      sectionId: args.sectionId,
      sectionName,
      date: args.date,
      time: args.time,
      partySize: args.partySize,
      userId,
      name,
      phone: args.phone?.trim().slice(0, 20) || undefined,
      status: "waiting",
      createdAt: Date.now(),
    });
  },
});

/** All of the current user's waitlist entries with restaurant info. */
export const myWaitlist = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const entries = await ctx.db.query("waitlist").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    const restaurants = await Promise.all(entries.map((e) => ctx.db.get(e.restaurantId)));
    return entries
      .map((e, i) => ({
        ...e,
        restaurant: restaurants[i]
          ? { _id: restaurants[i]!._id, name: restaurants[i]!.name, imageUrl: restaurants[i]!.imageUrl, city: restaurants[i]!.city }
          : null,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Diner (or restaurant owner) removes a waitlist entry. */
export const cancel = mutation({
  args: { waitlistId: v.id("waitlist") },
  handler: async (ctx, { waitlistId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const entry = await ctx.db.get(waitlistId);
    if (!entry) throw new Error("Waitlist entry not found.");
    const restaurant = await ctx.db.get(entry.restaurantId);
    const isOwner = !!restaurant && restaurant.ownerId === userId;
    if (entry.userId !== userId && !isOwner) throw new Error("You cannot remove this entry.");
    if (entry.status === "cancelled") return entry;
    await ctx.db.patch(waitlistId, { status: "cancelled" });
    return await ctx.db.get(waitlistId);
  },
});

// ---------------------------------------------------------------------------
// owner view
// ---------------------------------------------------------------------------

/** Waiting + notified entries for one restaurant (optionally filtered by date). */
export const byRestaurant = query({
  args: { restaurantId: v.id("restaurants"), date: v.optional(v.string()) },
  handler: async (ctx, { restaurantId, date }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const restaurant = await ctx.db.get(restaurantId);
    if (!restaurant || restaurant.ownerId !== userId) return [];
    let entries;
    if (date) {
      entries = await ctx.db
        .query("waitlist")
        .withIndex("by_restaurant_date", (q) => q.eq("restaurantId", restaurantId).eq("date", date))
        .collect();
    } else {
      entries = await ctx.db
        .query("waitlist")
        .withIndex("by_restaurant_date", (q) => q.eq("restaurantId", restaurantId))
        .collect();
    }
    return entries
      .filter((e) => e.status !== "cancelled")
      .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`) || a.createdAt - b.createdAt);
  },
});
