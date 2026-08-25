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

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/* ────────────────────────────────────────────
 * Helper: generate a short alphanumeric code
 * ──────────────────────────────────────────── */
function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/1/O/0
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
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
    const userId = (await ctx.auth.getUserIdentity())?.subject;
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

    // Create walk-in request
    const requestId = await ctx.db.insert("walkInRequests", {
      restaurantId: args.restaurantId,
      userId,
      name: args.name,
      partySize: args.partySize,
      tableNumber: args.tableNumber,
      source: "app_check_in",
      status: "pending",
      createdAt: Date.now(),
    });

    // Notify the restaurant owner
    await ctx.db.insert("notifications", {
      restaurantId: args.restaurantId,
      userId,
      type: "walk_in_request",
      message: `Walk-in request: ${args.name} (party of ${args.partySize}) at table ${args.tableNumber}`,
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
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) throw new Error("Not authenticated");

    if (args.partySize < 1 || args.partySize > 20) {
      throw new Error("Party size must be between 1 and 20");
    }

    // Validate table QR code exists and is active
    const qrCode = await ctx.db
      .query("tableQRCodes")
      .withIndex("by_restaurant_table", (q) =>
        q.eq("restaurantId", args.restaurantId).eq("tableNumber", args.tableNumber)
      )
      .first();

    if (qrCode && !qrCode.active) {
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

    const requestId = await ctx.db.insert("walkInRequests", {
      restaurantId: args.restaurantId,
      userId,
      name: args.name,
      partySize: args.partySize,
      tableNumber: args.tableNumber,
      source: "qr_scan",
      status: "pending",
      createdAt: Date.now(),
    });

    await ctx.db.insert("notifications", {
      restaurantId: args.restaurantId,
      userId,
      type: "walk_in_request",
      message: `QR walk-in: ${args.name} (party of ${args.partySize}) at table ${args.tableNumber}`,
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
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) throw new Error("Not authenticated");

    // Verify the user is the owner of this restaurant
    const restaurant = await ctx.db.get(args.restaurantId);
    if (!restaurant) throw new Error("Restaurant not found");
    if (restaurant.ownerId !== userId) throw new Error("Only the restaurant owner can create walk-in bookings");

    if (args.partySize < 1 || args.partySize > 20) {
      throw new Error("Party size must be between 1 and 20");
    }

    // Create a walk-in request with host-created source
    const requestId = await ctx.db.insert("walkInRequests", {
      restaurantId: args.restaurantId,
      userId, // the host's userId (they are the contact for this walk-in)
      name: args.dinerName,
      partySize: args.partySize,
      tableNumber: args.tableNumber,
      source: "host_created",
      status: "pending",
      createdAt: Date.now(),
    });

    // Create the booking immediately (host has authority)
    const today = new Date().toISOString().split("T")[0];
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const code = generateCode();

    const bookingId = await ctx.db.insert("bookings", {
      restaurantId: args.restaurantId,
      userId,
      name: args.dinerName,
      email: args.dinerEmail,
      phone: args.dinerPhone,
      date: today,
      time: timeStr,
      partySize: args.partySize,
      sectionId: args.sectionId,
      status: "confirmed",
      code,
      notes: args.notes,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      source: "host_created",
      walkInTable: args.tableNumber,
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
      message: `Walk-in booking created: ${args.dinerName} (party of ${args.partySize}) at table ${args.tableNumber}`,
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
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) throw new Error("Not authenticated");

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Walk-in request not found");
    if (request.status !== "pending") throw new Error("Request already processed");

    // Verify the user is the owner of this restaurant
    const restaurant = await ctx.db.get(request.restaurantId);
    if (!restaurant) throw new Error("Restaurant not found");
    if (restaurant.ownerId !== userId) throw new Error("Only the restaurant owner can approve walk-ins");

    // Create the booking
    const today = new Date().toISOString().split("T")[0];
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const code = generateCode();

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
    const userId = (await ctx.auth.getUserIdentity())?.subject;
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
    const userId = (await ctx.auth.getUserIdentity())?.subject;
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
    const userId = (await ctx.auth.getUserIdentity())?.subject;
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
    const userId = (await ctx.auth.getUserIdentity())?.subject;
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
