import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, MutationCtx, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ensureSlotsForDate, rebuildRestaurantSlots } from "./availability";
import { dateFromNow } from "../lib/format";
import { defaultGridTimes, sortTimes, timesForDay } from "../lib/slotgen";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function requireOwner(ctx: MutationCtx, restaurantId: Id<"restaurants">) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("You must be signed in.");
  const restaurant = await ctx.db.get(restaurantId);
  if (!restaurant) throw new Error("Restaurant not found.");
  if (restaurant.ownerId !== userId) throw new Error("You do not own this restaurant.");
  return { userId, restaurant };
}

function validateRule(args: { name: string; days: number[]; start: string; end: string; step: number }) {
  if (!args.name.trim()) throw new Error("Rule name is required.");
  if (args.name.trim().length > 60) throw new Error("Rule name is too long.");
  if (args.days.length === 0) throw new Error("Pick at least one day.");
  if (args.days.some((d) => d < 0 || d > 6)) throw new Error("Invalid day.");
  if (!TIME_RE.test(args.start) || !TIME_RE.test(args.end)) throw new Error("Invalid time.");
  if (!Number.isFinite(args.step) || args.step < 0 || args.step > 240 || args.step % 5 !== 0) {
    throw new Error("Interval must be between 5 and 240 minutes.");
  }
}

/** Prune + regenerate one date after a custom-slot change. */
async function rebuildDate(ctx: MutationCtx, restaurantId: Id<"restaurants">, date: string) {
  const slots = await ctx.db
    .query("slots")
    .withIndex("by_restaurant_date", (q) => q.eq("restaurantId", restaurantId).eq("date", date))
    .collect();
  for (const s of slots) {
    if (s.remaining === s.total) await ctx.db.delete(s._id);
  }
  await ensureSlotsForDate(ctx, restaurantId, date);
}

// ---------------------------------------------------------------------------
// queries
// ---------------------------------------------------------------------------

/** Rules + one-off slots for a restaurant (owner-facing). */
export const list = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, { restaurantId }) => {
    const userId = await getAuthUserId(ctx);
    const restaurant = await ctx.db.get(restaurantId);
    if (userId === null || !restaurant || restaurant.ownerId !== userId) {
      return { rules: [], customSlots: [] };
    }
    const [rules, customSlots] = await Promise.all([
      ctx.db.query("slotRules").withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId)).collect(),
      ctx.db.query("customSlots").withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId)).collect(),
    ]);
    return { rules, customSlots };
  },
});

/**
 * Preview the next 7 days: exactly which times each section would get, without
 * materializing anything. Drives the owner "what will diners see" panel and the
 * smart gap warnings.
 */
export const previewWeek = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, { restaurantId }) => {
    const restaurant = await ctx.db.get(restaurantId);
    if (!restaurant) return null;
    const [hours, sections, rules, customSlots] = await Promise.all([
      ctx.db.query("hours").withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId)).collect(),
      ctx.db.query("sections").withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId)).collect(),
      ctx.db.query("slotRules").withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId)).collect(),
      ctx.db.query("customSlots").withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId)).collect(),
    ]);

    const sectionIds = sections.map((s) => s._id);
    const enabledRules = rules.filter((r) => r.enabled);
    const useRules = enabledRules.length > 0;
    const days: {
      date: string;
      dow: number;
      open: boolean;
      openTime: string | null;
      closeTime: string | null;
      sections: {
        _id: string;
        name: string;
        kind: "inside" | "outside" | "bar";
        smoking: boolean;
        capacity: number;
        times: string[];
      }[];
    }[] = [];

    for (let i = 0; i < 7; i++) {
      const date = dateFromNow(i);
      const dow = new Date(`${date}T00:00:00`).getDay();
      const day = hours.find((h) => h.dayOfWeek === dow && h.enabled);

      let perSection = new Map<string, string[]>();
      if (day) {
        if (useRules) {
          perSection = timesForDay(
            enabledRules.filter((r) => r.days.includes(dow)),
            dow,
            sectionIds,
          );
        } else {
          perSection = new Map(
            sectionIds.map((sid) => [sid, defaultGridTimes(day.open, day.close)]),
          );
        }
        const dayCustoms = customSlots.filter((c) => c.date === date);
        for (const c of dayCustoms) {
          const targets = c.sectionId ? [c.sectionId] : sectionIds;
          for (const sid of targets) {
            const times = perSection.get(sid) ?? [];
            perSection.set(sid, sortTimes([...new Set([...times, c.time])]));
          }
        }
      }

      days.push({
        date,
        dow,
        open: !!day,
        openTime: day?.open ?? null,
        closeTime: day?.close ?? null,
        sections: sections.map((s) => ({
          _id: s._id,
          name: s.name,
          kind: s.kind,
          smoking: s.smoking,
          capacity: s.capacity,
          times: perSection.get(s._id) ?? [],
        })),
      });
    }

    return { useRules, days };
  },
});

// ---------------------------------------------------------------------------
// slot rules
// ---------------------------------------------------------------------------

export const saveRule = mutation({
  args: {
    id: v.optional(v.id("slotRules")),
    restaurantId: v.id("restaurants"),
    name: v.string(),
    days: v.array(v.number()),
    start: v.string(),
    end: v.string(),
    step: v.number(),
    sections: v.optional(v.array(v.id("sections"))),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx, args.restaurantId);
    validateRule(args);

    if (args.sections && args.sections.length > 0) {
      const owned = new Set(
        (
          await ctx.db
            .query("sections")
            .withIndex("by_restaurant", (q) => q.eq("restaurantId", args.restaurantId))
            .collect()
        ).map((s) => s._id),
      );
      for (const sid of args.sections) {
        if (!owned.has(sid)) throw new Error("Section does not belong to this restaurant.");
      }
    }

    const body = {
      restaurantId: args.restaurantId,
      name: args.name.trim().slice(0, 60),
      days: args.days,
      start: args.start,
      end: args.end,
      step: args.step,
      sections: args.sections && args.sections.length > 0 ? args.sections : undefined,
      enabled: args.enabled,
    };

    if (args.id) {
      const rule = await ctx.db.get(args.id);
      if (!rule || rule.restaurantId !== args.restaurantId) throw new Error("Rule not found.");
      await ctx.db.patch(args.id, body);
    } else {
      await ctx.db.insert("slotRules", { ...body, createdAt: Date.now() });
    }

    // Rules changed -> rebuild upcoming availability (booked slots are kept).
    await rebuildRestaurantSlots(ctx, args.restaurantId);
  },
});

export const deleteRule = mutation({
  args: { id: v.id("slotRules") },
  handler: async (ctx, { id }) => {
    const rule = await ctx.db.get(id);
    if (!rule) throw new Error("Rule not found.");
    await requireOwner(ctx, rule.restaurantId);
    await ctx.db.delete(id);
    await rebuildRestaurantSlots(ctx, rule.restaurantId);
  },
});

// ---------------------------------------------------------------------------
// one-off custom slots
// ---------------------------------------------------------------------------

export const addCustomSlot = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    date: v.string(),
    time: v.string(),
    sectionId: v.optional(v.id("sections")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx, args.restaurantId);
    if (!DATE_RE.test(args.date)) throw new Error("Invalid date.");
    if (args.date < dateFromNow(0)) throw new Error("Cannot add a slot in the past.");
    if (!TIME_RE.test(args.time)) throw new Error("Invalid time.");
    if (args.sectionId) {
      const section = await ctx.db.get(args.sectionId);
      if (!section || section.restaurantId !== args.restaurantId) {
        throw new Error("Section does not belong to this restaurant.");
      }
    }
    await ctx.db.insert("customSlots", {
      restaurantId: args.restaurantId,
      sectionId: args.sectionId,
      date: args.date,
      time: args.time,
      note: args.note?.trim().slice(0, 120) || undefined,
      createdAt: Date.now(),
    });
    await rebuildDate(ctx, args.restaurantId, args.date);
  },
});

export const deleteCustomSlot = mutation({
  args: { id: v.id("customSlots") },
  handler: async (ctx, { id }) => {
    const custom = await ctx.db.get(id);
    if (!custom) throw new Error("Custom slot not found.");
    await requireOwner(ctx, custom.restaurantId);
    await ctx.db.delete(id);
    await rebuildDate(ctx, custom.restaurantId, custom.date);
  },
});
