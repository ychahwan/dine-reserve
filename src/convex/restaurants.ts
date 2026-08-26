import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, MutationCtx, query, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { FEATURES, SEAT_KIND } from "./schema";
import { safeGet } from "./helpers";
import { cascadeDeleteRestaurant } from "./erasure";
import {
  cancellationPolicySchema,
  hoursSchema,
  menuArgsSchema,
  menuItemArgsSchema,
  menuItemUpdateSchema,
  parseOrThrow,
  restaurantArgsSchema,
  sectionArgsSchema,
} from "./validation";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

type SpiceLevel = "mild" | "medium" | "hot" | "very_hot";
const SPICE_VALUES: SpiceLevel[] = ["mild", "medium", "hot", "very_hot"];

const MAX_TAGS = 12;
const MAX_TAG_LEN = 40;

/** Trim, dedupe, and cap an attribute list (tags / allergens / ingredients). */
function sanitizeTags(tags?: string[]): string[] | undefined {
  if (tags === undefined) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim().slice(0, MAX_TAG_LEN);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

async function deleteItemImage(ctx: MutationCtx, item: { imageStorageId?: Id<"_storage"> }) {
  if (!item.imageStorageId) return;
  try {
    await ctx.storage.delete(item.imageStorageId);
  } catch {
    // best-effort cleanup; never block the mutation on storage errors
  }
}

function buildSearchText(restaurant: {
  name: string;
  cuisine: string;
  city: string;
  description?: string;
  address: string;
}): string {
  return [restaurant.name, restaurant.cuisine, restaurant.city, restaurant.address, restaurant.description ?? ""]
    .join(" ")
    .toLowerCase();
}

async function requireOwner(ctx: MutationCtx, restaurantId: Id<"restaurants">) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("You must be signed in.");
  const restaurant = await ctx.db.get(restaurantId);
  if (!restaurant) throw new Error("Restaurant not found.");
  if (restaurant.ownerId !== userId) throw new Error("You do not own this restaurant.");
  return { userId, restaurant };
}

/** True when the owner is one of the seeded demo accounts (no real auth identity). */
async function ownerIsDemoAccount(ctx: MutationCtx, restaurantId: Id<"restaurants">): Promise<boolean> {
  const restaurant = await ctx.db.get(restaurantId);
  if (!restaurant) return false;
  // safeGet: tolerate owners stored as bare auth subjects rather than user docs.
  const owner = await safeGet<Doc<"users">>(ctx, restaurant.ownerId);
  // The project was renamed Seatly → Kamix; databases seeded under the old
  // brand carry @seatly.demo owners, so accept both domains.
  const email = owner?.email ?? "";
  return email.endsWith("@kamix.demo") || email.endsWith("@seatly.demo");
}

/** Average rating + count for a restaurant (works in queries and mutations). */
async function restaurantRating(ctx: QueryCtx, restaurantId: Id<"restaurants">) {
  const reviews = await ctx.db
    .query("reviews")
    .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
    .collect();
  const count = reviews.length;
  const avg =
    count > 0 ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : 0;
  return { avg, count };
}

// ---------------------------------------------------------------------------
// queries
// ---------------------------------------------------------------------------

/**
 * Full-text + cuisine + city + seating preference + dietary/solo search.
 * `dietary` filters restaurants that serve at least one available menu item
 * tagged with that label (e.g. "Vegetarian", "Halal", "Gluten-free").
 */
/**
 * Lightweight public platform stats for the landing page: how many
 * restaurants are actually on the platform (not a hard-coded claim) and a
 * few optional crowd-pleasers. Public (no auth) on purpose — it's the
 * marketing homepage.
 */
export const stats = query({
  args: {},
  handler: async (ctx) => {
    // Disabled restaurants are not "partner restaurants" — they don't count
    // toward the Landing stats or the city list.
    const restaurants = (await ctx.db.query("restaurants").collect()).filter((r) => !r.disabled);
    const cities = new Set(restaurants.map((r) => r.city).filter(Boolean));
    return {
      restaurantCount: restaurants.length,
      cityCount: cities.size,
    };
  },
});

export const search = query({
  args: {
    q: v.optional(v.string()),
    cuisine: v.optional(v.string()),
    city: v.optional(v.string()),
    seat: v.optional(SEAT_KIND),
    nonSmoking: v.optional(v.boolean()),
    dietary: v.optional(v.string()),
    solo: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let restaurants;
    if (args.q && args.q.trim().length > 0) {
      restaurants = await ctx.db
        .query("restaurants")
        .withSearchIndex("search_name", (q) => q.search("searchText", args.q!.trim()))
        .collect();
    } else {
      restaurants = await ctx.db.query("restaurants").collect();
    }

    // Disabled restaurants never surface in Explore/search.
    let filtered = restaurants.filter((r) => !r.disabled);
    if (args.cuisine) filtered = filtered.filter((r) => r.cuisine === args.cuisine);
    if (args.city) filtered = filtered.filter((r) => r.city === args.city);
    if (args.solo) filtered = filtered.filter((r) => r.features.soloFriendly === true);

    // PERF-FIX: Batch-fetch sections instead of N+1 per-restaurant queries
    if (args.seat || args.nonSmoking) {
      const ids = new Set(filtered.map((r) => r._id));
      const allSections = await ctx.db.query("sections").collect();
      const sectionsByRestaurant = new Map<string, typeof allSections>();
      for (const s of allSections) {
        if (ids.has(s.restaurantId)) {
          const list = sectionsByRestaurant.get(s.restaurantId) ?? [];
          list.push(s);
          sectionsByRestaurant.set(s.restaurantId, list);
        }
      }
      filtered = filtered.filter((r) => {
        const secs = sectionsByRestaurant.get(r._id) ?? [];
        if (!secs.length) return false;
        if (args.seat && !secs.some((s) => s.kind === args.seat)) return false;
        if (args.nonSmoking && !secs.some((s) => !s.smoking)) return false;
        return true;
      });
    }

    // PERF-FIX: Batch-fetch menu items instead of N+1 per-restaurant queries
    if (args.dietary && args.dietary.trim()) {
      const tag = args.dietary.trim().toLowerCase();
      const ids = new Set(filtered.map((r) => r._id));
      const allItems = await ctx.db.query("menuItems").collect();
      const itemsByRestaurant = new Map<string, typeof allItems>();
      for (const item of allItems) {
        if (ids.has(item.restaurantId)) {
          const list = itemsByRestaurant.get(item.restaurantId) ?? [];
          list.push(item);
          itemsByRestaurant.set(item.restaurantId, list);
        }
      }
      filtered = filtered.filter((r) => {
        const items = itemsByRestaurant.get(r._id) ?? [];
        return items.some(
          (it) => it.available && (it.tags ?? []).some((t) => t.toLowerCase() === tag),
        );
      });
    }

    return filtered.slice(0, 50);
  },
});

/** Full detail: restaurant + sections + hours + menus (with items) + rating. */
export const get = query({
  args: { id: v.id("restaurants") },
  handler: async (ctx, { id }) => {
    const restaurant = await ctx.db.get(id);
    if (!restaurant) return null;
    // A disabled restaurant is only reachable by its owner or an admin
    // (so moderation keeps working); everyone else sees "not found".
    if (restaurant.disabled) {
      const userId = await getAuthUserId(ctx);
      const caller = userId !== null ? await ctx.db.get(userId) : null;
      if (!(restaurant.ownerId === userId || caller?.role === "admin")) return null;
    }
    const [sections, hours, menus, rawItems, rating] = await Promise.all([
      ctx.db.query("sections").withIndex("by_restaurant", (q) => q.eq("restaurantId", id)).collect(),
      ctx.db.query("hours").withIndex("by_restaurant", (q) => q.eq("restaurantId", id)).collect(),
      ctx.db.query("menus").withIndex("by_restaurant", (q) => q.eq("restaurantId", id)).collect(),
      ctx.db.query("menuItems").withIndex("by_restaurant", (q) => q.eq("restaurantId", id)).collect(),
      restaurantRating(ctx, id),
    ]);

    // Resolve uploaded photos (Convex storage ids) to public URLs so the
    // frontend can render every item image uniformly.
    const menuDocs = await Promise.all(
      menus.map(async (m) => {
        const items = await Promise.all(
          rawItems
            .filter((i) => i.menuId === m._id)
            .map(async (i) => {
              if (i.imageUrl) return i;
              if (i.imageStorageId) {
                const url = await ctx.storage.getUrl(i.imageStorageId);
                if (url) return { ...i, imageUrl: url };
              }
              return i;
            }),
        );
        return { ...m, items };
      }),
    );

    // Ownership info so the manager page can explain empty bookings and
    // notifications instead of silently showing nothing: isOwner drives a
    // banner, ownerIsDemo allows the "become the demo owner" recovery path.
    const userId = await getAuthUserId(ctx);
    const isOwner = userId !== null && restaurant.ownerId === userId;
    let ownerIsDemo = false;
    if (!isOwner) {
      // safeGet: the owner may be a bare auth subject (e.g. a legacy/test
      // identity) rather than a real user doc — never crash the detail page.
      const owner = await safeGet<Doc<"users">>(ctx, restaurant.ownerId);
      const email = owner?.email ?? "";
      ownerIsDemo = email.endsWith("@kamix.demo") || email.endsWith("@seatly.demo");
    }
    return { restaurant, sections, hours, menuDocs, isOwner, ownerIsDemo, rating };
  },
});

/**
 * KB-25: distinct cuisines + cities currently on the platform (disabled
 * venues excluded) so Explore's filter chips are derived from real data
 * instead of hardcoded lists that drift from what's actually seeded.
 */
export const facetValues = query({
  args: {},
  handler: async (ctx) => {
    const restaurants = (await ctx.db.query("restaurants").collect()).filter((r) => !r.disabled);
    const cuisines = [...new Set(restaurants.map((r) => r.cuisine).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 12);
    const cities = [...new Set(restaurants.map((r) => r.city).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 12);
    return { cuisines, cities };
  },
});

/**
 * KB-31: lightweight list-card data for Explore — name, image, cuisine, city,
 * price, rating + total capacity. Deliberately does NOT load menus/items or
 * resolve storage URLs (that's `get`'s job, reserved for the detail page), so
 * a screen full of cards doesn't fan out N heavy queries.
 */
export const card = query({
  args: { id: v.id("restaurants") },
  handler: async (ctx, { id }) => {
    const restaurant = await ctx.db.get(id);
    if (!restaurant || restaurant.disabled) return null;
    const [sections, rating] = await Promise.all([
      ctx.db.query("sections").withIndex("by_restaurant", (q) => q.eq("restaurantId", id)).collect(),
      restaurantRating(ctx, id),
    ]);
    return {
      restaurant: {
        _id: restaurant._id,
        name: restaurant.name,
        cuisine: restaurant.cuisine,
        city: restaurant.city,
        neighborhood: restaurant.neighborhood,
        priceRange: restaurant.priceRange,
        imageUrl: restaurant.imageUrl,
        features: restaurant.features,
      },
      totalCapacity: sections.reduce((s, x) => s + x.capacity, 0),
      rating,
    };
  },
});

/** Restaurants owned by the current user. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db.query("restaurants").withIndex("by_owner", (q) => q.eq("ownerId", userId)).collect();
  },
});

/**
 * "Trending now": restaurants ranked by confirmed covers over the last 7
 * days. Returns restaurant ids for the Explore discovery rail.
 */
export const trending = query({
  args: {},
  handler: async (ctx) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;

    // PERF-FIX: Use date index instead of scanning all bookings
    const recentBookings = await ctx.db
      .query("bookings")
      .withIndex("by_date", (q) => q.gte("date", cutoffKey))
      .collect();

    const covers = new Map<string, number>();
    for (const b of recentBookings) {
      if (b.status === "confirmed") {
        covers.set(b.restaurantId, (covers.get(b.restaurantId) ?? 0) + b.partySize);
      }
    }
    // Exclude disabled venues from the trending rail.
    const disabled = new Set(
      (await ctx.db.query("restaurants").collect()).filter((r) => r.disabled).map((r) => r._id),
    );
    return [...covers.entries()]
      .filter(([id]) => !disabled.has(id as never))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id]) => id as Id<"restaurants">);
  },
});

/**
 * "For you": deterministic, personalized recommendations built from the
 * diner's favorites, cuisines they've actually booked, and dietary tags.
 * This is the rule-based fallback for the AI concierge (see docs/AI_PLAN.md).
 */
export const forYou = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const user = await ctx.db.get(userId);
    if (!user) return [];

    const [restaurants, pastBookings] = await Promise.all([
      ctx.db.query("restaurants").collect(),
      ctx.db.query("bookings").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
    ]);

    const favs = new Set(user.favorites ?? []);
    const dietary = (user.prefs?.dietary ?? []).map((d) => d.toLowerCase());

    // PERF-FIX: Batch-fetch past restaurant cuisines instead of N+1 queries
    const pastRestaurantIds = [...new Set(pastBookings.map((b) => b.restaurantId))];
    const pastRestaurants = await Promise.all(
      pastRestaurantIds.map((id) => ctx.db.get(id)),
    );
    const pastCuisines = new Set(
      pastRestaurants.filter(Boolean).map((r) => r!.cuisine.toLowerCase()),
    );

    // PERF-FIX: Batch-fetch ALL menu items in one query instead of per-restaurant
    const allMenuItems = dietary.length > 0
      ? await ctx.db.query("menuItems").collect()
      : [];
    const itemsByRestaurant = new Map<string, typeof allMenuItems>();
    for (const item of allMenuItems) {
      const list = itemsByRestaurant.get(item.restaurantId) ?? [];
      list.push(item);
      itemsByRestaurant.set(item.restaurantId, list);
    }

    const scored: { id: Id<"restaurants">; score: number }[] = [];
    for (const r of restaurants) {
      if (r.disabled) continue; // never recommend a disabled venue
      let score = 0;
      if (favs.has(r._id)) score += 3;
      if (pastCuisines.has(r.cuisine.toLowerCase())) score += 2;
      if (dietary.length > 0) {
        const items = itemsByRestaurant.get(r._id) ?? [];
        const matches = dietary.some((d) =>
          items.some((it) => it.available && (it.tags ?? []).some((t) => t.toLowerCase() === d)),
        );
        if (matches) score += 1;
      }
      if (score > 0) scored.push({ id: r._id, score });
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((s) => s.id);
  },
});

// ---------------------------------------------------------------------------
// restaurant CRUD
// ---------------------------------------------------------------------------

export const create = mutation({
  args: {
    name: v.string(),
    cuisine: v.string(),
    city: v.string(),
    address: v.string(),
    phone: v.optional(v.string()),
    priceRange: v.optional(v.string()),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    features: FEATURES,
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    // Zod: non-empty name/cuisine/city/address, sane price range, length caps.
    parseOrThrow(restaurantArgsSchema, args);

    const id = await ctx.db.insert("restaurants", {
      ownerId: userId,
      name: args.name.trim().slice(0, 100),
      cuisine: args.cuisine.trim().slice(0, 40),
      city: args.city.trim().slice(0, 60),
      address: args.address.trim().slice(0, 200),
      phone: args.phone?.trim().slice(0, 30),
      priceRange: args.priceRange,
      description: args.description?.trim().slice(0, 1000),
      imageUrl: args.imageUrl?.trim().slice(0, 500),
      features: args.features,
      searchText: "",
      createdAt: Date.now(),
    });
    // keep searchText in sync
    const doc = await ctx.db.get(id);
    await ctx.db.patch(id, { searchText: buildSearchText(doc!) });

    // sensible default section so booking works out of the box
    await ctx.db.insert("sections", {
      restaurantId: id,
      name: "Main dining room",
      kind: "inside",
      smoking: false,
      capacity: 24,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("restaurants"),
    name: v.string(),
    cuisine: v.string(),
    city: v.string(),
    address: v.string(),
    phone: v.optional(v.string()),
    priceRange: v.optional(v.string()),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    features: FEATURES,
  },
  handler: async (ctx, args) => {
    const { restaurant } = await requireOwner(ctx, args.id);
    // Zod also guards update — a blank name/cuisine/city/address can never
    // overwrite real data (previously only create was validated).
    parseOrThrow(restaurantArgsSchema, args);
    const patch = {
      name: args.name.trim().slice(0, 100),
      cuisine: args.cuisine.trim().slice(0, 40),
      city: args.city.trim().slice(0, 60),
      address: args.address.trim().slice(0, 200),
      phone: args.phone?.trim().slice(0, 30),
      priceRange: args.priceRange,
      description: args.description?.trim().slice(0, 1000),
      imageUrl: args.imageUrl?.trim().slice(0, 500),
      features: args.features,
    };
    await ctx.db.patch(args.id, {
      ...patch,
      searchText: buildSearchText({ ...restaurant, ...patch }),
    });
    return await ctx.db.get(args.id);
  },
});

/** Owner-only: set the free-cancellation window (hours before the booking). */
export const setCancellationPolicy = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    hours: v.number(), // 0 = no policy (always free to cancel)
  },
  handler: async (ctx, { restaurantId, hours }) => {
    await requireOwner(ctx, restaurantId);
    parseOrThrow(cancellationPolicySchema, hours);
    await ctx.db.patch(restaurantId, {
      cancellationPolicyHours: hours === 0 ? undefined : hours,
    });    return await ctx.db.get(restaurantId);
  },
});

/** Owner-only: update Socialize room settings for this restaurant. */
export const updateSocializeSettings = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    enabled: v.boolean(),
    minVisits: v.number(),
    blockedUserIds: v.array(v.id("users")),
  },
  handler: async (ctx, { restaurantId, enabled, minVisits, blockedUserIds }) => {
    await requireOwner(ctx, restaurantId);
    await ctx.db.patch(restaurantId, {
      socialize: {
        enabled,
        minVisits: Math.max(0, Math.min(50, Math.floor(minVisits))),
        blockedUserIds: blockedUserIds.slice(0, 200),
      },
    });
    return await ctx.db.get(restaurantId);
  },
});

export const remove = mutation({
  args: { id: v.id("restaurants") },
  handler: async (ctx, { id }) => {
    await requireOwner(ctx, id);
    // Full cascade — same shared erasure the admin console uses (KB-01):
    // bookings + dine-in data, reviews, notifications, stories, waitlist,
    // gifts, menus + items (releasing uploaded photos), and favorites.
    await cascadeDeleteRestaurant(ctx, id);
    return { deleted: true };
  },
});

/**
 * Demo-only ownership transfer. The seeded demo restaurants (Trullo, Sakura
 * House, …) are owned by bare `@kamix.demo`/`@seatly.demo` user rows that carry
 * no auth identity, so a freshly signed-in manager can never see their
 * bookings or notifications. This lets the current user take over a demo
 * restaurant — strictly guarded: only restaurants whose current owner is a
 * seeded demo account can be claimed, so a real restaurant can never be taken
 * over.
 */
export const claimDemo = mutation({
  args: { id: v.id("restaurants") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const restaurant = await ctx.db.get(id);
    if (!restaurant) throw new Error("Restaurant not found.");
    if (restaurant.ownerId === userId) return restaurant;
    if (!(await ownerIsDemoAccount(ctx, id))) {
      throw new Error("This restaurant has a real owner — it can't be claimed.");
    }
    await ctx.db.patch(id, { ownerId: userId });
    // Claiming a demo restaurant makes the claimer an owner so they can use
    // the manager dashboard (previously the role stayed "customer" and the
    // OwnerShell bounced them straight back).
    const user = await ctx.db.get(userId);
    if (user && user.role !== "owner" && user.role !== "admin") {
      await ctx.db.patch(userId, { role: "owner", onboarded: true });
    }
    return await ctx.db.get(id);
  },
});

// ---------------------------------------------------------------------------
// sections (seating areas)
// ---------------------------------------------------------------------------

export const addSection = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    name: v.string(),
    kind: SEAT_KIND,
    smoking: v.boolean(),
    capacity: v.number(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx, args.restaurantId);
    // Zod: non-empty name, seat kind enum, integer capacity 1–500.
    parseOrThrow(sectionArgsSchema, args);
    return await ctx.db.insert("sections", {
      restaurantId: args.restaurantId,
      name: args.name.trim().slice(0, 60),
      kind: args.kind,
      smoking: args.smoking,
      capacity: Math.floor(args.capacity),
      description: args.description?.trim().slice(0, 300),
    });
  },
});

export const updateSection = mutation({
  args: {
    id: v.id("sections"),
    name: v.string(),
    kind: SEAT_KIND,
    smoking: v.boolean(),
    capacity: v.number(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const section = await ctx.db.get(args.id);
    if (!section) throw new Error("Section not found.");
    await requireOwner(ctx, section.restaurantId);
    parseOrThrow(sectionArgsSchema, args);
    await ctx.db.patch(args.id, {
      name: args.name.trim().slice(0, 60),
      kind: args.kind,
      smoking: args.smoking,
      capacity: Math.floor(args.capacity),
      description: args.description?.trim().slice(0, 300),
    });
  },
});

export const deleteSection = mutation({
  args: { id: v.id("sections") },
  handler: async (ctx, { id }) => {
    const section = await ctx.db.get(id);
    if (!section) throw new Error("Section not found.");
    await requireOwner(ctx, section.restaurantId);
    const slots = await ctx.db
      .query("slots")
      .withIndex("by_section_date", (q) => q.eq("sectionId", id))
      .collect();
    for (const s of slots) await ctx.db.delete(s._id);
    await ctx.db.delete(id);
  },
});

// ---------------------------------------------------------------------------
// weekly hours
// ---------------------------------------------------------------------------

export const saveHours = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    hours: v.array(
      v.object({
        dayOfWeek: v.number(),
        open: v.string(),
        close: v.string(),
        enabled: v.boolean(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx, args.restaurantId);
    // Zod: exactly 7 days, day 0–6, HH:mm for enabled days.
    parseOrThrow(hoursSchema, { hours: args.hours });
    const existing = await ctx.db
      .query("hours")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", args.restaurantId))
      .collect();
    for (const e of existing) await ctx.db.delete(e._id);
    for (const h of args.hours) {
      await ctx.db.insert("hours", { restaurantId: args.restaurantId, ...h });
    }
  },
});

// ---------------------------------------------------------------------------
// menus & items
// ---------------------------------------------------------------------------

export const createMenu = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx, args.restaurantId);
    parseOrThrow(menuArgsSchema, args);
    return await ctx.db.insert("menus", {
      restaurantId: args.restaurantId,
      name: args.name.trim().slice(0, 80),
      description: args.description?.trim().slice(0, 300),
    });
  },
});

export const updateMenu = mutation({
  args: { id: v.id("menus"), name: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const menu = await ctx.db.get(args.id);
    if (!menu) throw new Error("Menu not found.");
    await requireOwner(ctx, menu.restaurantId);
    parseOrThrow(menuArgsSchema, args);
    await ctx.db.patch(args.id, {
      name: args.name.trim().slice(0, 80),
      description: args.description?.trim().slice(0, 300),
    });
  },
});

export const deleteMenu = mutation({
  args: { id: v.id("menus") },
  handler: async (ctx, { id }) => {
    const menu = await ctx.db.get(id);
    if (!menu) throw new Error("Menu not found.");
    await requireOwner(ctx, menu.restaurantId);
    const items = await ctx.db.query("menuItems").withIndex("by_menu", (q) => q.eq("menuId", id)).collect();
    for (const it of items) {
      await deleteItemImage(ctx, it);
      await ctx.db.delete(it._id);
    }
    await ctx.db.delete(id);
  },
});

export const createMenuItem = mutation({
  args: {
    menuId: v.id("menus"),
    name: v.string(),
    description: v.optional(v.string()),
    priceCents: v.number(),
    category: v.optional(v.string()),
    popular: v.optional(v.boolean()),
    imageStorageId: v.optional(v.id("_storage")),
    imageUrl: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    allergens: v.optional(v.array(v.string())),
    ingredients: v.optional(v.array(v.string())),
    spiceLevel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const menu = await ctx.db.get(args.menuId);
    if (!menu) throw new Error("Menu not found.");
    await requireOwner(ctx, menu.restaurantId);
    // Zod: non-empty name, price 0..1M, spice enum, tag/ingredient caps.
    parseOrThrow(menuItemArgsSchema, args);
    return await ctx.db.insert("menuItems", {
      restaurantId: menu.restaurantId,
      menuId: args.menuId,
      name: args.name.trim().slice(0, 100),
      description: args.description?.trim().slice(0, 300) || undefined,
      priceCents: Math.round(args.priceCents),
      category: args.category?.trim().slice(0, 40) || undefined,
      popular: args.popular ?? false,
      available: true,
      imageStorageId: args.imageStorageId,
      imageUrl: args.imageUrl?.trim().slice(0, 500) || undefined,
      tags: sanitizeTags(args.tags),
      allergens: sanitizeTags(args.allergens),
      ingredients: sanitizeTags(args.ingredients),
      spiceLevel: (args.spiceLevel as SpiceLevel) || undefined,
    });
  },
});

export const updateMenuItem = mutation({
  args: {
    id: v.id("menuItems"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    priceCents: v.optional(v.number()),
    category: v.optional(v.string()),
    popular: v.optional(v.boolean()),
    available: v.optional(v.boolean()),
    imageStorageId: v.optional(v.id("_storage")),
    imageUrl: v.optional(v.string()),
    removeImage: v.optional(v.boolean()),
    tags: v.optional(v.array(v.string())),
    allergens: v.optional(v.array(v.string())),
    ingredients: v.optional(v.array(v.string())),
    spiceLevel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.id);
    if (!item) throw new Error("Item not found.");
    await requireOwner(ctx, item.restaurantId);

    parseOrThrow(menuItemUpdateSchema, args);

    // photo transitions: replace/remove uploaded files and clear the paired field
    let imageStorageId = item.imageStorageId;
    let imageUrl = item.imageUrl;
    if (args.removeImage) {
      await deleteItemImage(ctx, item);
      imageStorageId = undefined;
      imageUrl = undefined;
    } else if (args.imageStorageId !== undefined) {
      if (item.imageStorageId && item.imageStorageId !== args.imageStorageId) await deleteItemImage(ctx, item);
      imageStorageId = args.imageStorageId;
      imageUrl = undefined;
    } else if (args.imageUrl !== undefined && args.imageUrl.trim() !== "") {
      if (item.imageStorageId) await deleteItemImage(ctx, item);
      imageStorageId = undefined;
      imageUrl = args.imageUrl.trim().slice(0, 500);
    }

    await ctx.db.patch(args.id, {
      name: args.name !== undefined && args.name.trim() !== "" ? args.name.trim().slice(0, 100) : item.name,
      description:
        args.description !== undefined ? (args.description.trim().slice(0, 300) || undefined) : item.description,
      priceCents: args.priceCents !== undefined ? Math.round(args.priceCents) : item.priceCents,
      category: args.category !== undefined ? (args.category.trim().slice(0, 40) || undefined) : item.category,
      popular: args.popular !== undefined ? args.popular : (item.popular ?? false),
      available: args.available !== undefined ? args.available : item.available,
      tags: args.tags !== undefined ? sanitizeTags(args.tags) : item.tags,
      allergens: args.allergens !== undefined ? sanitizeTags(args.allergens) : item.allergens,
      ingredients: args.ingredients !== undefined ? sanitizeTags(args.ingredients) : item.ingredients,
      spiceLevel:
        args.spiceLevel !== undefined ? ((args.spiceLevel as SpiceLevel) || undefined) : item.spiceLevel,
      imageStorageId,
      imageUrl,
    });
    return await ctx.db.get(args.id);
  },
});

export const deleteMenuItem = mutation({
  args: { id: v.id("menuItems") },
  handler: async (ctx, { id }) => {
    const item = await ctx.db.get(id);
    if (!item) throw new Error("Item not found.");
    await requireOwner(ctx, item.restaurantId);
    await deleteItemImage(ctx, item);
    await ctx.db.delete(id);
  },
});

export type MenuItem = Doc<"menuItems">;
