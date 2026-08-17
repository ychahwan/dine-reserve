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

async function requireOwnConfirmedBooking(
  ctx: MutationCtx | QueryCtx,
  userId: string,
  bookingId: Id<"bookings">,
) {
  const booking = await ctx.db.get(bookingId);
  if (!booking || booking.userId !== userId) throw new Error("Booking not found.");
  if (booking.status !== "confirmed") throw new Error("This booking is no longer active.");
  if (booking.date < todayKey()) throw new Error("This booking is in the past.");
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
  ingredients: string[] |

[FILE_TOO_LARGE]: The combined read_files output exceeded the 100,000 character hard limit. This file was truncated after 1,986 characters. Read it separately or use code_search for the relevant section.