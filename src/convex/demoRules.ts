import { v } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { dateFromNow } from "../lib/format";
import { DEMO_RESTAURANT_NAMES } from "../lib/demo";
import { rebuildRestaurantSlots } from "./availability";

/**
 * Demo service windows for the five seeded restaurants. Demonstrates the full
 * slot-rules engine: 60-min fine-dining seatings, 30-min casual windows, fixed
 * single seatings (omakase), section-restricted windows, and a deliberate
 * lunch→dinner gap that the smart preview flags.
 */
type RuleDef = { name: string; days: number[]; start: string; end: string; step: number };
type ZoneRuleDef = RuleDef & { zones: string[] };
type DemoDef = {
  name: string;
  rules: RuleDef[];
  zoneRules?: ZoneRuleDef[];
  customSlot?: { dateOffset: number; time: string; note: string };
};

const DEMO_DEFS: DemoDef[] = [
  {
    name: "Trullo",
    rules: [
      { name: "Dinner", days: [1, 2, 3, 4, 5], start: "17:30", end: "22:30", step: 60 },
      { name: "Weekend service", days: [0, 6], start: "12:00", end: "22:00", step: 60 },
    ],
    zoneRules: [
      { name: "Terrace aperitivo", days: [5, 6, 0], start: "17:00", end: "19:00", step: 30, zones: ["Terrace"] },
    ],
  },
  {
    name: "Sakura House",
    rules: [
      { name: "Izakaya dinner", days: [1, 2, 3, 4, 5, 6], start: "18:00", end: "22:00", step: 60 },
      { name: "Sunday izakaya", days: [0], start: "12:00", end: "20:00", step: 60 },
    ],
    zoneRules: [
      { name: "Omakase first seating", days: [1, 2, 3, 4, 5, 6], start: "18:00", end: "18:00", step: 0, zones: ["Omakase counter"] },
      { name: "Omakase second seating", days: [1, 2, 3, 4, 5, 6], start: "20:00", end: "20:00", step: 0, zones: ["Omakase counter"] },
    ],
  },
  {
    name: "Beit Zaytoun",
    rules: [
      { name: "Lunch", days: [1, 2, 3, 4, 5], start: "12:00", end: "14:30", step: 30 },
      { name: "Dinner", days: [0, 1, 2, 3, 4, 5, 6], start: "18:00", end: "23:00", step: 30 },
    ],
    zoneRules: [
      { name: "Terrace mezze", days: [5, 6, 0], start: "17:00", end: "20:00", step: 30, zones: ["Terrace"] },
    ],
    customSlot: { dateOffset: 3, time: "15:30", note: "Mezze tasting walk-in seating" },
  },
  {
    name: "La Brasa",
    rules: [
      { name: "Dinner", days: [1, 2, 3, 4, 5], start: "19:00", end: "23:00", step: 60 },
      { name: "Weekend fiesta", days: [0, 6], start: "12:00", end: "22:00", step: 60 },
    ],
    zoneRules: [
      { name: "Late bar & terrace", days: [5, 6, 0], start: "22:00", end: "23:30", step: 30, zones: ["Grill bar", "Smoking terrace"] },
    ],
  },
  {
    name: "Meridian Kitchen",
    rules: [
      { name: "Lunch", days: [1, 2, 3, 4, 5], start: "12:00", end: "14:30", step: 30 },
      { name: "Dinner", days: [0, 1, 2, 3, 4, 5, 6], start: "18:30", end: "22:30", step: 30 },
    ],
    zoneRules: [
      { name: "Rooftop", days: [4, 5, 6], start: "18:00", end: "22:00", step: 30, zones: ["Rooftop"] },
    ],
  },
];

// KB-14: the demo names come from src/lib/demo (client-safe), so the backend
// defs and the owner-dashboard UI share one list and can never drift.
DEMO_DEFS.forEach((d) => {
  if (!DEMO_RESTAURANT_NAMES.includes(d.name)) {
    // Defensive: keep the two sources honest at module load.
    throw new Error(`Demo def "${d.name}" is missing from DEMO_RESTAURANT_NAMES`);
  }
});

/**
 * Apply the demo service windows (and one-off slot) to the demo restaurants,
 * matched by name, and rebuild each one's upcoming availability.
 *
 * By default it is a retrofit: a restaurant that already has service windows or
 * one-off slots is left untouched (so a scheduled run becomes a no-op after the
 * first application and never overrides an owner's own configuration). Pass
 * `force: true` (the owner-facing "load example windows" action) to replace a
 * restaurant's windows anyway.
 */
export async function applyDemoRules(
  ctx: MutationCtx,
  now: number,
  opts?: { restaurantName?: string; daysAhead?: number; force?: boolean },
): Promise<string[]> {
  const restaurants = await ctx.db.query("restaurants").collect();
  const applied: string[] = [];
  const defs = opts?.restaurantName
    ? DEMO_DEFS.filter((d) => d.name === opts.restaurantName)
    : DEMO_DEFS;

  for (const demo of defs) {
    const restaurant = restaurants.find((r) => r.name === demo.name);
    if (!restaurant) continue;

    const [oldRules, oldCustoms, sections] = await Promise.all([
      ctx.db.query("slotRules").withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurant._id)).collect(),
      ctx.db.query("customSlots").withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurant._id)).collect(),
      ctx.db.query("sections").withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurant._id)).collect(),
    ]);

    // Retrofit guard: never touch a restaurant that already has windows. The
    // scheduled run applies demo windows once and becomes a no-op forever
    // afterward; only an explicit `force: true` replaces them.
    if (!opts?.force && (oldRules.length > 0 || oldCustoms.length > 0)) continue;

    await Promise.all(oldRules.map((r) => ctx.db.delete(r._id)));
    await Promise.all(oldCustoms.map((c) => ctx.db.delete(c._id)));

    const insertRule = async (
      name: string,
      days: number[],
      start: string,
      end: string,
      step: number,
      sections?: Id<"sections">[],
    ) => {
      await ctx.db.insert("slotRules", {
        restaurantId: restaurant._id,
        name,
        days,
        start,
        end,
        step,
        sections: sections && sections.length > 0 ? sections : undefined,
        enabled: true,
        createdAt: now,
      });
    };

    for (const rule of demo.rules) {
      await insertRule(rule.name, rule.days, rule.start, rule.end, rule.step);
    }
    for (const zr of demo.zoneRules ?? []) {
      const sectionIds = sections.filter((s) => zr.zones.includes(s.name)).map((s) => s._id);
      if (sectionIds.length > 0) {
        await insertRule(zr.name, zr.days, zr.start, zr.end, zr.step, sectionIds);
      }
    }
    if (demo.customSlot) {
      await ctx.db.insert("customSlots", {
        restaurantId: restaurant._id,
        date: dateFromNow(demo.customSlot.dateOffset),
        time: demo.customSlot.time,
        note: demo.customSlot.note,
        createdAt: now,
      });
    }

    await rebuildRestaurantSlots(ctx, restaurant._id, opts?.daysAhead ?? 14);
    applied.push(restaurant._id);
  }

  return applied;
}

/**
 * Retrofit: apply the demo service windows to an already-seeded database (the
 * seed guard only runs when the restaurants table is empty, so databases seeded
 * before the slot-rules engine existed need this to pick up the demo windows).
 *
 * - Runs automatically (daily cron) with no args: applies demo windows only to
 *   demo restaurants that don't have windows yet, then becomes a no-op.
 * - `restaurant` limits the run to one demo restaurant.
 * - `daysAhead` controls how many days of availability are rebuilt.
 * - `force: true` replaces a restaurant's windows anyway (owner action; the
 *   caller must be signed in).
 */
export const ensureDemoRules = mutation({
  args: {
    restaurant: v.optional(v.string()),
    daysAhead: v.optional(v.number()),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // M-20: any non-cron invocation requires authentication. The scheduled
    // run passes no args and stays open as a retrofit no-op; a caller
    // passing any argument is driving the mutation by hand and must be
    // signed in — otherwise the availability rebuild becomes an
    // unauthenticated write vector.
    const isManual =
      args.force !== undefined ||
      args.restaurant !== undefined ||
      args.daysAhead !== undefined;
    if (isManual) {
      const userId = await getAuthUserId(ctx);
      if (userId === null) throw new Error("You must be signed in.");

      // KB-10: `force` replaces windows — any signed-in user could otherwise
      // destroy a restaurant's configured service windows by name. Require
      // the caller to own every targeted restaurant (or be a platform admin).
      if (args.force) {
        const caller = await ctx.db.get(userId);
        const isAdmin = caller?.role === "admin";
        const targets = args.restaurant
          ? DEMO_DEFS.filter((d) => d.name === args.restaurant)
          : DEMO_DEFS;
        const restaurants = await ctx.db.query("restaurants").collect();
        for (const def of targets) {
          const restaurant = restaurants.find((r) => r.name === def.name);
          if (!restaurant) continue;
          if (!isAdmin && restaurant.ownerId !== userId) {
            throw new Error("You can only load example windows for a restaurant you own.");
          }
        }
      }
    }
    const applied = await applyDemoRules(ctx, Date.now(), {
      restaurantName: args.restaurant,
      daysAhead: args.daysAhead,
      force: args.force,
    });
    return { applied: applied.length, restaurants: applied };
  },
});

/** Read-only status of the demo slot rules (useful for ops/verification). */
export const demoRulesStatus = query({
  args: {},
  handler: async (ctx) => {
    const [restaurants, rules, customSlots, slots] = await Promise.all([
      ctx.db.query("restaurants").collect(),
      ctx.db.query("slotRules").collect(),
      ctx.db.query("customSlots").collect(),
      ctx.db.query("slots").collect(),
    ]);
    return {
      restaurants: restaurants.length,
      slotRules: rules.length,
      customSlots: customSlots.length,
      slots: slots.length,
      perRestaurant: restaurants.map((r) => ({
        name: r.name,
        rules: rules.filter((x) => x.restaurantId === r._id).length,
        customs: customSlots.filter((x) => x.restaurantId === r._id).length,
        slots: slots.filter((x) => x.restaurantId === r._id).length,
      })),
    };
  },
});
