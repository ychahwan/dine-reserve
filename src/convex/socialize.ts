import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { notifyRestaurant } from "./notifications";
import { safeGet } from "./helpers";
import { giftTypeSchema, parseOrThrow, sendGiftSchema } from "./validation";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Today's local date as "YYYY-MM-DD". */
function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

async function isOwnerOf(
  ctx: MutationCtx | QueryCtx,
  userId: string,
  restaurantId: Id<"restaurants">,
): Promise<boolean> {
  const restaurant = await ctx.db.get(restaurantId);
  return !!restaurant && restaurant.ownerId === userId;
}

/** Load a booking that belongs to the caller, is confirmed, and is today. */
async function requireActiveTodayBooking(
  ctx: MutationCtx,
  userId: Id<"users">,
  bookingId: Id<"bookings">,
) {
  const booking = await ctx.db.get(bookingId);
  if (!booking || booking.userId !== userId) throw new Error("Booking not found.");
  if (booking.status !== "confirmed") throw new Error("This booking is no longer active.");
  if (booking.date !== todayKey()) {
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
 */
export const visibleDiners = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, { restaurantId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const presences = await ctx.db
      .query("dinerPresence")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect();
    const today = todayKey();
    const visible = presences.filter(
      (p) => p.visible && p.userId !== userId,
    );
    const [users, bookings] = await Promise.all([
      Promise.all(visible.map((p) => safeGet<Doc<"users">>(ctx, p.userId))),
      Promise.all(visible.map((p) => safeGet<Doc<"bookings">>(ctx, p.bookingId))),
    ]);
    return visible
      .map((p, i) => {
        const booking = bookings[i];
        // presence without a live confirmed booking today is not shown
        if (!booking || booking.status !== "confirmed" || booking.date !== today) return null;
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
            partySize: booking.partySize,
            code: booking.code,
          },
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.booking.time.localeCompare(b.booking.time));
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
  },
  handler: async (ctx, { bookingId, visible }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Please sign in.");
    const booking = await requireActiveTodayBooking(ctx, userId, bookingId);

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
  },
  handler: async (ctx, { bookingId, giftId, receiverUserId, note, reveal }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Please sign in to send a gift.");
    if (receiverUserId === userId) throw new Error("You can't send a gift to yourself.");

    parseOrThrow(sendGiftSchema, { giftId, receiverUserId, note, reveal });

    const booking = await requireActiveTodayBooking(ctx, userId, bookingId);
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
