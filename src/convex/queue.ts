import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { attemptBooking, type BookingArgs } from "./bookings";
import { bookingArgsSchema, parseOrThrow } from "./validation";

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

/** M-4: cap on a single user's simultaneously queued requests (flood guard). */
const MAX_ACTIVE_QUEUED_PER_USER = 10;

/** Join the booking queue for a slot. Returns the queue entry + line position. */
export const enqueue = mutation({
  args: QUEUE_ARGS,
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Please sign in to book a table.");

    // Zod: real calendar date, HH:mm time, party size 1–20, non-empty name —
    // junk never enters the queue.
    parseOrThrow(bookingArgsSchema, args);

    // KB-19: reject past dates up front so the diner gets immediate feedback
    // instead of joining the queue and failing when the drain runs.
    const serverToday = (() => {
      const n = new Date();
      return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
    })();
    if (args.date < serverToday) throw new Error("You can't book a table in the past.");

    const name = args.name.trim().slice(0, 80);
    const restaurant = await ctx.db.get(args.restaurantId);
    if (!restaurant) throw new Error("Restaurant not found.");
    // Disabled restaurants refuse new bookings (moderation hold).
    if (restaurant.disabled) throw new Error("This restaurant is currently unavailable.");

    const fireProcessor = () =>
      ctx.scheduler.runAfter(0, internal.queue.processSlot, {
        restaurantId: args.restaurantId,
        date: args.date,
        time: args.time,
      });

    // M-4: idempotent per (user, restaurantId, date, time) — party size is NOT
    // part of the key. Re-requesting the same slot with a different size
    // patches the existing entry instead of double-queuing (processSlot would
    // otherwise book both entries).
    const mine = await ctx.db.query("bookingQueue").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    const dup = mine.find(
      (e) =>
        e.status === "queued" &&
        e.restaurantId === args.restaurantId &&
        e.date === args.date &&
        e.time === args.time,
    );
    if (dup) {
      await ctx.db.patch(dup._id, {
        partySize: args.partySize,
        seat: args.seat,
        nonSmoking: args.nonSmoking,
        name,
        email: args.email?.trim().slice(0, 120) || undefined,
        phone: args.phone?.trim().slice(0, 20) || undefined,
        notes: args.notes?.trim().slice(0, 300) || undefined,
        occasion: args.occasion?.trim().slice(0, 40) || undefined,
      });
      await fireProcessor();
      const sameSlot = await ctx.db
        .query("bookingQueue")
        .withIndex("by_slot", (q) => q.eq("restaurantId", args.restaurantId).eq("date", args.date).eq("time", args.time))
        .collect();
      const position = sameSlot.filter((e) => e.status === "queued" && e.createdAt <= dup.createdAt).length;
      return { entry: await ctx.db.get(dup._id), position };
    }

    // M-4: flood guard — bound how many requests one user may keep queued.
    if (mine.filter((e) => e.status === "queued").length >= MAX_ACTIVE_QUEUED_PER_USER) {
      throw new Error("Too many pending booking requests — wait for one to finish first.");
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
/** L-8: bounded drain batch — process at most this many queued entries per
 * invocation and reschedule for the rest, so a burst can never blow the
 * transaction read/write limits. */
const DRAIN_BATCH = 25;
/** Terminal entries (booked/failed) are archived once older than this. */
const TERMINAL_RETENTION_MS = 48 * 60 * 60 * 1000;

export const processSlot = internalMutation({
  args: { restaurantId: v.id("restaurants"), date: v.string(), time: v.string() },
  handler: async (ctx, { restaurantId, date, time }) => {
    const entries = await ctx.db
      .query("bookingQueue")
      .withIndex("by_slot", (q) => q.eq("restaurantId", restaurantId).eq("date", date).eq("time", time))
      .collect();

    // L-8: archive old terminal rows so repeated scans stay small.
    const staleCutoff = Date.now() - TERMINAL_RETENTION_MS;
    await Promise.all(
      entries
        .filter((e) => e.status !== "queued" && (e.processedAt ?? 0) < staleCutoff)
        .map((e) => ctx.db.delete(e._id)),
    );

    const queued = entries.filter((e) => e.status === "queued").sort((a, b) => a.createdAt - b.createdAt);
    const batch = queued.slice(0, DRAIN_BATCH);

    for (const entry of batch) {
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

    // L-8: keep draining without holding one giant transaction open.
    if (queued.length > batch.length) {
      await ctx.scheduler.runAfter(1_000, internal.queue.processSlot, { restaurantId, date, time });
    }
    return { processed: batch.length, remaining: Math.max(0, queued.length - batch.length) };
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
