import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, MutationCtx, query, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { FEATURES, SEAT_KIND } from "./schema";
import { safeGet } from "./helpers";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

type SpiceLevel = "mild" | "medium" | "hot" | "very_hot";
const SPICE_VALUES: SpiceLevel[] = ["mild", "medium", "hot", "very_hot"];

const MAX_TAGS = 12;
const MAX_TAG_LEN = 40;

/** Trim, dedupe, and cap an attribute list (tags / allergens). */
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

    let filtered = restaurants;
    if (args.cuisine) filtered = filtered.filter((r) => r.cuisine === args.cuisine);
    if (args.city) filtered = filtered.filter((r) => r.city === args.city);
    if (args.solo) filtered = filtered.filter((r) => r.features.soloFriendly === true);

    // seating-preference filtering requires section knowledge
    if (args.seat || args.nonSmoking) {
      const ids = filtered.map((r) => r._id);
      const sections = await Promise.all(
        ids.map((id) =>
          ctx.db.query("sections").withIndex("by_restaurant", (q) => q.eq("restaurantId", id)).collect(),
        ),
      );
      filtered = filtered.filter((r, i) => {
        const secs = sections[i];
        if (!secs.length) return false;
        if (args.seat && !secs.some((s) => s.kind === args.seat)) return false;
        if (args.nonSmoking && !secs.some((s) => !s.smoking)) return false;
        return true;
      });
    }

    // dietary filter: restaurant must serve an available item with that tag
    if (args.dietary && args.dietary.trim()) {
      const tag = args.dietary.trim().toLowerCase();
      const ids = filtered.map((r) => r._id);
      const items = await Promise.all(
        ids.map((id) =>
          ctx.db.query("menuItems").withIndex("by_restaurant", (q) => q.eq("restaurantId", id)).collect(),
        ),
      );
      filtered = filtered.filter((_, i) =>
        items[i]!.some(
          (it) => it.available && (it.tags ?? []).some((t) => t.toLowerCase() === tag),
        ),
      );
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

/** Restaurants owned by the current user. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db.query("restaurants").withIndex("by_owner", (q) => q.eq("ownerId", userId)).collect();
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
    const name = args.name.trim().slice(0, 100);
    if (!name) throw new Error("Restaurant name is required.");
    if (!args.cuisine.trim()) throw new Error("Cuisine type is required.");
    if (!args.city.trim()) throw new Error("City is required.");

    const id = await ctx.db.insert("restaurants", {
      ownerId: userId,
      name,
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
    if (!Number.isInteger(hours) || hours < 0 || hours > 168) {
      throw new Error("Policy must be between 0 and 168 hours.");
    }
    await ctx.db.patch(restaurantId, {
      cancellationPolicyHours: hours === 0 ? undefined : hours,
    });
    return await ctx.db.get(restaurantId);
  },
});

export const remove = mutation({
  args: { id: v.id("restaurants") },
  handler: async (ctx, { id }) => {
    await requireOwner(ctx, id);
    await ctx.db.delete(id);
    // cascade related data
    const [sections, hours, menus, slots] = await Promise.all([
      ctx.db.query("sections").withIndex("by_restaurant", (q) => q.eq("restaurantId", id)).collect(),
      ctx.db.query("hours").withIndex("by_restaurant", (q) => q.eq("restaurantId", id)).collect(),
      ctx.db.query("menus").withIndex("by_restaurant", (q) => q.eq("restaurantId", id)).collect(),
      ctx.db.query("slots").withIndex("by_restaurant_date", (q) => q.eq("restaurantId", id)).collect(),
    ]);
    for (const s of sections) await ctx.db.delete(s._id);
    for (const h of hours) await ctx.db.delete(h._id);
    for (const m of menus) await ctx.db.delete(m._id);
    for (const s of slots) await ctx.db.delete(s._id);
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
    if (args.capacity < 1 || args.capacity > 500) throw new Error("Capacity must be 1–500 seats.");
    if (!args.name.trim()) throw new Error("Section name is required.");
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
    if (args.capacity < 1 || args.capacity > 500) throw new Error("Capacity must be 1–500 seats.");
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
    if (args.hours.length !== 7) throw new Error("Provide hours for all 7 days.");
    for (const h of args.hours) {
      if (h.dayOfWeek < 0 || h.dayOfWeek > 6) throw new Error("Invalid day.");
      if (h.enabled) {
        if (!TIME_RE.test(h.open) || !TIME_RE.test(h.close)) throw new Error(`Invalid time for day ${h.dayOfWeek}.`);
      }
    }
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
    if (!args.name.trim()) throw new Error("Menu name is required.");
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
    spiceLevel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const menu = await ctx.db.get(args.menuId);
    if (!menu) throw new Error("Menu not found.");
    await requireOwner(ctx, menu.restaurantId);
    if (!args.name.trim()) throw new Error("Item name is required.");
    if (args.priceCents < 0 || args.priceCents > 1000000) throw new Error("Invalid price.");
    if (args.spiceLevel !== undefined && args.spiceLevel !== "" && !SPICE_VALUES.includes(args.spiceLevel as SpiceLevel)) {
      throw new Error("Invalid spice level.");
    }
    return await ctx.db.insert("menuItems", {
      re

[FILE_TOO_LARGE]: The combined read_files output exceeded the 100,000 character hard limit. This file was truncated after 20,138 characters. Read it separately or use code_search for the relevant section.