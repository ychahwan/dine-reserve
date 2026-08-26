import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  ASSIST_STATUS,
  ASSIST_TEMPLATE,
  MENU_REQUEST_STATUS,
  ORDER_ITEM,
  ORDER_STATUS,
} from "./schema";
import { notifyRestaurant } from "./notifications";
import { safeGet } from "./helpers";
import { awardPoints, POINTS } from "./loyalty";
import { assistNoteSchema, menuRequestSchema, parseOrThrow, placeOrderSchema } from "./validation";

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

/**
 * KB-04: resolve "today" for a day-of-visit check, preferring the caller's
 * own local date (the server clock is effectively UTC; booking dates are the
 * diner's local date, so near midnight they disagree by a day). A
 * client-supplied date is only trusted within ±1 day of the server's date.
 */
function resolveTodayKey(clientDate?: string): string {
  const serverToday = todayKey();
  if (!clientDate || !/^\d{4}-\d{2}-\d{2}$/.test(clientDate)) return serverToday;
  const diffMs = Math.abs(
    new Date(`${clientDate}T00:00:00Z`).getTime() - new Date(`${serverToday}T00:00:00Z`).getTime(),
  );
  return diffMs <= 24 * 60 * 60 * 1000 ? clientDate : serverToday;
}

async function requireConfirmedBookingParticipant(
  ctx: MutationCtx | QueryCtx,
  userId: string,
  bookingId: Id<"bookings">,
  clientDate?: string,
) {
  const booking = await ctx.db.get(bookingId);
  if (!booking) throw new Error("Booking not found.");
  if (booking.status !== "confirmed") throw new Error("This booking is no longer active.");
  // BUG-05: use resolveTodayKey to handle timezone edge cases near midnight
  // (server is UTC, diner may be ahead/behind by several hours)
  if (booking.date < resolveTodayKey(clientDate)) throw new Error("This booking is in the past.");

  // Allow both the host AND confirmed guests to participate
  const isHost = booking.userId === userId;
  const guests = booking.guests ?? [];
  const isGuest = guests.some((g) => g.userId === userId);

  if (!isHost && !isGuest) {
    throw new Error("You're not part of this booking.");
  }
  return booking;
}

async function isOwnerOf(
  ctx: MutationCtx | QueryCtx,
  userId: string,
  restaurantId: Id<"restaurants">,
): Promise<boolean> {
  const restaurant = await ctx.db.get(restaurantId);
  return !!restaurant && restaurant.ownerId === userId;
}

/**
 * Validate a diner's ingredient removals against the dish's real ingredient
 * list (case-insensitive, original casing kept). Unknown names are rejected so
 * the kitchen never gets a request the menu can't honour — and the intent is
 * never silently dropped.
 */
function sanitizeRemovals(
  removals: string[] | undefined,
  ingredients: string[] | undefined,
  dishName: string,
): string[] {
  if (!removals || removals.length === 0) return [];
  const allowed = new Map((ingredients ?? []).map((i) => [i.toLowerCase(), i]));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of removals) {
    const key = raw.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    const canonical = allowed.get(key);
    if (!canonical) {
      throw new Error(`“${raw.trim()}” isn't an ingredient of ${dishName}.`);
    }
    seen.add(key);
    out.push(canonical);
    if (out.length >= 20) break;
  }
  return out;
}

const ASSIST_LABEL: Record<string, string> = {
  water: "💧 More water",
  napkins: "🧻 More napkins",
  utensils: "🍴 More cutlery",
  order_status: "🍽️ How is my order doing?",
  bill: "🧾 Bring the bill",
  help: "🙋 Need help",
  custom: "✍️ Custom request",
};

// ---------------------------------------------------------------------------
// check-in: diner confirms arrival at the restaurant
// ---------------------------------------------------------------------------

/** Diner confirms arrival — stamps checkedInAt and alerts the restaurant. */
export const checkIn = mutation({
  args: { bookingId: v.id("bookings"), clientDate: v.optional(v.string()) },
  handler: async (ctx, { bookingId, clientDate }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Please sign in.");
    const booking = await ctx.db.get(bookingId);
    if (!booking || booking.userId !== userId) throw new Error("Booking not found.");
    if (booking.status !== "confirmed") throw new Error("This booking is no longer active.");
    // KB-04: arrival only makes sense on the day of the visit — judged on the
    // diner's local date (client-supplied, bounded ±1 day) so a booking near
    // midnight isn't wrongly rejected because the server clock is UTC.
    if (booking.date !== resolveTodayKey(clientDate)) {
      throw new Error("You can check in on the day of your booking.");
    }
    if (booking.checkedInAt) return booking;
    await ctx.db.patch(bookingId, { checkedInAt: Date.now(), updatedAt: Date.now() });
    // loyalty: checking in earns a small bonus (once per booking)
    await awardPoints(ctx, {
      userId,
      amount: POINTS.CHECK_IN,
      source: "check_in",
      sourceId: `booking:${booking._id}`,
    });
    await notifyRestaurant(ctx, {
      restaurantId: booking.restaurantId,
      bookingId: booking._id,
      userId,
      type: "arrived",
    });
    return await ctx.db.get(bookingId);
  },
});

// ---------------------------------------------------------------------------
// dine-in orders
// ---------------------------------------------------------------------------

/**
 * Diner places an order for one of their confirmed bookings. Menu items are
 * snapshotted (name, price, ingredients at order time) so the bill stays
 * correct even if the menu changes later. Per line, the diner can customise
 * the dish: remove any ingredient from the restaurant's list (validated
 * against the item) and/or add a note. The kitchen sees it live via the
 * reactive restaurantOrders query.
 */
export const placeOrder = mutation({
  args: {
    bookingId: v.id("bookings"),
    items: v.array(
      v.object({
        menuItemId: v.id("menuItems"),
        quantity: v.number(),
        note: v.optional(v.string()),
        removeIngredients: v.optional(v.array(v.string())),
      }),
    ),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { bookingId, items, note }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Please sign in to order.");
    const booking = await requireConfirmedBookingParticipant(ctx, userId, bookingId);

    // Zod: non-empty order, ≤50 lines, integer quantities 1–20, capped notes.
    parseOrThrow(placeOrderSchema, { items, note });

    // load + validate every menu item against THIS restaurant
    const menuItems = await Promise.all(
      items.map((i) => ctx.db.get(i.menuItemId)),
    );
    const lineItems: {
      menuItemId?: Id<"menuItems">;
      name: string;
      priceCents: number;
      quantity: number;
      note?: string;
      ingredients?: string[];
      removeIngredients?: string[];
    }[] = [];
    let totalCents = 0;
    for (let i = 0; i < items.length; i++) {
      const item = menuItems[i];
      if (!item) throw new Error("A menu item no longer exists — refresh and try again.");
      if (item.restaurantId !== booking.restaurantId) {
        throw new Error("That item isn't on this restaurant's menu.");
      }
      if (!item.available) throw new Error(`"${item.name}" is currently unavailable.`);
      const qty = items[i]!.quantity;
      const removed = sanitizeRemovals(items[i]!.removeIngredients, item.ingredients, item.name);
      lineItems.push({
        menuItemId: item._id,
        name: item.name,
        priceCents: item.priceCents,
        quantity: qty,
        note: items[i]!.note?.trim().slice(0, 120) || undefined,
        ingredients: item.ingredients && item.ingredients.length > 0 ? item.ingredients : undefined,
        removeIngredients: removed.length > 0 ? removed : undefined,
      });
      totalCents += item.priceCents * qty;
    }

    const now = Date.now();
    const orderId = await ctx.db.insert("dineOrders", {
      bookingId: booking._id,
      restaurantId: booking.restaurantId,
      userId,
      items: lineItems,
      totalCents,
      status: "open",
      note: note?.trim().slice(0, 300) || undefined,
      createdAt: now,
      updatedAt: now,
    });
    // owner notification: "new_order · 2× Carbonara, 1× Tiramisù"
    const summary = lineItems.map((l) => `${l.quantity}× ${l.name}`).join(", ");
    await notifyRestaurant(ctx, {
      restaurantId: booking.restaurantId,
      bookingId: booking._id,
      userId,
      type: "new_order",
      message: summary.slice(0, 300),
    });
    return await ctx.db.get(orderId);
  },
});

/** The diner's own orders (optionally filtered to one booking). */
export const myOrders = query({
  args: { bookingId: v.optional(v.id("bookings")) },
  handler: async (ctx, { bookingId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    let orders;
    if (bookingId) {
      orders = await ctx.db
        .query("dineOrders")
        .withIndex("by_booking", (q) => q.eq("bookingId", bookingId))
        .collect();
    } else {
      orders = await ctx.db.query("dineOrders").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    }
    return orders
      .filter((o) => o.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Owner view: every dine-in order for the restaurant, with diner + booking. */
export const restaurantOrders = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, { restaurantId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    if (!(await isOwnerOf(ctx, userId, restaurantId))) return [];
    const orders = await ctx.db
      .query("dineOrders")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect();
    const [diners, bookings] = await Promise.all([
      Promise.all(orders.map((o) => safeGet<Doc<"users">>(ctx, o.userId))),
      Promise.all(orders.map((o) => safeGet<Doc<"bookings">>(ctx, o.bookingId))),
    ]);
    return orders
      .map((o, i) => ({
        ...o,
        dinerName: diners[i]?.name ?? "Guest",
        booking: bookings[i]
          ? {
              _id: bookings[i]!._id,
              code: bookings[i]!.code,
              date: bookings[i]!.date,
              time: bookings[i]!.time,
              partySize: bookings[i]!.partySize,
              name: bookings[i]!.name,
            }
          : null,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Owner drives the kitchen: open → preparing → served → completed. */
export const updateOrderStatus = mutation({
  args: {
    orderId: v.id("dineOrders"),
    status: ORDER_STATUS,
  },
  handler: async (ctx, { orderId, status }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const order = await ctx.db.get(orderId);
    if (!order) throw new Error("Order not found.");
    if (!(await isOwnerOf(ctx, userId, order.restaurantId))) {
      throw new Error("Only the restaurant owner can update orders.");
    }
    await ctx.db.patch(orderId, { status, updatedAt: Date.now() });
    return await ctx.db.get(orderId);
  },
});

/** Diner cancels their own order while it's still open (owner can too). */
export const cancelOrder = mutation({
  args: { orderId: v.id("dineOrders") },
  handler: async (ctx, { orderId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const order = await ctx.db.get(orderId);
    if (!order) throw new Error("Order not found.");
    const isOwner = await isOwnerOf(ctx, userId, order.restaurantId);
    if (order.userId !== userId && !isOwner) throw new Error("You cannot cancel this order.");
    if (order.status !== "open") {
      throw new Error("This order is already being prepared — ask the team to cancel it.");
    }
    await ctx.db.patch(orderId, { status: "cancelled", updatedAt: Date.now() });
    return await ctx.db.get(orderId);
  },
});

/**
 * The saved bill for a booking: line items aggregated from every non-cancelled
 * order, plus any Socialize gifts the diner sent to others (charged to this
 * booking's bill). Customised lines (e.g. "Carbonara — no pecorino") are
 * grouped separately from the plain version. Payment (cards/wallets) is wired
 * later — for now the bill is shown to the diner and the restaurant, and the
 * total is stored.
 */
export const billForBooking = query({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, { bookingId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const booking = await ctx.db.get(bookingId);
    if (!booking) throw new Error("Booking not found.");
    const isOwner = await isOwnerOf(ctx, userId, booking.restaurantId);
    if (booking.userId !== userId && !isOwner) throw new Error("Not allowed.");

    const orders = await ctx.db
      .query("dineOrders")
      .withIndex("by_booking", (q) => q.eq("bookingId", bookingId))
      .collect();
    const billable = orders.filter((o) => o.status !== "cancelled");

    // aggregate identical lines across orders into one bill row; a different
    // price or customization (removals/note) makes it a distinct row
    const linesMap = new Map<
      string,
      {
        _rowId: string;
        name: string;
        quantity: number;
        priceCents: number;
        removeIngredients?: string[];
        note?: string;
        isGift?: boolean;
      }
    >();
    let totalCents = 0;
    for (const o of billable) {
      for (const line of o.items) {
        const removed = line.removeIngredients ?? [];
        // M-2: the key must include priceCents — otherwise a dish repriced
        // between orders merges rows whose Σ(lineTotal) ≠ totalCents.
        const key = `${line.name.toLowerCase()}|${line.priceCents}|${removed.slice().sort().join(",")}|${(line.note ?? "").toLowerCase()}`;
        const existing = linesMap.get(key);
        if (existing) {
          existing.quantity += line.quantity;
        } else {
          linesMap.set(key, {
            _rowId: `order:${key}`,
            name: line.name,
            quantity: line.quantity,
            priceCents: line.priceCents,
            removeIngredients: removed.length > 0 ? removed : undefined,
            note: line.note,
          });
        }
        totalCents += line.priceCents * line.quantity;
      }
    }

    // Socialize gifts the diner sent from this table land on their bill too.
    const gifts = await ctx.db
      .query("giftDeliveries")
      .withIndex("by_booking", (q) => q.eq("bookingId", bookingId))
      .collect();
    const billableGifts = gifts.filter((g) => g.status !== "cancelled");
    const senders = await Promise.all(
      billableGifts.map((g) => safeGet<Doc<"users">>(ctx, g.senderUserId)),
    );
    for (let i = 0; i < billableGifts.length; i++) {
      const g = billableGifts[i]!;
      const senderName = senders[i]?.name ?? "Guest";
      linesMap.set(`gift|${g._id}`, {
        _rowId: g._id,
        name: `${g.emoji} ${g.name}`,
        quantity: 1,
        priceCents: g.priceCents,
        note: `Gift from ${senderName}`,
        isGift: true,
      });
      totalCents += g.priceCents;
    }

    const lines = [...linesMap.values()]
      .map((l) => ({ ...l, lineTotal: l.priceCents * l.quantity }))
      .sort((a, b) => b.lineTotal - a.lineTotal);

    // Per-user breakdown: group orders and gifts by userId
    const userBreakdown = new Map<
      string,
      {
        userId: string;
        name: string;
        orderCount: number;
        subtotalCents: number;
      }
    >();

    for (const order of billable) {
      const existing = userBreakdown.get(order.userId);
      if (existing) {
        existing.orderCount++;
        existing.subtotalCents += order.totalCents;
      } else {
        const user = await safeGet<Doc<"users">>(ctx, order.userId);
        userBreakdown.set(order.userId, {
          userId: order.userId,
          name: user?.name ?? "Guest",
          orderCount: 1,
          subtotalCents: order.totalCents,
        });
      }
    }

    // Add gifts sent by each user to their share
    for (const gift of billableGifts) {
      const existing = userBreakdown.get(gift.senderUserId);
      if (existing) {
        existing.subtotalCents += gift.priceCents;
      } else {
        const user = await safeGet<Doc<"users">>(ctx, gift.senderUserId);
        userBreakdown.set(gift.senderUserId, {
          userId: gift.senderUserId,
          name: user?.name ?? "Guest",
          orderCount: 0,
          subtotalCents: gift.priceCents,
        });
      }
    }

    const breakdown = [...userBreakdown.values()]
      .map((b) => ({ ...b }))
      .sort((a, b) => b.subtotalCents - a.subtotalCents);

    return {
      bookingId,
      restaurantId: booking.restaurantId,
      lines,
      totalCents,
      orderCount: billable.length,
      orders,
      breakdown, // Per-user split
      paid: false, // payments arrive in a later milestone
    };
  },
});

/**
 * The current user's share of the bill for a specific booking.
 * Returns only their orders and gifts they sent.
 */
export const myBillShare = query({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, { bookingId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Please sign in.");

    const booking = await ctx.db.get(bookingId);
    if (!booking) throw new Error("Booking not found.");

    // Verify participant
    const isHost = booking.userId === userId;
    const guests = booking.guests ?? [];
    const isGuest = guests.some((g) => g.userId === userId);
    if (!isHost && !isGuest) throw new Error("Not part of this booking.");

    // Get my orders for this booking
    const myOrders = await ctx.db
      .query("dineOrders")
      .withIndex("by_booking", (q) => q.eq("bookingId", bookingId))
      .collect();

    const myBillable = myOrders.filter(
      (o) => o.userId === userId && o.status !== "cancelled",
    );

    // Get gifts I sent from this booking
    const myGifts = await ctx.db
      .query("giftDeliveries")
      .withIndex("by_booking", (q) => q.eq("bookingId", bookingId))
      .collect();

    const myBillableGifts = myGifts.filter(
      (g) => g.senderUserId === userId && g.status !== "cancelled",
    );

    const ordersTotal = myBillable.reduce((sum, o) => sum + o.totalCents, 0);
    const giftsTotal = myBillableGifts.reduce((sum, g) => sum + g.priceCents, 0);

    return {
      bookingId,
      userId,
      orders: myBillable,
      gifts: myBillableGifts,
      ordersTotalCents: ordersTotal,
      giftsTotalCents: giftsTotal,
      subtotalCents: ordersTotal + giftsTotal,
    };
  },
});

// ---------------------------------------------------------------------------
// assist pings ("call the waiter")
// ---------------------------------------------------------------------------

/** Diner pings the waiter/manager with a ready-made template (+ optional note). */
export const sendAssist = mutation({
  args: {
    bookingId: v.id("bookings"),
    template: ASSIST_TEMPLATE,
    note: v.optional(v.string()),
  },
  handler: async (ctx, { bookingId, template, note }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Please sign in.");
    const booking = await requireConfirmedBookingParticipant(ctx, userId, bookingId);
    parseOrThrow(assistNoteSchema, { note });

    const id = await ctx.db.insert("assistRequests", {
      bookingId: booking._id,
      restaurantId: booking.restaurantId,
      userId,
      template,
      note: note?.trim().slice(0, 300) || undefined,
      status: "open",
      createdAt: Date.now(),
    });
    await notifyRestaurant(ctx, {
      restaurantId: booking.restaurantId,
      bookingId: booking._id,
      userId,
      type: "assist_request",
      message: `${ASSIST_LABEL[template] ?? template}${
        note?.trim() ? ` — ${note.trim().slice(0, 240)}` : ""
      }`,
    });
    return await ctx.db.get(id);
  },
});

/** The diner's own pings (optionally filtered to one booking). */
export const myAssists = query({
  args: { bookingId: v.optional(v.id("bookings")) },
  handler: async (ctx, { bookingId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    let items;
    if (bookingId) {
      items = await ctx.db
        .query("assistRequests")
        .withIndex("by_booking", (q) => q.eq("bookingId", bookingId))
        .collect();
    } else {
      items = await ctx.db
        .query("assistRequests")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
    }
    return items
      .filter((a) => a.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Owner view: every ping for the restaurant, newest first. */
export const restaurantAssists = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, { restaurantId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    if (!(await isOwnerOf(ctx, userId, restaurantId))) return [];
    const items = await ctx.db
      .query("assistRequests")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect();
    const [diners, bookings] = await Promise.all([
      Promise.all(items.map((a) => safeGet<Doc<"users">>(ctx, a.userId))),
      Promise.all(items.map((a) => safeGet<Doc<"bookings">>(ctx, a.bookingId))),
    ]);
    return items
      .map((a, i) => ({
        ...a,
        dinerName: diners[i]?.name ?? "Guest",
        booking: bookings[i]
          ? {
              _id: bookings[i]!._id,
              code: bookings[i]!.code,
              date: bookings[i]!.date,
              time: bookings[i]!.time,
              partySize: bookings[i]!.partySize,
              name: bookings[i]!.name,
            }
          : null,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Owner marks a ping as resolved. */
export const resolveAssist = mutation({
  args: { id: v.id("assistRequests") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const req = await ctx.db.get(id);
    if (!req) throw new Error("Request not found.");
    if (!(await isOwnerOf(ctx, userId, req.restaurantId))) {
      throw new Error("Only the restaurant owner can resolve requests.");
    }
    if (req.status !== "open") return req;
    await ctx.db.patch(id, { status: "resolved", resolvedAt: Date.now() });
    return await ctx.db.get(id);
  },
});

/** Diner cancels their own open ping (e.g. they found the waiter). */
export const cancelAssist = mutation({
  args: { id: v.id("assistRequests") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const req = await ctx.db.get(id);
    if (!req || req.userId !== userId) throw new Error("Request not found.");
    if (req.status !== "open") return req;
    await ctx.db.patch(id, { status: "cancelled" });
    return await ctx.db.get(id);
  },
});

// ---------------------------------------------------------------------------
// off-menu requests ("can you make me something not on the menu?")
// ---------------------------------------------------------------------------

/** Diner asks for something not on the menu — the owner reviews it live. */
export const createMenuRequest = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    bookingId: v.optional(v.id("bookings")),
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, { restaurantId, bookingId, name, description }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Please sign in.");
    parseOrThrow(menuRequestSchema, { name, description });
    const restaurant = await ctx.db.get(restaurantId);
    if (!restaurant) throw new Error("Restaurant not found.");
    const cleanName = name.trim().slice(0, 100);

    if (bookingId) {
      const booking = await ctx.db.get(bookingId);
      if (!booking || booking.userId !== userId) throw new Error("Booking not found.");
      if (booking.restaurantId !== restaurantId) {
        throw new Error("That booking isn't at this restaurant.");
      }
    }

    const now = Date.now();
    const id = await ctx.db.insert("menuRequests", {
      restaurantId,
      userId,
      ...(bookingId ? { bookingId } : {}),
      name: cleanName,
      description: description?.trim().slice(0, 400) || undefined,
      status: "new",
      createdAt: now,
      updatedAt: now,
    });
    await notifyRestaurant(ctx, {
      restaurantId,
      bookingId,
      userId,
      type: "menu_request",
      message: `${cleanName}${description?.trim() ? ` — ${description.trim().slice(0, 240)}` : ""}`,
    });
    return await ctx.db.get(id);
  },
});

/** The diner's own off-menu requests. */
export const myMenuRequests = query({
  args: { restaurantId: v.optional(v.id("restaurants")) },
  handler: async (ctx, { restaurantId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const items = await ctx.db
      .query("menuRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return items
      .filter((m) => !restaurantId || m.restaurantId === restaurantId)
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Owner view: every off-menu request, newest first. */
export const restaurantMenuRequests = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, { restaurantId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    if (!(await isOwnerOf(ctx, userId, restaurantId))) return [];
    const items = await ctx.db
      .query("menuRequests")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect();
    const [diners, bookings] = await Promise.all([
      Promise.all(items.map((m) => (m.userId ? safeGet<Doc<"users">>(ctx, m.userId) : null))),
      Promise.all(items.map((m) => (m.bookingId ? safeGet<Doc<"bookings">>(ctx, m.bookingId) : null))),
    ]);
    return items
      .map((m, i) => ({
        ...m,
        dinerName: diners[i]?.name ?? "Guest",
        booking: bookings[i]
          ? {
              _id: bookings[i]!._id,
              code: bookings[i]!.code,
              date: bookings[i]!.date,
              time: bookings[i]!.time,
              partySize: bookings[i]!.partySize,
            }
          : null,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Owner manages the request lifecycle: new → in_progress → fulfilled/declined. */
export const updateMenuRequestStatus = mutation({
  args: {
    id: v.id("menuRequests"),
    status: MENU_REQUEST_STATUS,
  },
  handler: async (ctx, { id, status }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const req = await ctx.db.get(id);
    if (!req) throw new Error("Request not found.");
    if (!(await isOwnerOf(ctx, userId, req.restaurantId))) {
      throw new Error("Only the restaurant owner can manage requests.");
    }
    await ctx.db.patch(id, { status, updatedAt: Date.now() });
    return await ctx.db.get(id);
  },
});

// ---------------------------------------------------------------------------
// owner tab badges
// ---------------------------------------------------------------------------

/** Live open counts for the owner's Orders / Requests / Menu ideas tabs. */
export const openCounts = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, { restaurantId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { orders: 0, assists: 0, menuRequests: 0 };
    if (!(await isOwnerOf(ctx, userId, restaurantId))) return { orders: 0, assists: 0, menuRequests: 0 };
    const [orders, assists, menuRequests] = await Promise.all([
      ctx.db.query("dineOrders").withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId)).collect(),
      ctx.db.query("assistRequests").withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId)).collect(),
      ctx.db.query("menuRequests").withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId)).collect(),
    ]);
    return {
      orders: orders.filter((o) => o.status === "open" || o.status === "preparing").length,
      assists: assists.filter((a) => a.status === "open").length,
      menuRequests: menuRequests.filter((m) => m.status === "new" || m.status === "in_progress").length,
    };
  },
});
