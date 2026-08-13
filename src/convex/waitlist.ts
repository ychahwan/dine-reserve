import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, MutationCtx, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

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
 * Called by bookings.ts right after a cancellation restores seats. Marks the
 * first matching waiting diner as notified (FIFO) and returns the SMS payload
 * for the caller to schedule — returns null when nobody is waiting.
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
  const winner = candidates[0];
  if (!winner) return null;

  await ctx.db.patch(winner._id, { status: "notified", notifiedAt: Date.now() });
  const restaurant = await ctx.db.get(opts.restaurantId);
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error("Invalid date.");
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(args.time)) throw new Error("Invalid time.");
    if (!Number.isInteger(args.partySize) || args.partySize < 1 || args.partySize > 20) {
      throw new Error("Party size must be between 1 and 20.");
    }
    const name = args.name.trim().slice(0, 80);
    if (!name) throw new Error("Please enter your name.");

    const restaurant = await ctx.db.get(args.restaurantId);
    if (!restaurant) throw new Error("Restaurant not found.");

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

    // Idempotent: reuse an existing entry for the same slot.
    const mine = await ctx.db.query("waitlist").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    const dup = mine.find(
      (e) =>
        e.restaurantId === args.restaurantId &&
        e.date === args.date &&
        e.time === args.time &&
        (e.sectionId ?? null) === (args.sectionId ?? null),
    );
    if (dup) return dup;

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
    const restaurant = 

[FILE_TOO_LARGE]: The combined read_files output exceeded the 100,000 character hard limit. This file was truncated after 6,632 characters. Read it separately or use code_search for the relevant section.