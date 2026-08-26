/**
 * Walk-in Feature — Allow diners without a booking to access app features
 *
 * Three entry points:
 *   Option A: walkInCheckIn     — Diner selects restaurant, enters table #, host approves
 *   Option B: scanTableQR       — Diner scans table QR code, host approves
 *   Option C: hostInitiatedWalkIn — Host creates booking on behalf of walk-in diner
 *
 * All paths converge: approval creates a booking with source: "walk_in" | "qr_scan" | "host_created"
 */

import { MutationCtx, mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { generateCode } from "./bookings";

/* ────────────────────────────────────────────
 * Helper: unique booking code (H-3). Reuses bookings' crypto-random
 * generator and retries against the by_code index, because the code is a
 * public capability — a collision would leak a stranger's booking via the
 * invite-link lookup.
 * ──────────────────────────────────────────── */
async function generateUniqueCode(ctx: MutationCtx): Promise<string> {
  let code = generateCode();
  while (true) {
    const clash = await ctx.db.query("bookings").withIndex("by_code", (q) => q.eq("code", code)).first();
    if (!clash) break;
    code = generateCode();
  }
  return code;
}

/* ────────────────────────────────────────────
 * Helper: single clock (L-7). Date AND time both come from UTC getters so the
 * day boundary can never disagree between the two fields.
 * ──────────────────────────────────────────── */
function nowUtc(): { date: string; time: string } {
  const now = new Date();
  return {
    date: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`,
    time: `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`,
  };
}

/* ────────────────────────────────────────────
 * Helper: atomic seat decrement for approved walk-ins (H-2). Mirrors
 * attemptBooking's serializable read-check-write on the slot ledger. A missing
 * or exhausted ledger row is tolerated (the party is physically seated either
 * way, and cancel paths never restore walk-in seats), so this can only ever
 * under-count availability — never mint phantom seats.
 * ──────────────────────────────────────────── */
async function decrementLedgerForWalkIn(
  ctx: MutationCtx,
  opts: { restaurantId: Id<"restaurants">; date: string; time: string; partySize: number; sectionId?: Id<"sections"> },
): Promise<void> {
  const slots = await ctx.db
    .query("slots")
    .withIndex("by_restaurant_date", (q) => q.eq("restaurantId", opts.restaurantId).eq("date", opts.date))
    .collect();
  const matches = slots.filter(
    (s) => s.time === opts.time && !s.closed && (!opts.sectionId || s.sectionId === opts.sectionId),
  );
  // duplicates are benign: treat the doc with most remaining as canonical
  const slot = matches.reduce<null | (typeof matches)[number]>(
    (best, s) => (!best || best.remaining < s.remaining ? s : best),
    null,
  );
  if (slot && slot.remaining >= opts.partySize) {
    await ctx.db.patch(slot._id, { remaining: slot.remaining - opts.partySize });
  }
}

/* ════════════════════════════════════════════
 * Option A — Walk-In Check-In (Diner app flow)
 *
 * 1. Diner opens app → taps "I'm here" / "Walk-in"
 * 2. Selects restaurant from search
 * 3. Enters table number (shown on the table)
 * 4. Host gets a notification to approve
 * 5. Once approved, a booking is created instantly
 * ════════════════════════════════════════════ */
export const walkInCheckIn = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    tableNumber: v.string(),
    partySize: v.number(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Validate party size
    if (args.partySize < 1 || args.partySize > 20) {
      throw new Error("Party size must be between 1 and 20");
    }

    // Check restaurant exists
    const restaurant = await ctx.db.get(args.restaurantId);
    if (!restaurant || restaurant.disabled) {
      throw new Error("Restaurant not found or unavailable");
    }

    // Check for duplicate pending request (one per user per restaurant)
    const existing = await ctx.db
      .query("walkInRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) =>
        q.and(
          q.eq(q.field("restaurantId"), args.restaurantId),
          q.eq(q.field("status"), "pending")
        )
      )
      .first();
    if (existing) {
      throw new Error("You already have a pending walk-in request at this restaurant");
    }

    // Sanitized free-text (M-8): trim + length caps like every other writer.
    const name = args.name.trim().slice(0, 80);
    const tableNumber = args.tableNumber.trim().slice(0, 20);

    // Create walk-in request
    const requestId = await ctx.db.insert("walkInRequests", {
      restaurantId: args.restaurantId,
      userId,
      name,
      partySize: args.partySize,
      tableNumber,
      source: "app_check_in",
      status: "pending",
      createdAt: Date.now(),
    });

    // Notify the restaurant owner
    await ctx.db.insert("notifications", {
      restaurantId: args.restaurantId,
      userId,
      type: "walk_in_request",
      message: `Walk-in request: ${name} (party of ${args.partySize}) at table ${tableNumber}`,
      read: false,
      createdAt: Date.now(),
    });

    return { requestId, status: "pending" as const };
  },
});

/* ════════════════════════════════════════════
 * Option B — Scan Table QR Code
 *
 * 1. Diner scans QR code on the table
 * 2. QR encodes restaurantId + tableNumber
 * 3. App detects walk-in flow (no existing booking)
 * 4. Same approval flow as Option A
 * ════════════════════════════════════════════ */
export const scanTableQR = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    tableNumber: v.string(),
    partySize: v.number(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    if (args.partySize < 1 || args.partySize > 20) {
      throw new Error("Party size must be between 1 and 20");
    }

    // Validate table QR code exists and is active (L-6: a fabricated table
    // with no QR row must be rejected just like an inactive one).
    const qrCode = await ctx.db
      .query("tableQRCodes")
      .withIndex("by_restaurant_table", (q) =>
        q.eq("restaurantId", args.restaurantId).eq("tableNumber", args.tableNumber)
      )
      .first();

    if (!qrCode || !qrCode.active) {
      throw new Error("This table is not available for walk-in check-in");
    }

    // Check restaurant exists
    const restaurant = await ctx.db.get(args.restaurantId);
    if (!restaurant || restaurant.disabled) {
      throw new Error("Restaurant not found or unavailable");
    }

    // Check for duplicate pending request
    const existing = await ctx.db
      .query("walkInRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) =>
        q.and(
          q.eq(q.field("restaurantId"), args.restaurantId),
          q.eq(q.field("status"), "pending")
        )
      )
      .first();
    if (existing) {
      throw new Error("You already have a pending walk-in request at this restaurant");
    }

    // Sanitized free-text (M-8).
    const name = args.name.trim().slice(0, 80);
    const tableNumber = args.tableNumber.trim().slice(0, 20);

    const requestId = await ctx.db.insert("walkInRequests", {
      restaurantId: args.restaurantId,
      userId,
      name,
      partySize: args.partySize,
      tableNumber,
      source: "qr_scan",
      status: "pending",
      createdAt: Date.now(),
    });

    await ctx.db.insert("notifications", {
      restaurantId: args.restaurantId,
      userId,
      type: "walk_in_request",
      message: `QR walk-in: ${name} (party of ${args.partySize}) at table ${tableNumber}`,
      read: false,
      createdAt: Date.now(),
    });

    return { requestId, status: "pending" as const };
  },
});

/* ════════════════════════════════════════════
 * Option C — Host-Initiated Walk-In
 *
 * 1. Host sees a walk-in at the door
 * 2. Host creates a booking from the admin dashboard
 * 3. Walk-in gets a code via SMS or QR on host's screen
 * 4. Walk-in enters code in app → booking activated
 * ════════════════════════════════════════════ */
export const hostInitiatedWalkIn = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    dinerName: v.string(),
    dinerPhone: v.optional(v.string()),
    dinerEmail: v.optional(v.string()),
    partySize: v.number(),
    tableNumber: v.string(),
    sectionId: v.optional(v.id("sections")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Verify the user is the owner of this restaurant
    const restaurant = await ctx.db.get(args.restaurantId);
    if (!restaurant) throw new Error("Restaurant not found");
    if (restaurant.ownerId !== userId) throw new Error("Only the restaurant owner can create walk-in bookings");
    // Disabled venues accept no new business, walk-ins included (H-2).
    if (restaurant.disabled) throw new Error("This restaurant is currently unavailable.");

    if (args.partySize < 1 || args.partySize > 20) {
      throw new Error("Party size must be between 1 and 20");
    }

    // Sanitized free-text (M-8).
    const dinerName = args.dinerName.trim().slice(0, 80);
    const tableNumber = args.tableNumber.trim().slice(0, 20);
    const notes = args.notes?.trim().slice(0, 300) || undefined;
    const dinerEmail = args.dinerEmail?.trim().slice(0, 120) || undefined;
    const dinerPhone = args.dinerPhone?.trim().slice(0, 20) || undefined;

    // Create a walk-in request with host-created source
    const requestId = await ctx.db.insert("walkInRequests", {
      restaurantId: args.restaurantId,
      userId, // the host's userId (they are the contact for this walk-in)
      name: dinerName,
      partySize: args.partySize,
      tableNumber,
      source: "host_created",
      status: "pending",
      createdAt: Date.now(),
    });

    // Create the booking immediately (host has authority)
    const { date: today, time: timeStr } = nowUtc();
    const code = await generateUniqueCode(ctx);

    const bookingId = await ctx.db.insert("bookings", {
      restaurantId: args.restaurantId,
      userId,
      name: dinerName,
      email: dinerEmail,
      phone: dinerPhone,
      date: today,
      time: timeStr,
      partySize: args.partySize,
      sectionId: args.sectionId,
      status: "confirmed",
      code,
      notes,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      source: "host_created",
      walkInTable: tableNumber,
    });

    // H-2: take the seats from the slot ledger like any other booking.
    await decrementLedgerForWalkIn(ctx, {
      restaurantId: args.restaurantId,
      date: today,
      time: timeStr,
      partySize: args.partySize,
      sectionId: args.sectionId,
    });

    // Update the walk-in request with the booking
    await ctx.db.patch(requestId, {
      status: "approved",
      bookingId,
      processedAt: Date.now(),
      processedBy: userId,
    });

    // Notify the restaurant
    await ctx.db.insert("notifications", {
      restaurantId: args.restaurantId,
      userId,
      type: "booking_created",
      bookingId,
      message: `Walk-in booking created: ${dinerName} (party of ${args.partySize}) at table ${tableNumber}`,
      read: false,
      createdAt: Date.now(),
    });

    return { requestId, bookingId, code, status: "approved" as const };
  },
});

/* ════════════════════════════════════════════
 * Approve Walk-In (Host action)
 *
 * Host approves a pending walk-in request.
 * Creates a booking and notifies the diner.
 * ════════════════════════════════════════════ */
export const approveWalkIn = mutation({
  args: {
    requestId: v.id("walkInRequests"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Walk-in request not found");
    if (request.status !== "pending") throw new Error("Request already processed");

    // Verify the user is the owner of this restaurant
    const restaurant = await ctx.db.get(request.restaurantId);
    if (!restaurant) throw new Error("Restaurant not found");
    if (restaurant.ownerId !== userId) throw new Error("Only the restaurant owner can approve walk-ins");
    // Disabled venues accept no new business, walk-ins included (H-2).
    if (restaurant.disabled) throw new Error("This restaurant is currently unavailable.");

    // Create the booking
    const { date: today, time: timeStr } = nowUtc();
    const code = await generateUniqueCode(ctx);

    const bookingId = await ctx.db.insert("bookings", {
      restaurantId: request.restaurantId,
      userId: request.userId,
      name: request.name,
      date: today,
      time: timeStr,
      partySize: request.partySize,
      status: "confirmed",
      code,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      source: request.source === "qr_scan" ? "qr_scan" : "walk_in",
      walkInTable: request.tableNumber,
    });

    // H-2: take the seats from the slot ledger like any other booking.
    await decrementLedgerForWalkIn(ctx, {
      restaurantId: request.restaurantId,
      date: today,
      time: timeStr,
      partySize: request.partySize,
    });

    // Update the walk-in request
    await ctx.db.patch(args.requestId, {
      status: "approved",
      bookingId,
      processedAt: Date.now(),
      processedBy: userId,
    });

    // Notify the diner
    await ctx.db.insert("notifications", {
      restaurantId: request.restaurantId,
      userId: request.userId,
      type: "walk_in_approved",
      bookingId,
      message: `Your walk-in request at ${restaurant.name} has been approved! Table ${request.tableNumber}`,
      read: false,
      createdAt: Date.now(),
    });

    return { bookingId, code, status: "approved" as const };
  },
});

/* ════════════════════════════════════════════
 * Reject Walk-In (Host action)
 * ════════════════════════════════════════════ */
export const rejectWalkIn = mutation({
  args: {
    requestId: v.id("walkInRequests"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Walk-in request not found");
    if (request.status !== "pending") throw new Error("Request already processed");

    const restaurant = await ctx.db.get(request.restaurantId);
    if (!restaurant) throw new Error("Restaurant not found");
    if (restaurant.ownerId !== userId) throw new Error("Only the restaurant owner can reject walk-ins");

    await ctx.db.patch(args.requestId, {
      status: "rejected",
      processedAt: Date.now(),
      processedBy: userId,
      rejectReason: args.reason,
    });

    // Notify the diner
    await ctx.db.insert("notifications", {
      restaurantId: request.restaurantId,
      userId: request.userId,
      type: "walk_in_rejected",
      message: `Your walk-in request at ${restaurant.name} was declined${args.reason ? `: ${args.reason}` : ""}`,
      read: false,
      createdAt: Date.now(),
    });

    return { status: "rejected" as const };
  },
});

/* ════════════════════════════════════════════
 * Query: List pending walk-in requests for a restaurant
 * ════════════════════════════════════════════ */
export const pendingWalkIns = query({
  args: {
    restaurantId: v.id("restaurants"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const restaurant = await ctx.db.get(args.restaurantId);
    if (!restaurant || restaurant.ownerId !== userId) {
      throw new Error("Unauthorized");
    }

    const requests = await ctx.db
      .query("walkInRequests")
      .withIndex("by_restaurant_status", (q) =>
        q.eq("restaurantId", args.restaurantId).eq("status", "pending")
      )
      .order("desc")
      .collect();

    // Enrich with user names
    const enriched = await Promise.all(
      requests.map(async (req) => {
        const user = await ctx.db.get(req.userId);
        return {
          ...req,
          userName: user?.name || req.name,
        };
      })
    );

    return enriched;
  },
});

/* ════════════════════════════════════════════
 * Query: Get walk-in request status (for diner)
 * ════════════════════════════════════════════ */
export const myWalkInStatus = query({
  args: {
    restaurantId: v.id("restaurants"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const request = await ctx.db
      .query("walkInRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) =>
        q.and(
          q.eq(q.field("restaurantId"), args.restaurantId),
          q.eq(q.field("status"), "pending")
        )
      )
      .first();

    return request;
  },
});

/* ════════════════════════════════════════════
 * Query: Get the caller's latest walk-in request for a restaurant regardless
 * of status (pending / approved / rejected) — lets the diner UI react once the
 * host decides instead of staring at "waiting" forever.
 * Returns null when signed out or when no request exists.
 * ════════════════════════════════════════════ */
export const myLatestWalkIn = query({
  args: {
    restaurantId: v.id("restaurants"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const requests = await ctx.db
      .query("walkInRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId as Id<"users">))
      .collect();

    const latest = requests
      .filter((r) => r.restaurantId === args.restaurantId)
      .sort((a, b) => b.createdAt - a.createdAt)[0];

    return latest ?? null;
  },
});

/* ════════════════════════════════════════════
 * Query: Get all walk-in history for a restaurant
 * ════════════════════════════════════════════ */
export const walkInHistory = query({
  args: {
    restaurantId: v.id("restaurants"),
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
    )),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const restaurant = await ctx.db.get(args.restaurantId);
    if (!restaurant || restaurant.ownerId !== userId) {
      throw new Error("Unauthorized");
    }

    let query = ctx.db
      .query("walkInRequests")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", args.restaurantId));

    if (args.status) {
      query = ctx.db
        .query("walkInRequests")
        .withIndex("by_restaurant_status", (q) =>
          q.eq("restaurantId", args.restaurantId).eq("status", args.status!)
        );
    }

    return await query.order("desc").collect();
  },
});
