import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ROLES, SEAT_KIND, DINING_PREFS } from "./schema";

/**
 * Get the current signed in user. Returns null if the user is not signed in.
 * Usage: const signedInUser = await ctx.runQuery(api.authHelpers.currentUser);
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return await ctx.db.get(userId);
  },
});

/**
 * First-run onboarding: choose a role (customer / owner) and capture
 * name + phone (phone is used for SMS booking confirmations).
 */
export const onboard = mutation({
  args: {
    role: v.union(v.literal(ROLES.CUSTOMER), v.literal(ROLES.OWNER)),
    name: v.string(),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const cleanName = args.name.trim().slice(0, 80);
    if (!cleanName) throw new Error("Please tell us your name.");
    const cleanPhone = args.phone?.trim().slice(0, 20) || undefined;

    await ctx.db.patch(userId, {
      role: args.role,
      name: cleanName,
      phone: cleanPhone,
      onboarded: true,
    });
    return await ctx.db.get(userId);
  },
});

/** Update profile (name / phone / dining preferences). Keeps existing role. */
export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    prefs: v.optional(DINING_PREFS),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const patch: { name?: string; phone?: string; prefs?: unknown } = {};
    if (args.name !== undefined) {
      const clean = args.name.trim().slice(0, 80);
      if (!clean) throw new Error("Name cannot be empty.");
      patch.name = clean;
    }
    if (args.phone !== undefined) {
      patch.phone = args.phone.trim().slice(0, 20) || undefined;
    }
    if (args.prefs !== undefined) {
      // sanitize: dedupe + cap each list so the profile stays tidy
      patch.prefs = {
        dietary: [...new Set(args.prefs.dietary)].slice(0, 12),
        seating: [...new Set(args.prefs.seating)].slice(0, 3),
        occasions: [...new Set(args.prefs.occasions)].slice(0, 6),
      };
    }
    await ctx.db.patch(userId, patch);
    return await ctx.db.get(userId);
  },
});

/** Add or remove a restaurant from the diner's favorites. */
export const toggleFavorite = mutation({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, { restaurantId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const restaurant = await ctx.db.get(restaurantId);
    if (!restaurant) throw new Error("Restaurant not found.");

    const user = await ctx.db.get(userId);
    const favorites = user?.favorites ?? [];
    if (favorites.includes(restaurantId)) {
      await ctx.db.patch(userId, {
        favorites: favorites.filter((id) => id !== restaurantId),
      });
      return { favorited: false };
    }
    const next = [...favorites, restaurantId].slice(-50);
    await ctx.db.patch(userId, { favorites: next });
    return { favorited: true };
  },
});

/** Restaurants the current user has saved, with a live snapshot each. */
export const myFavorites = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const user = await ctx.db.get(userId);
    const ids = user?.favorites ?? [];
    const out = [];
    for (const id of ids) {
      const r = await ctx.db.get(id);
      if (r) out.push(r);
    }
    return out;
  },
});
