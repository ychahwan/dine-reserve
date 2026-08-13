import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { attemptBooking, type BookingArgs } from "./bookings";

/**
 * Kamix booking queue.
 *
 * Every booking request goes through `enqueue`, which inserts a `bookingQueue`
 * document and schedules `internal.queue.processSlot`. That scheduled mutation
 * drains queued requests FIFO (oldest first) for one (restaurant, date, time)
 * and delegates each to `bookings.attemptBooking` — a single serializable
 * read-check-write on the slot ledger. Convex serializes writes to the same
 * documents, so even hundreds of simultaneous requests are processed in a
 * strict order and the 101st diner is cleanly rejected (or waitlisted) instead
 * of overbooking the restaurant.
 */

const QUEUE_ARGS = {
  restaurantId: v.id("restaurants"),
  date: v.string(), // YYYY-MM-DD
  time: v.string(), // HH:mm
  partySize: v.number(),
  name: v.string(),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  seat: v.optional(v.union(v.literal("inside"), v.literal("outside"), v.literal("bar"))),
  nonSmoking: v.optional(v.boolean()),
  notes: v.optional(v.string()),
  occasion: v.optional(v.string()),
};

/** Join the booking queue for a slot. Returns the queue entry + line position. */
export const enqueue = mutation({
  args: QUEUE_ARGS,
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Please sign in to book a table.");

    // Cheap validation up front so junk never enters the queue.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error("Invalid date.");
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(args.time)) throw new Error("Invalid time.");
    if (!Number.isInteger(args.partySize) || args.partySize < 1 || args.partySize > 20) {
      throw new Error("Party size must be between 1 and 20.");
    }
    const name = args.name.trim().slice(0, 80);
    if (!name) throw new Error("Please enter your name.");
    const restaurant = await ctx.db.get(args.restaurantId);
    if (!restaurant) throw new Error("Restaurant not found.");

    const fireProcessor = () =>
      ctx.scheduler.runAfter(0, internal.queue.processSlot, {
        restaurantId: args.restaurantId,
        date: args.date,
        time: args.time,
      });

    // Idempotent: an already-queued request for the same slot is reused, not duplicated.
    const mine = await ctx.db.query("bookingQueue").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    const dup = mine.find(
      (e) =>
        e.status === "queued" &&
        e.restaurantId === args.restaurantId &&
        e.date === args.date &&
        e.time === args.time &&
        e.partySize === args.partySize,
    );
    if (dup) {
      await fireProcessor();
      const sameSlot = await ctx.db
        .query("bookingQueue")
        .withIndex("by_slot", (q) => q.eq("restaurantId", args.restaurantId).eq("date", args.date).eq("time", args.time))
        .collect();
      const position = sameSlot.filter((e) => e.status === "queued" && e.createdAt <= dup.createdAt).length;
      return { entry: dup, position };
    }

    const createdAt = Date.now();
    const entryId = await ctx.db.insert("bookingQueue", {
      restaurantId: args.restaurantId,
      userId,
      date: args.date,
      time: args.time,
      partySize: args.partySize,
      seat: args.seat,
      nonSmoking: args.nonSmoking,
      name,
      email: args.email?.trim().slice(0, 120) || undefined,
      phone: args.phone?.trim().slice(0, 20) || undefined,
      notes: args.notes?.trim().slice(0, 300) || undefined,
      occasion: args.occasion?.trim().slice(0, 40) || undefined,
      status: "queued",
      createdAt,
    });

    // Scheduled drain runs after this mutation commits, so the position below
    // is stable and reflects everyone already in line ahead of this request.
    await fireProcessor();
    const sameSlot = await ctx.db
      .query("bookingQueue")
      .withIndex("by_slot", (q) => q.eq("restaurantId", args.restaurantId).eq("date", args.date).eq("time", args.time))
      .collect();
    const position = sameSlot.filter((e) => e.status === "queued" && e.createdAt <= createdAt).length;

    return { entry: await ctx.db.get(entryId), position };
  },
});

/**
 * Drain one (restaurant, date, time) queue FIFO. Called via the scheduler from
 * every enqueue — the first invocation books everyone queued so far and later
 * invocations are no-ops, so it is safe under heavy concurrent load.
 */
export const processSlot = internalMutation({
  args: { restaurantId: v.id("restaurants"), date: v.string(), time: v.string() },
  handler: async (ctx, { restaurantId, date, time }) => {
    const entries = await ctx.db
      .query("bookingQueue")
      .withIndex("by_slot", (q) => q.eq("restaurantId", restaurantId).eq("date", date).eq("time", time))
      .collect();
    const queued = entries.filter((e) => e.status === "queued").sort((a, b) => a.createdAt - b.createdAt);

    for (const entry of queued) {
      const bookingArgs: BookingArgs = {
        restaurantId,
        date,
        time,
        partySize: entry.partySize,
        name: entry.name,
        email: entry.email,
        phone: entry.phone,
        seat: entry.seat,
        nonSmoking: entry.nonSmoking,
        notes: entry.notes,
        occasion: entry.occasion,
      };
      try {
        const booking = await attemptBooking(ctx, entry.userId, bookingArgs);
        if (!booking) throw new Error("Booking failed.");
        await ctx.db.patch(entry._id, {
          status: "booked",
          bookingId: booking._id,
          code: booking.code,
          bookedTime: booking.time,
          sectionName: booking.sectionName ?? undefined,
          processedAt: Date.now(),
        });
      } catch (err) {
        // A failed attempt must never block the rest of the line.
        await ctx.db.patch(entry._id, {
          status: "failed",
          error: err instanceof Error ? err.message.slice(0, 200) : "Booking failed.",
          processedAt: Date.now(),
        });
      }
    }
    return { processed: queued.length };
  },
});

/** The current user's recent queue entries (with restaurant info) — drives the
 *  live "confirming your table" state on the booking screen. */
export const myEntries = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const entries = await ctx.db.query("bookingQueue").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
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
