import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { internalMutation, mutation, query, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { SEAT_KIND } from "./schema";
import { notifyRestaurant } from "./notifications";
import { notifyWaitlistForFreedSeats } from "./waitlist";
import { awardPoints, POINTS } from "./loyalty";
import { bookingArgsSchema, bookingCodeSchema, cancelReasonSchema, guestNameSchema, parseOrThrow } from "./validation";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function generateCode(len = 6): string {
  let out = "";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

type SlotLike = { _id: Id<"slots">; sectionId: Id<"sections">; time: string; total: number; remaining: number; closed: boolean };

async function findBestSlot(slots: SlotLike[], sectionId: string, time: string): Promise<SlotLike | null> {
  const matches = slots.filter((s) => s.sectionId === sectionId && s.time === time && !s.closed);
  if (matches.length === 0) return null;
  // duplicates are benign: treat the doc with most remaining as canonical
  return matches.reduce((a, b) => (a.remaining >= b.remaining ? a : b));
}

async function isRestaurantOwner(ctx: MutationCtx, userId: string, restaurantId: Id<"restaurants">) {
  const restaurant = await ctx.db.get(restaurantId);
  return !!restaurant && restaurant.ownerId === userId;
}

// ---------------------------------------------------------------------------
// shared booking logic (atomic — safe under 100+ concurrent requests)
// ---------------------------------------------------------------------------

export type BookingArgs = {
  restaurantId: Id<"restaurants">;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  partySize: number;
  name: string;
  email?: string;
  phone?: string;
  seat?: "inside" | "outside" | "bar"; // preferred seating area
  nonSmoking?: boolean;
  notes?: string;
  occasion?: string; // birthday, anniversary, proposal, business…
};

/**
 * Validate and atomically book a table, throwing on failure. Reads the slot
 * ledger and decrements seats inside one serializable mutation, so concurrent
 * requests (including FIFO queue processing) can never overbook.
 */
export async function attemptBooking(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: BookingArgs,
) {
  // Zod: real calendar date, HH:mm time, party size 1–20, non-empty name.
  parseOrThrow(bookingArgsSchema, args);

  // KB-19: reject past dates server-side. The date is the diner's local date
  // and the server clock is UTC, so allow today and guard only clear pasts
  // (a past date would otherwise book silently if stale slots exist).
  const serverToday = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  })();
  if (args.date < serverToday) throw new Error("You can't book a table in the past.");

  const name = args.name.trim().slice(0, 80);
  const restaurant = await ctx.db.get(args.restaurantId);
  if (!restaurant) throw new Error("Restaurant not found.");
  // KB-03: the disabled-venue guard lives with the booking primitive, not
  // just at the queue entry point — a restaurant disabled by an admin after
  // requests were queued can never be booked when the FIFO drain runs.
  if (restaurant.disabled) throw new Error("This restaurant is currently unavailable.");

  const sections = await ctx.db
    .query("sections")
    .withIndex("by_restaurant", (q) => q.eq("restaurantId", args.restaurantId))
    .collect();
  if (sections.length === 0) throw new Error("This restaurant has no seating configured yet.");

  const candidates = sections.filter(
    (s) => (!args.seat || s.kind === args.seat) && (!args.nonSmoking || !s.smoking),
  );
  if (candidates.length === 0) throw new Error("No seating matches your preferences at this restaurant.");

  // Read the slot ledger for this date — serialized by Convex, so the
  // check + decrement below is atomic and cannot overbook.
  const slots = await ctx.db
    .query("slots")
    .withIndex("by_restaurant_date", (q) => q.eq("restaurantId", args.restaurantId).eq("date", args.date))
    .collect();

  // 1) exact-time match
  for (const section of candidates) {
    const slot = await findBestSlot(slots, section._id, args.time);
    if (slot && slot.remaining >= args.partySize) {
      return await commitBooking(ctx, {
        userId, restaurantId: args.restaurantId, section, slot, args,
        restaurantName: restaurant.name, city: restaurant.city,
      });
    }
  }

  // 2) nearest available slot later in the day (helpful UX). KB-18: bounded
  // to +2h so a diner asking for 19:00 is never silently booked at 21:30 —
  // if nothing is available in a reasonable window, fail loudly and let the
  // diner pick another time themselves.
  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const requestedMin = toMinutes(args.time);
  const laterTimes = [...new Set(slots.map((s) => s.time))]
    .filter((t) => t > args.time && toMinutes(t) - requestedMin <= 120)
    .sort();
  for (const time of laterTimes) {
    for (const section of candidates) {
      const slot = await findBestSlot(slots, section._id, time);
      if (slot && slot.remaining >= args.partySize) {
        return await commitBooking(ctx, {
          userId, restaurantId: args.restaurantId, section, slot, args, shiftedTime: time,
          restaurantName: restaurant.name, city: restaurant.city,
        });
      }
    }
  }

  throw new Error("No tables left at this time. Try a different time or party size.");
}

const BOOKING_ARGS_VALIDATOR = {
  restaurantId: v.id("restaurants"),
  date: v.string(), // YYYY-MM-DD
  time: v.string(), // HH:mm
  partySize: v.number(),
  name: v.string(),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  seat: v.optional(SEAT_KIND), // preferred seating area
  nonSmoking: v.optional(v.boolean()),
  notes: v.optional(v.string()),
  occasion: v.optional(v.string()), // birthday, anniversary, proposal, business…
};

/** Direct (non-queued) booking path — delegates to the shared atomic logic.
 * Internal only: diners must go through `queue.enqueue` so the FIFO queue is
 * the single public booking entry point (see ARCH-01). */
export const createBooking = internalMutation({
  args: BOOKING_ARGS_VALIDATOR,
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Please sign in to book a table.");
    return attemptBooking(ctx, userId, args);
  },
});

async function commitBooking(
  ctx: MutationCtx,
  opts: {
    userId: Id<"users">;
    restaurantId: Id<"restaurants">;
    section: { _id: Id<"sections">; name: string; kind: "inside" | "outside" | "bar"; smoking: boolean };
    slot: SlotLike;
    args: { partySize: number; name: string; email?: string; phone?: string; notes?: string; occasion?: string; time: string; date: string };
    restaurantName: string;
    city: string;
    shiftedTime?: string;
  },
) {
  // KB-17: retry until the 6-char code is actually unique (by_code index is
  // the invite-link lookup), so a (rare) collision can never make an invite
  // ambiguous or leak the wrong booking to a guest.
  let code = generateCode();
  while (true) {
    const clash = await ctx.db.query("bookings").withIndex("by_code", (q) => q.eq("code", code)).first();
    if (!clash) break;
    code = generateCode();
  }
  const now = Date.now();
  const bookingId = await ctx.db.insert("bookings", {
    restaurantId: opts.restaurantId,
    userId: opts.userId,
    name: opts.args.name,
    email: opts.args.email?.trim().slice(0, 120) || undefined,
    phone: opts.args.phone?.trim().slice(0, 20) || undefined,
    date: opts.args.date,
    time: opts.shiftedTime ?? opts.args.time,
    partySize: opts.args.partySize,
    sectionId: opts.section._id,
    sectionName: opts.section.name,
    kind: opts.section.kind,
    smoking: opts.section.smoking,
    status: "confirmed",
    code,
    notes: opts.args.notes?.trim().slice(0, 300) || undefined,
    occasion: opts.args.occasion?.trim().slice(0, 40) || undefined,
    createdAt: now,
    updatedAt: now,
  });
  // atomic seat decrement — the entire mutation is serializable
  await ctx.db.patch(opts.slot._id, { remaining: opts.slot.remaining - opts.args.partySize });
  // owner dashboard event
  await notifyRestaurant(ctx, {
    restaurantId: opts.restaurantId,
    bookingId,
    userId: opts.userId,
    type: "booking_created",
  });
  // async SMS — never blocks or breaks the booking (only when phone is present)
  if (opts.args.phone?.trim()) {
    await ctx.scheduler.runAfter(0, api.sms.sendBookingSms, {
      to: opts.args.phone.trim(),
      event: "confirmed",
      restaurantName: opts.restaurantName,
      city: opts.city,
      date: opts.args.date,
      time: opts.shiftedTime ?? opts.args.time,
      partySize: opts.args.partySize,
      code,
    });
  }
  return await ctx.db.get(bookingId);
}

// ---------------------------------------------------------------------------
// queries
// ---------------------------------------------------------------------------

/**
 * Public invite lookup: find a confirmed booking by its 6-char code.
 * Returns a minimized, display-safe DTO — never the full booking record — so
 * an invite link can't leak the owner's email/phone/notes or guest user ids.
 */
export const byCode = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const parsed = bookingCodeSchema.safeParse(code);
    if (!parsed.success) return null;
    const clean = parsed.data.toUpperCase();
    // indexed lookup — O(log n) instead of scanning every booking
    const hits = await ctx.db.query("bookings").withIndex("by_code", (q) => q.eq("code", clean)).collect();
    const booking = hits.find((b) => b.status === "confirmed");
    if (!booking) return null;
    const restaurant = await ctx.db.get(booking.restaurantId);

    // Whether the caller is already on the list (host or a confirmed guest).
    // The invite link is public, but the caller may be signed in.
    const userId = await getAuthUserId(ctx);
    const guests = booking.guests ?? [];
    const alreadyConfirmed =
      userId !== null &&
      (booking.userId === userId || guests.some((g) => g.userId === userId));

    // PII guard (A-4): full guest names are only revealed to the host or a
    // confirmed guest. Anonymous invite-link visitors just see how many
    // people are already going — enough to decide whether to join.
    const guestsPublic = alreadyConfirmed
      ? guests.map((g) => ({ name: g.name }))
      : guests.map(() => ({ name: "" }));

    return {
      booking: {
        _id: booking._id,
        name: booking.name,
        date: booking.date,
        time: booking.time,
        partySize: booking.partySize,
        sectionName: booking.sectionName,
        guests: guestsPublic,
      },
      restaurant: restaurant
        ? { _id: restaurant._id, name: restaurant.name, address: restaurant.address, city: restaurant.city, imageUrl: restaurant.imageUrl }
        : null,
      alreadyConfirmed,
    };
  },
});

export const myBookings = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    // PERF-FIX: Added pagination limit (default 30, max 100)
    const effectiveLimit = Math.min(Math.max(limit ?? 30, 1), 100);
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(effectiveLimit);
    const restaurants = await Promise.all(
      bookings.map((b) => ctx.db.get(b.restaurantId)),
    );
    return bookings
      .map((b, i) => ({
        ...b,
        restaurant: restaurants[i]
          ? {
              _id: restaurants[i]!._id,
              name: restaurants[i]!.name,
              imageUrl: restaurants[i]!.imageUrl,
              cuisine: restaurants[i]!.cuisine,
              city: restaurants[i]!.city,
              cancellationPolicyHours: restaurants[i]!.cancellationPolicyHours ?? 0,
            }
          : null,
      }))
      .sort((a, b) => {
        const ka = `${a.date}T${a.time}`;
        const kb = `${b.date}T${b.time}`;
        return ka.localeCompare(kb);
      });
  },
});

/** Owner view: bookings for one restaurant (optionally filtered by date). */
export const byRestaurant = query({
  args: { restaurantId: v.id("restaurants"), date: v.optional(v.string()) },
  handler: async (ctx, { restaurantId, date }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const restaurant = await ctx.db.get(restaurantId);
    if (!restaurant || restaurant.ownerId !== userId) return [];
    let bookings;
    if (date) {
      bookings = await ctx.db
        .query("bookings")
        .withIndex("by_restaurant_date", (q) => q.eq("restaurantId", restaurantId).eq("date", date))
        .collect();
    } else {
      bookings = await ctx.db.query("bookings").withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId)).collect();
    }
    return bookings
      .filter((b) => b.status !== "cancelled")
      .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  },
});

/**
 * Owner analytics: aggregates over the last `days` (default 30) used by the
 * Insights tab — covers, completion/no-show/cancellation rates, bookings per
 * day, busiest times, and waitlist conversion.
 */
export const stats = query({
  args: { restaurantId: v.id("restaurants"), days: v.optional(v.number()) },
  handler: async (ctx, { restaurantId, days }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const restaurant = await ctx.db.get(restaurantId);
    if (!restaurant || restaurant.ownerId !== userId) {
      throw new Error("Only the restaurant owner can view insights.");
    }

    const lookback = Math.min(Math.max(days ?? 30, 7), 90);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - lookback);
    const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;

    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect();
    const inWindow = bookings.filter((b) => b.date >= cutoffKey);

    let covers = 0;
    let completed = 0;
    let noShow = 0;
    let cancelled = 0;
    const byDay = new Map<string, number>();
    const byHour = new Map<string, number>();
    for (const b of inWindow) {
      if (b.status === "cancelled") { cancelled++; continue; }
      covers += b.partySize;
      byDay.set(b.date, (byDay.get(b.date) ?? 0) + b.partySize);
      const hour = b.time.slice(0, 2) + ":00";
      byHour.set(hour, (byHour.get(hour) ?? 0) + b.partySize);
      if (b.status === "completed") completed++;
      if (b.status === "no_show") noShow++;
    }

    const totalFinished = completed + noShow;
    const waitlist = await ctx.db
      .query("waitlist")
      .withIndex("by_restaurant_date", (q) => q.eq("restaurantId", restaurantId))
      .collect();
    const waiting = waitlist.filter((w) => w.status === "waiting").length;
    const notified = waitlist.filter((w) => w.status === "notified").length;

    const last14: { date: string; covers: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      last14.push({ date: key, covers: byDay.get(key) ?? 0 });
    }

    return {
      rangeDays: lookback,
      totalBookings: inWindow.length,
      covers,
      completed,
      noShow,
      cancelled,
      noShowRate: totalFinished > 0 ? Math.round((noShow / totalFinished) * 100) : 0,
      cancellationRate: inWindow.length > 0 ? Math.round((cancelled / inWindow.length) * 100) : 0,
      avgParty: inWindow.length > 0 ? Math.round((covers / inWindow.length) * 10) / 10 : 0,
      byDay: last14,
      topTimes: [...byHour.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([time, coversCount]) => ({ time, covers: coversCount })),
      waitlist: { waiting, notified, total: waiting + notified },
    };
  },
});

// ---------------------------------------------------------------------------
// status changes
// ---------------------------------------------------------------------------

export const cancelBooking = mutation({
  args: { bookingId: v.id("bookings"), reason: v.optional(v.string()) },
  handler: async (ctx, { bookingId, reason }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    parseOrThrow(cancelReasonSchema, reason);
    const booking = await ctx.db.get(bookingId);
    if (!booking) throw new Error("Booking not found.");
    const owner = await isRestaurantOwner(ctx, userId, booking.restaurantId);
    if (booking.userId !== userId && !owner) throw new Error("You cannot cancel this booking.");
    if (booking.status === "cancelled") return booking;

    if (booking.sectionId) {
      const slot = await findBestSlotFromDb(ctx, booking);
      if (slot) {
        // restore seats with a ceiling at total capacity
        await ctx.db.patch(slot._id, { remaining: Math.min(slot.total, slot.remaining + booking.partySize) });
      } else {
        // KB-16: the slot ledger entry is missing (deleted / pruned) — the
        // seats can't be restored. Log it so it can be reconciled instead of
        // silently leaking seats.
        console.warn(`[KB-16] cancelBooking: no slot found to restore seats for booking ${bookingId}`);
      }
    }
    await ctx.db.patch(bookingId, { status: "cancelled", updatedAt: Date.now() });
    // owner dashboard event
    await notifyRestaurant(ctx, {
      restaurantId: booking.restaurantId,
      bookingId,
      userId: booking.userId,
      type: "booking_cancelled",
    });
    const restaurant = await ctx.db.get(booking.restaurantId);
    await ctx.scheduler.runAfter(0, api.sms.sendBookingSms, {
      to: booking.phone ?? "",
      event: "cancelled",
      restaurantName: restaurant?.name ?? "",
      city: restaurant?.city ?? "",
      date: booking.date,
      time: booking.time,
      partySize: booking.partySize,
      code: booking.code,
    });

    // seats freed up — notify the next diner on the waitlist, if any
    const freed = await notifyWaitlistForFreedSeats(ctx, {
      restaurantId: booking.restaurantId,
      sectionId: booking.sectionId,
      date: booking.date,
      time: booking.time,
      partySize: booking.partySize,
    });
    if (freed) {
      await ctx.scheduler.runAfter(0, api.sms.sendWaitlistSms, freed);
    }
    return await ctx.db.get(bookingId);
  },
});

async function findBestSlotFromDb(
  ctx: MutationCtx,
  booking: { restaurantId: Id<"restaurants">; sectionId?: Id<"sections">; date: string; time: string },
) {
  if (!booking.sectionId) return null;
  const slots = await ctx.db
    .query("slots")
    .withIndex("by_restaurant_date", (q) => q.eq("restaurantId", booking.restaurantId).eq("date", booking.date))
    .collect();
  return findBestSlot(slots, booking.sectionId, booking.time);
}

/** Owner transitions: completed / no_show / confirmed / cancelled. */
export const updateStatus = mutation({
  args: {
    bookingId: v.id("bookings"),
    status: v.union(v.literal("confirmed"), v.literal("completed"), v.literal("no_show"), v.literal("cancelled")),
  },
  handler: async (ctx, { bookingId, status }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const booking = await ctx.db.get(bookingId);
    if (!booking) throw new Error("Booking not found.");
    if (!(await isRestaurantOwner(ctx, userId, booking.restaurantId))) {
      throw new Error("Only the restaurant owner can change booking status.");
    }
    if (booking.status === status) return booking;

    // completing a booking earns the diner loyalty points (once)
    if (status === "completed" && booking.status !== "completed") {
      await awardPoints(ctx, {
        userId: booking.userId,
        amount: POINTS.COMPLETED_BOOKING,
        source: "booking_completed",
        sourceId: `booking:${booking._id}`,
      });
      // Idea #4: nudge the diner to review the visit (fire-and-forget)
      await ctx.scheduler.runAfter(0, internal.dinerNotify.onBookingCompleted, { bookingId });
    }

    // cancelling returns seats to availability
    if (status === "cancelled" && booking.sectionId && booking.status !== "cancelled") {
      const slot = await findBestSlotFromDb(ctx, booking);
      if (slot) {
        await ctx.db.patch(slot._id, { remaining: Math.min(slot.total, slot.remaining + booking.partySize) });
      } else {
        // KB-16: missing slot ledger entry — log instead of leaking seats.
        console.warn(`[KB-16] updateStatus: no slot found to restore seats for booking ${bookingId}`);
      }
    }
    await ctx.db.patch(bookingId, { status, updatedAt: Date.now() });

    if (status === "cancelled" && booking.status !== "cancelled") {
      // owner dashboard event
      await notifyRestaurant(ctx, {
        restaurantId: booking.restaurantId,
        bookingId,
        userId: booking.userId,
        type: "booking_cancelled",
      });
      const freed = await notifyWaitlistForFreedSeats(ctx, {
        restaurantId: booking.restaurantId,
        sectionId: booking.sectionId,
        date: booking.date,
        time: booking.time,
        partySize: booking.partySize,
      });
      if (freed) {
        await ctx.scheduler.runAfter(0, api.sms.sendWaitlistSms, freed);
      }
    }
    return await ctx.db.get(bookingId);
  },
});

/**
 * Reservation marketplace (Idea #15): a diner can release a confirmed
 * booking back to the pool — the seats return to availability and the
 * waitlist is notified instantly, so a cancelled plan never wastes a table.
 *
 * This is intentionally distinct from a plain cancel: the booking is marked
 * cancelled, but the diner is told the table is being offered to others
 * (and, when the invite-link flow is used, they can transfer the table to a
 * specific friend instead — see confirmGuest).
 */
export const releaseBooking = mutation({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, { bookingId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const booking = await ctx.db.get(bookingId);
    if (!booking || booking.userId !== userId) {
      throw new Error("Booking not found.");
    }
    if (booking.status !== "confirmed") {
      throw new Error("This booking is no longer active.");
    }

    // restore seats to the pool (same path as cancellation)
    if (booking.sectionId) {
      const slot = await findBestSlotFromDb(ctx, booking);
      if (slot) {
        await ctx.db.patch(slot._id, { remaining: Math.min(slot.total, slot.remaining + booking.partySize) });
      } else {
        // KB-16: missing slot ledger entry — log instead of leaking seats.
        console.warn(`[KB-16] releaseBooking: no slot found to restore seats for booking ${bookingId}`);
      }
    }
    await ctx.db.patch(bookingId, { status: "cancelled", updatedAt: Date.now() });

    // tell the next waitlist diner — their table just opened up
    const freed = await notifyWaitlistForFreedSeats(ctx, {
      restaurantId: booking.restaurantId,
      sectionId: booking.sectionId,
      date: booking.date,
      time: booking.time,
      partySize: booking.partySize,
    });
    if (freed) {
      await ctx.scheduler.runAfter(0, api.sms.sendWaitlistSms, freed);
    }

    await notifyRestaurant(ctx, {
      restaurantId: booking.restaurantId,
      bookingId,
      userId: booking.userId,
      type: "booking_cancelled",
      message: "Diner released the table back to the pool — waitlist notified.",
    });

    return { released: true, waitlistNotified: !!freed };
  },
});

/**
 * Group invites: a friend who opens the invite link confirms their seat.
 * The party grows by exactly one and the slot ledger is decremented in the
 * same serializable mutation, so a booking can never exceed capacity even if
 * several friends confirm at the same moment.
 */
export const confirmGuest = mutation({
  args: {
    bookingId: v.id("bookings"),
    code: v.string(),
    name: v.string(),
  },
  handler: async (ctx, { bookingId, code, name }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const cleanName = parseOrThrow(guestNameSchema, name);

    const booking = await ctx.db.get(bookingId);
    if (!booking) throw new Error("Booking not found.");
    // Verify the invite capability: the caller must present the booking's
    // confirmation code, not just a guessable booking id.
    const parsedCode = bookingCodeSchema.safeParse(code);
    if (!parsedCode.success || booking.code !== parsedCode.data.toUpperCase()) {
      throw new Error("This invitation link is not valid.");
    }
    if (booking.status !== "confirmed") throw new Error("This booking is no longer active.");
    // KB-03: guests can't join a booking at a disabled restaurant.
    const restaurant = await ctx.db.get(booking.restaurantId);
    if (restaurant?.disabled) throw new Error("This restaurant is currently unavailable.");

    // BUG-04: use server date for past check (guest confirm is on-visit, not day-of specific)
    const serverToday = (() => {
      const n = new Date();
      return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
    })();
    if (booking.date < serverToday) throw new Error("This booking is in the past.");

    if (booking.userId === userId) {
      throw new Error("You're the host — you're already on the list.");
    }
    const guests = booking.guests ?? [];
    if (guests.some((g) => g.userId === userId)) {
      throw new Error("You already confirmed your seat.");
    }
    if (guests.some((g) => g.name.toLowerCase() === cleanName.toLowerCase())) {
      throw new Error("Someone with that name already confirmed — use a different name.");
    }
    // hard cap: 20 diners total like the booking validator
    if (booking.partySize + guests.length + 1 > 20) {
      throw new Error("This booking is at its guest limit.");
    }

    // atomically consume one more seat from the slot ledger (never overbook)
    if (booking.sectionId) {
      const slots = await ctx.db
        .query("slots")
        .withIndex("by_restaurant_date", (q) => q.eq("restaurantId", booking.restaurantId).eq("date", booking.date))
        .collect();
      const slot = await findBestSlot(slots, booking.sectionId, booking.time);
      if (!slot || slot.remaining < 1) {
        throw new Error("No seats left — this booking is full.");
      }
      await ctx.db.patch(slot._id, { remaining: slot.remaining - 1 });
    }

    await ctx.db.patch(bookingId, {
      guests: [...guests, { name: cleanName, userId, confirmedAt: Date.now() }],
      updatedAt: Date.now(),
    });
    // Idea #4: tell the host their friend confirmed (fire-and-forget)
    await ctx.scheduler.runAfter(0, internal.dinerNotify.onGuestConfirmed, {
      bookingId,
      guestName: cleanName,
    });
    return await ctx.db.get(bookingId);
  },
});
