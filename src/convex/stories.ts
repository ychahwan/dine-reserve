import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { safeGet } from "./helpers";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function isOwnerOf(
  ctx: MutationCtx | QueryCtx,
  userId: string,
  restaurantId: Id<"restaurants">,
): Promise<boolean> {
  const restaurant = await ctx.db.get(restaurantId);
  return !!restaurant && restaurant.ownerId === userId;
}

// ---------------------------------------------------------------------------
// owner side
// ---------------------------------------------------------------------------

/**
 * Owner publishes a short story about their restaurant (a new dish, a chef's
 * special, an event night). Text is capped at 240 chars + an optional emoji.
 */
export const post = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    text: v.string(),
    emoji: v.optional(v.string()),
  },
  handler: async (ctx, { restaurantId, text, emoji }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    if (!(await isOwnerOf(ctx, userId, restaurantId))) {
      throw new Error("Only the restaurant owner can post stories.");
    }
    const clean = text.trim().slice(0, 240);
    if (!clean) throw new Error("Write something first.");
    const id = await ctx.db.insert("stories", {
      restaurantId,
      text: clean,
      emoji: emoji?.trim().slice(0, 4) || undefined,
      createdAt: Date.now(),
    });
    // Idea #4: notify diners who saved this restaurant (fire-and-forget)
    await ctx.scheduler.runAfter(0, internal.dinerNotify.onStoryPosted, { storyId: id });
    return await ctx.db.get(id);
  },
});

/** Owner removes one of their own stories. */
export const remove = mutation({
  args: { id: v.id("stories") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const story = await ctx.db.get(id);
    if (!story) throw new Error("Story not found.");
    if (!(await isOwnerOf(ctx, userId, story.restaurantId))) {
      throw new Error("Only the restaurant owner can remove stories.");
    }
    await ctx.db.delete(id);
    return { deleted: true };
  },
});

/** Owner view: their restaurant's stories, newest first. */
export const mine = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, { restaurantId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    if (!(await isOwnerOf(ctx, userId, restaurantId))) return [];
    const stories = await ctx.db
      .query("stories")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect();
    return stories.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// ---------------------------------------------------------------------------
// public / diner side
// ---------------------------------------------------------------------------

/**
 * Recent stories across all restaurants for the Explore feed. Each story is
 * joined with a compact restaurant card (name, image, cuisine). Public —
 * stories are marketing content, not private data.
 */
export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const stories = await ctx.db.query("stories").withIndex("by_created", (q) => q.gte("createdAt", Date.now() - 30 * 24 * 3600_000)).collect();
    const capped = stories.sort((a, b) => b.createdAt - a.createdAt).slice(0, Math.min(limit ?? 20, 50));
    const restaurants = await Promise.all(
      capped.map((s) => safeGet<Doc<"restaurants">>(ctx, s.restaurantId)),
    );
    return capped
      .map((s, i) => {
        const r = restaurants[i];
        return {
          _id: s._id,
          text: s.text,
          emoji: s.emoji,
          createdAt: s.createdAt,
          restaurant: r
            ? {
                _id: r._id,
                name: r.name,
                imageUrl: r.imageUrl,
                cuisine: r.cuisine,
                city: r.city,
              }
            : null,
        };
      })
      .filter((s) => s.restaurant !== null);
  },
});

/** A single restaurant's stories (restaurant detail page). */
export const forRestaurant = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, { restaurantId }) => {
    const stories = await ctx.db
      .query("stories")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect();
    return stories.sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
  },
});
