import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { notifyRestaurant } from "./notifications";
import { safeGet } from "./helpers";
import { awardPoints, POINTS } from "./loyalty";
import { giftTypeSchema, parseOrThrow, sendGiftSchema } from "./validation";
import { checkRateLimit } from "./rateLimit";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Today's date (server clock, effectively UTC on Convex Cloud) as "YYYY-MM-DD". */
function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Resolve "today" for a day-of-visit check, preferring the caller's own
 * local date over the server clock.
 *
 * The server's clock is effectively UTC, while diners are on their phone's
 * local timezone — near midnight local time these disagree by a day, which
 * previously made day-of-visit actions (Socialize visibility, gifting)
 * silently fail even though the booking really was "today" for the diner.
 * A client-supplied date is only trusted if it's within one day of the
 * server's own date (bounds any deliberate skew to a plausible timezone
 * offset, at most ±24h either side).
 */
function resolveTodayKey(clientDate?: string): string {
  const serverToday = todayKey();
  if (!clientDate || !/^\d{4}-\d{2}-\d{2}$/.test(clientDate)) return serverToday;

  const msPerDay = 24 * 60 * 60 * 1000;
  const diffMs = Math.abs(
    new Date(`${clientDate}T00:00:00Z`).getTime() - new Date(`${serverToday}T00:00:00Z`).getTime(),
  );
  return diffMs <= msPerDay ? clientDate : serverToday;
}

async function isOwnerOf(
  ctx: MutationCtx | QueryCtx,
  userId: string,
  restaurantId: Id<"restaurants">,
): Promise<boolean> {
  const restaurant = await ctx.db.get(restaurantId);
  return !!restaurant && restaurant.ownerId === userId;
}

/** Load a confirmed booking that belongs to the caller (no date restriction). */
async function requireActiveBooking(
  ctx: MutationCtx,
  userId: Id<"users">,
  bookingId: Id<"bookings">,
) {
  const booking = await ctx.db.get(bookingId);
  if (!booking || booking.userId !== userId) throw new Error("Booking not found.");
  if (booking.status !== "confirmed") throw new Error("This booking is no longer active.");
  return booking;
}

/**
 * Like requireActiveBooking but also requires the diner to have checked in.
 * Used by setVisibility so phantom bookings can't access the Socialize room.
 */
async function requireCheckedInBooking(
  ctx: MutationCtx,
  userId: Id<"users">,
  bookingId: Id<"bookings">,
) {
  const booking = await requireActiveBooking(ctx, userId, bookingId);
  if (!booking.checkedInAt) {
    throw new Error("Please check in at the restaurant before going visible.");
  }
  return booking;
}

/** Load a booking that belongs to the caller, is confirmed, and is today. */
async function requireActiveTodayBooking(
  ctx: MutationCtx,
  userId: Id<"users">,
  bookingId: Id<"bookings">,
  clientDate?: string,
) {
  const booking = await requireActiveBooking(ctx, userId, bookingId);
  if (booking.date !== resolveTodayKey(clientDate)) {
    throw new Error("Socialize is available on the day of your booking.");
  }
  return booking;
}

/** The restaurant a giftType / delivery belongs to, with an owner check. */
async function requireGiftRestaurantOwner(
  ctx: MutationCtx,
  userId: Id<"users">,
  restaurantId: Id<"restaurants">,
) {
  if (!(await isOwnerOf(ctx, userId, restaurantId))) {
    throw new Error("Only the restaurant owner can manage gifts.");
  }
  return restaurantId;
}

// ---------------------------------------------------------------------------
// diner presence
// ---------------------------------------------------------------------------

/**
 * The diner's Socialize presence across their bookings. One doc per booking
 * (created on first visibility change) so a diner can be visible at one
 * restaurant and invisible at another without conflicts.
 */
export const myPresence = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const presences = await ctx.db
      .query("dinerPresence")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const [bookings, restaurants] = await Promise.all([
      Promise.all(presences.map((p) => safeGet<Doc<"bookings">>(ctx, p.bookingId))),
      Promise.all(presences.map((p) => safeGet<Doc<"restaurants">>(ctx, p.restaurantId))),
    ]);
    return presences
      .map((p, i) => ({
        ...p,
        booking: bookings[i]
          ? {
              date: bookings[i]!.date,
              time: bookings[i]!.time,
              sectionName: bookings[i]!.sectionName,
              code: bookings[i]!.code,
              partySize: bookings[i]!.partySize,
            }
          : null,
        restaurant: restaurants[i]
          ? {
              name: restaurants[i]!.name,
              imageUrl: restaurants[i]!.imageUrl,
              city: restaurants[i]!.city,
            }
          : null,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

/**
 * Diners who are currently visible at a restaurant — the Socialize room.
 * Only confirmed bookings for today appear, so the room never shows stale
 * or past visits. The caller's own presence is excluded (they already know
 * they're here).
 */export const visibleDiners = query({
  args: { restaurantId: v.id("restaurants"), clientDate: v.optional(v.string()) },
  handler: async (ctx, { restaurantId, clientDate }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];

    // KB-04/11: the room's "today" must match the day the diner actually set
    // visibility for (their local date). setVisibility uses
    // resolveTodayKey(clientDate) — these queries must use the same key or a
    // diner near midnight turns visibility on but is filtered out of the
    // room, making it look empty for everyone.
    const today = resolveTodayKey(clientDate);

    // Authorization (SEC-03): only a diner attending this restaurant today
    // (or its owner) may see the Socialize room. Prevents any signed-in user
    // from enumerating diner identities at an arbitrary restaurant.
    const restaurant = await ctx.db.get(restaurantId);
    const isOwner = !!restaurant && restaurant.ownerId === userId;

    // Restaurant-side controls (Idea #8): if Socialize is disabled at this
    // venue, return an empty room. Owners can still see settings.
    const socializeSettings = restaurant?.socialize;
    if (socializeSettings && !socializeSettings.enabled && !isOwner) return [];

    // Block list: if the caller is blocked by this restaurant, they see nothing.
    if (socializeSettings?.blockedUserIds?.includes(userId as never) && !isOwner) return [];

    if (!isOwner) {
      const myBookings = await ctx.db
        .query("bookings")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      const attending = myBookings.some(
        (b) =>
          b.restaurantId === restaurantId && b.status === "confirmed" && b.date === today,
      );
      if (!attending) return [];
    }

    const presences = await ctx.db
      .query("dinerPresence")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect();
    let visible = presences.filter(
      (p) => p.visible && p.userId !== userId,
    );

    // Block list: hide blocked users from the room.
    if (socializeSettings?.blockedUserIds?.length) {
      const blocked = new Set(socializeSettings.blockedUserIds);
      visible = visible.filter((p) => !blocked.has(p.userId as never));
    }
    const [users, bookings] = await Promise.all([
      Promise.all(visible.map((p) => safeGet<Doc<"users">>(ctx, p.userId))),
      Promise.all(visible.map((p) => safeGet<Doc<"bookings">>(ctx, p.bookingId))),
    ]);

    // MinVisits filter (Idea #8): if the restaurant requires N completed
    // visits, count each visible diner's completed bookings and hide those
    // who don't meet the threshold.
    const minVisits = socializeSettings?.minVisits ?? 0;
    let visitCounts: Map<string, number> | null = null;
    if (minVisits > 0) {
      const visibleUserIds = [...new Set(visible.map((p) => p.userId))];
      const allBookings = await Promise.all(
        visibleUserIds.map((uid) =>
          ctx.db
            .query("bookings")
            .withIndex("by_user", (q) => q.eq("userId", uid as never))
            .collect(),
        ),
      );
      visitCounts = new Map();
      visibleUserIds.forEach((uid, i) => {
        const completed = allBookings[i]!.filter(
          (b) => b.status === "completed" && b.restaurantId === restaurantId,
        ).length;
        visitCounts!.set(uid, completed);
      });
    }

    return visible
      .map((p, i) => {
        const booking = bookings[i];
        // presence without a live confirmed booking today is not shown
        if (!booking || booking.status !== "confirmed" || booking.date !== today) return null;
        // MinVisits: hide diners below the threshold
        if (minVisits > 0 && (visitCounts?.get(p.userId) ?? 0) < minVisits) return null;
        return {
          _id: p._id,
          userId: p.userId,
          updatedAt: p.updatedAt,
          name: users[i]?.name ?? "Guest",
          image: users[i]?.image ?? undefined,
          checkedIn: !!booking.checkedInAt,
          booking: {
            time: booking.time,
            sectionName: booking.sectionName,
          },
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.booking.time.localeCompare(b.booking.time));
  },
});

/**
 * Taste Twins (Idea #2): among the diners currently visible at a
 * restaurant, find the ones whose dining preferences overlap the caller's
 * (shared dietary tags, seating zones, occasions). Each match is scored
 * 0–100 by how much of the caller's profile the other diner shares, so
 * social diners can find the people most likely to enjoy the same things.
 *
 * Same privacy model as the room: only visible diners at a restaurant the
 * caller is attending today are ever returned.
 */
export const tasteTwins = query({
  args: { restaurantId: v.id("restaurants"), clientDate: v.optional(v.string()) },
  handler: async (ctx, { restaurantId, clientDate }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];

    // KB-04/11: same local-date key as visibleDiners / setVisibility.
    const today = resolveTodayKey(clientDate);

    const restaurant = await ctx.db.get(restaurantId);
    const isOwner = !!restaurant && restaurant.ownerId === userId;
    if (!isOwner) {
      const myBookings = await ctx.db
        .query("bookings")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      const attending = myBookings.some(
        (b) => b.restaurantId === restaurantId && b.status === "confirmed" && b.date === today,
      );
      if (!attending) return [];
    }

    const me = await safeGet<Doc<"users">>(ctx, userId);
    const myPrefs = me?.prefs;
    if (!myPrefs) return []; // no profile → nothing to match on
    const myDiet = new Set((myPrefs.dietary ?? []).map((d) => d.toLowerCase()));
    const mySeating = new Set((myPrefs.seating ?? []).map((s) => s.toLowerCase()));
    const myOccasions = new Set((myPrefs.occasions ?? []).map((o) => o.toLowerCase()));
    const totalTags = myDiet.size + mySeating.size + myOccasions.size;
    if (totalTags === 0) return [];

    const presences = await ctx.db
      .query("dinerPresence")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect();
    const visible = presences.filter((p) => p.visible && p.userId !== userId);
    const [users, bookings] = await Promise.all([
      Promise.all(visible.map((p) => safeGet<Doc<"users">>(ctx, p.userId))),
      Promise.all(visible.map((p) => safeGet<Doc<"bookings">>(ctx, p.bookingId))),
    ]);

    const matches: {
      _id: string;
      userId: string;
      name: string;
      image?: string;
      checkedIn: boolean;
      booking: { time: string; sectionName?: string };
      score: number;
      sharedTags: string[];
    }[] = [];
    for (let i = 0; i < visible.length; i++) {
      const p = visible[i]!;
      const other = users[i];
      const booking = bookings[i];
      if (!other || !booking || booking.status !== "confirmed" || booking.date !== today) continue;
      const prefs = other.prefs;
      if (!prefs) continue;

      const shared: string[] = [];
      for (const d of prefs.dietary ?? []) if (myDiet.has(d.toLowerCase())) shared.push(d);
      for (const s of prefs.seating ?? []) if (mySeating.has(s.toLowerCase())) shared.push(s);
      for (const o of prefs.occasions ?? []) if (myOccasions.has(o.toLowerCase())) shared.push(o);
      if (shared.length === 0) continue;

      const otherTags = prefs.dietary.length + prefs.seating.length + prefs.occasions.length;
      // harmonic blend: how much of MY profile they share + how close our
      // profiles are in size (a 1-tag twin sharing my only tag = 100%)
      const coverage = shared.length / totalTags;
      const proximity = otherTags === 0 ? 0 : 1 - Math.abs(totalTags - otherTags) / Math.max(totalTags, otherTags);
      const score = Math.round(Math.min(100, Math.max(10, (coverage * 0.7 + proximity * 0.3) * 100)));

      matches.push({
        _id: p._id,
        userId: p.userId,
        name: other.name ?? "Guest",
        image: other.image ?? undefined,
        checkedIn: !!booking.checkedInAt,
        booking: { time: booking.time, sectionName: booking.sectionName },
        score,
        sharedTags: shared.slice(0, 4),
      });
    }
    return matches.sort((a, b) => b.score - a.score).slice(0, 12);
  },
});

/**
 * Diner flips their Socialize presence on or off for one of today's
 * bookings. Visible → shown in the room and open to gifts; invisible →
 * completely hidden. Idempotent.
 */
export const setVisibility = mutation({
  args: {
    bookingId: v.id("bookings"),
    visible: v.boolean(),
    clientDate: v.optional(v.string()),
  },
  handler: async (ctx, { bookingId, visible }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Please sign in.");
    const booking = await requireCheckedInBooking(ctx, userId, bookingId);

    const existing = await ctx.db
      .query("dinerPresence")
      .withIndex("by_booking", (q) => q.eq("bookingId", bookingId))
      .first();
    if (existing) {
      if (existing.visible !== visible) {
        await ctx.db.patch(existing._id, { visible, updatedAt: Date.now() });
      }
      return await ctx.db.get(existing._id);
    }
    const id = await ctx.db.insert("dinerPresence", {
      bookingId,
      restaurantId: booking.restaurantId,
      userId,
      visible,
      updatedAt: Date.now(),
    });
    return await ctx.db.get(id);
  },
});

// ---------------------------------------------------------------------------
// gift catalog
// ---------------------------------------------------------------------------

/** Gifts diners can send right now at this restaurant (available only). */
export const giftCatalog = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, { restaurantId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const items = await ctx.db
      .query("giftTypes")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect();
    return items
      .filter((g) => g.available)
      .sort((a, b) => a.priceCents - b.priceCents);
  },
});

/** Owner view: every gift in the catalog, including hidden ones. */
export const ownerGiftTypes = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, { restaurantId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    if (!(await isOwnerOf(ctx, userId, restaurantId))) return [];
    const items = await ctx.db
      .query("giftTypes")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect();
    return items.sort((a, b) => a.priceCents - b.priceCents);
  },
});

/** Owner creates or updates a gift in the catalog (Zod-validated). */
export const saveGiftType = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    id: v.optional(v.id("giftTypes")),
    name: v.string(),
    emoji: v.string(),
    description: v.optional(v.string()),
    priceCents: v.number(),
    available: v.boolean(),
  },
  handler: async (ctx, { restaurantId, id, name, emoji, description, priceCents, available }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    await requireGiftRestaurantOwner(ctx, userId, restaurantId);

    parseOrThrow(giftTypeSchema, { name, emoji, description, priceCents, available });

    if (id) {
      const existing = await ctx.db.get(id);
      if (!existing || existing.restaurantId !== restaurantId) {
        throw new Error("Gift not found.");
      }
      await ctx.db.patch(id, {
        name: name.trim(),
        emoji: emoji.trim(),
        description: description?.trim().slice(0, 200) || undefined,
        priceCents,
        available,
      });
      return await ctx.db.get(id);
    }
    const newId = await ctx.db.insert("giftTypes", {
      restaurantId,
      name: name.trim(),
      emoji: emoji.trim(),
      description: description?.trim().slice(0, 200) || undefined,
      priceCents,
      available,
      createdAt: Date.now(),
    });
    return await ctx.db.get(newId);
  },
});

/** Owner removes a gift from the catalog. */
export const deleteGiftType = mutation({
  args: { id: v.id("giftTypes") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const gift = await ctx.db.get(id);
    if (!gift) throw new Error("Gift not found.");
    await requireGiftRestaurantOwner(ctx, userId, gift.restaurantId);
    await ctx.db.delete(id);
    return { deleted: true };
  },
});

// ---------------------------------------------------------------------------
// sending gifts
// ---------------------------------------------------------------------------

/**
 * A diner sends a gift to another visible diner at the same restaurant.
 * The price is snapped at send time and lands on the sender's bill (see
 * dining.billForBooking). `reveal` decides when the receiver finds out:
 * "now" = notification immediately; "on_delivery" = only once the
 * restaurant marks it delivered (a surprise).
 */
export const sendGift = mutation({
  args: {
    bookingId: v.id("bookings"),
    giftId: v.id("giftTypes"),
    receiverUserId: v.id("users"),
    note: v.optional(v.string()),
    reveal: v.union(v.literal("now"), v.literal("on_delivery")),
    clientDate: v.optional(v.string()),
  },
  handler: async (ctx, { bookingId, giftId, receiverUserId, note, reveal, clientDate }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Please sign in to send a gift.");
    if (receiverUserId === userId) throw new Error("You can't send a gift to yourself.");

    // Rate limit: 20 gifts per hour per sender
    await checkRateLimit(ctx, {
      key: "sendGift",
      userId,
      limit: 20,
      windowMs: 60 * 60_000,
    });

    parseOrThrow(sendGiftSchema, { giftId, receiverUserId, note, reveal });

    const booking = await requireActiveTodayBooking(ctx, userId, bookingId, clientDate);
    const gift = await ctx.db.get(giftId);
    if (!gift || gift.restaurantId !== booking.restaurantId) {
      throw new Error("That gift isn't available at this restaurant.");
    }
    if (!gift.available) throw new Error(`"${gift.name}" is no longer available.`);

    // the receiver must be visible at the same restaurant right now
    const receiverPresence = await ctx.db
      .query("dinerPresence")
      .withIndex("by_user", (q) => q.eq("userId", receiverUserId))
      .collect();
    const active = receiverPresence.find(
      (p) => p.restaurantId === booking.restaurantId && p.visible,
    );
    if (!active) throw new Error("That diner isn't accepting gifts right now.");

    const now = Date.now();
    const id = await ctx.db.insert("giftDeliveries", {
      restaurantId: booking.restaurantId,
      bookingId: booking._id,
      senderUserId: userId,
      receiverUserId,
      giftId: gift._id,
      name: gift.name,
      emoji: gift.emoji,
      priceCents: gift.priceCents,
      note: note?.trim().slice(0, 200) || undefined,
      reveal,
      status: "ordered",
      revealedAt: reveal === "now" ? now : undefined,
      createdAt: now,
    });

    // loyalty: sending a gift earns a small bonus (per gift)
    await awardPoints(ctx, {
      userId,
      amount: POINTS.GIFT_SENT,
      source: "gift_sent",
      sourceId: `gift:${id}`,
    });

    // the restaurant prepares it; the owner sees the order in their Gifts tab
    await notifyRestaurant(ctx, {
      restaurantId: booking.restaurantId,
      bookingId: booking._id,
      userId,
      type: "gift_ordered",
      message: `${gift.emoji} ${gift.name} → ${
        (await safeGet<Doc<"users">>(ctx, receiverUserId))?.name ?? "a diner"
      } (${reveal === "now" ? "revealed now" : "surprise"})`,
    });
    return await ctx.db.get(id);
  },
});

// ---------------------------------------------------------------------------
// gift inboxes (diner side)
// ---------------------------------------------------------------------------

/**
 * Gifts other diners sent to me. Gifts ordered with reveal "on_delivery"
 * stay a placeholder ("a surprise is coming") until the restaurant marks
 * them delivered — the sender's identity and the gift itself are only
 * revealed then.
 */
export const myReceivedGifts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const gifts = await ctx.db
      .query("giftDeliveries")
      .withIndex("by_receiver", (q) => q.eq("receiverUserId", userId))
      .collect();
    const [senders, restaurants] = await Promise.all([
      Promise.all(gifts.map((g) => safeGet<Doc<"users">>(ctx, g.senderUserId))),
      Promise.all(gifts.map((g) => safeGet<Doc<"restaurants">>(ctx, g.restaurantId))),
    ]);
    return gifts
      .map((g, i) => {
        const surprise = g.reveal === "on_delivery" && g.status !== "delivered";
        return {
          _id: g._id,
          status: g.status,
          reveal: g.reveal,
          createdAt: g.createdAt,
          deliveredAt: g.deliveredAt,
          restaurantName: restaurants[i]?.name ?? "Restaurant",
          senderName: senders[i]?.name ?? "Guest",
          senderImage: senders[i]?.image ?? undefined,
          // details are hidden until the surprise is delivered
          gift: surprise
            ? null
            : { name: g.name, emoji: g.emoji, priceCents: g.priceCents, note: g.note },
          surprise,
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Gifts I sent — with status, so the sender can follow the surprise too. */
export const mySentGifts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const gifts = await ctx.db
      .query("giftDeliveries")
      .withIndex("by_sender", (q) => q.eq("senderUserId", userId))
      .collect();
    const [receivers, restaurants] = await Promise.all([
      Promise.all(gifts.map((g) => safeGet<Doc<"users">>(ctx, g.receiverUserId))),
      Promise.all(gifts.map((g) => safeGet<Doc<"restaurants">>(ctx, g.restaurantId))),
    ]);
    return gifts
      .map((g, i) => ({
        _id: g._id,
        name: g.name,
        emoji: g.emoji,
        priceCents: g.priceCents,
        note: g.note,
        reveal: g.reveal,
        status: g.status,
        createdAt: g.createdAt,
        deliveredAt: g.deliveredAt,
        receiverName: receivers[i]?.name ?? "Guest",
        restaurantName: restaurants[i]?.name ?? "Restaurant",
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

// ---------------------------------------------------------------------------
// owner side: preparing & delivering gifts
// ---------------------------------------------------------------------------

/**
 * Every gift ordered at the restaurant, with who sent it, who receives it,
 * and the receiver's booking — so the team can prepare and deliver it.
 */
export const restaurantGiftDeliveries = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, { restaurantId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    if (!(await isOwnerOf(ctx, userId, restaurantId))) return [];
    const gifts = await ctx.db
      .query("giftDeliveries")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect();
    const [senders, receivers, bookings] = await Promise.all([
      Promise.all(gifts.map((g) => safeGet<Doc<"users">>(ctx, g.senderUserId))),
      Promise.all(gifts.map((g) => safeGet<Doc<"users">>(ctx, g.receiverUserId))),
      Promise.all(gifts.map((g) => safeGet<Doc<"bookings">>(ctx, g.bookingId))),
    ]);
    return gifts
      .map((g, i) => ({
        ...g,
        senderName: senders[i]?.name ?? "Guest",
        receiverName: receivers[i]?.name ?? "Guest",
        booking: bookings[i]
          ? {
              code: bookings[i]!.code,
              time: bookings[i]!.time,
              sectionName: bookings[i]!.sectionName,
              partySize: bookings[i]!.partySize,
            }
          : null,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Number of gifts still waiting to be delivered (owner tab badge). */
export const pendingGiftCount = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, { restaurantId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return 0;
    if (!(await isOwnerOf(ctx, userId, restaurantId))) return 0;
    const gifts = await ctx.db
      .query("giftDeliveries")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect();
    return gifts.filter((g) => g.status === "ordered").length;
  },
});

/**
 * Owner marks a gift as delivered. For "on_delivery" gifts this is the
 * moment the surprise is revealed to the receiver.
 */
export const markGiftDelivered = mutation({
  args: { id: v.id("giftDeliveries") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const gift = await ctx.db.get(id);
    if (!gift) throw new Error("Gift order not found.");
    await requireGiftRestaurantOwner(ctx, userId, gift.restaurantId);
    if (gift.status !== "ordered") return gift;
    const now = Date.now();
    await ctx.db.patch(id, {
      status: "delivered",
      deliveredAt: now,
      revealedAt: gift.reveal === "on_delivery" ? now : gift.revealedAt,
    });
    return await ctx.db.get(id);
  },
});
