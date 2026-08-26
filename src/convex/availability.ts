import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, MutationCtx, query, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { defaultGridTimes, minutesOf, sortTimes, timesForDay } from "../lib/slotgen";
import { dateFromNow } from "../lib/format";

export const SLOT_STEP_MINUTES = 30;

/** All slot start times between open and close, e.g. "17:00" -> ["17:00","17:30",...] */
export function slotTimes(open: string, close: string): string[] {
  return defaultGridTimes(open, close, SLOT_STEP_MINUTES);
}

/**
 * Idempotently create slots for (restaurant, date).
 *
 * Source of truth for "what times exist":
 * - If the restaurant has any enabled `slotRules`, they replace the grid for the
 *   days they cover (overlapping windows merge, never duplicate a slot). Days
 *   the restaurant is open but no window matches produce no slots.
 * - Otherwise the legacy 30-minute grid between hours.open and hours.close is used.
 * - One-off `customSlots` for this date are merged on top (all sections, or one).
 *
 * Self-healing: slots that no longer match the current rules are pruned — but
 * only when nothing has been booked on them (`remaining === total`). Booked
 * slots and owner "closed" overrides on still-valid times are always kept. This
 * guarantees diners only ever see the times the restaurant actually defined.
 */
export async function ensureSlotsForDate(ctx: MutationCtx, restaurantId: Id<"restaurants">, date: string) {
  const hours = await ctx.db
    .query("hours")
    .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
    .collect();
  const dow = new Date(`${date}T00:00:00`).getDay();
  const day = hours.find((h) => h.dayOfWeek === dow && h.enabled);
  if (!day) return { created: 0, pruned: 0, open: false };

  const sections = await ctx.db
    .query("sections")
    .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
    .collect();
  if (sections.length === 0) return { created: 0, pruned: 0, open: true };

  const [rules, customSlots] = await Promise.all([
    ctx.db.query("slotRules").withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId)).collect(),
    ctx.db
      .query("customSlots")
      .withIndex("by_restaurant_date", (q) => q.eq("restaurantId", restaurantId).eq("date", date))
      .collect(),
  ]);

  const sectionIds = sections.map((s) => s._id);
  const perSection = new Map<string, Set<string>>();
  const enabledRules = rules.filter((r) => r.enabled);
  if (enabledRules.length > 0) {
    // Rules take over: only windows matching this weekday generate slots.
    const dayRules = enabledRules.filter((r) => r.days.includes(dow));
    const bySection = timesForDay(dayRules, dow, sectionIds);
    for (const [sid, times] of bySection) perSection.set(sid, new Set(times));
  } else {
    const times = slotTimes(day.open, day.close);
    for (const sid of sectionIds) perSection.set(sid, new Set(times));
  }

  // One-off custom slots merge on top.
  for (const c of customSlots) {
    const targets = c.sectionId ? [c.sectionId] : sectionIds;
    for (const sid of targets) {
      const set = perSection.get(sid) ?? new Set<string>();
      set.add(c.time);
      perSection.set(sid, set);
    }
  }

  const existing = await ctx.db
    .query("slots")
    .withIndex("by_restaurant_date", (q) => q.eq("restaurantId", restaurantId).eq("date", date))
    .collect();

  // Prune stale unbooked slots (e.g. the old 30-min grid after rules were added).
  const stale = existing.filter((s) => {
    const want = perSection.get(s.sectionId);
    const wanted = want ? want.has(s.time) : false;
    return !wanted && s.remaining === s.total;
  });
  await Promise.all(stale.map((s) => ctx.db.delete(s._id)));
  const pruned = stale.length;

  // Insert missing slots (re-read after deletions so we don't skip re-creating
  // a slot we just pruned). Inserts are batched so generation stays fast even
  // when a restaurant has many sections × times.
  const fresh =
    pruned > 0
      ? await ctx.db
          .query("slots")
          .withIndex("by_restaurant_date", (q) => q.eq("restaurantId", restaurantId).eq("date", date))
          .collect()
      : existing;
  const inserts: Promise<unknown>[] = [];
  for (const section of sections) {
    const times = perSection.get(section._id);
    if (!times) continue; // section excluded by rules this day
    for (const time of sortTimes([...times])) {
      const already = fresh.some((s) => s.sectionId === section._id && s.time === time);
      if (!already) {
        inserts.push(
          ctx.db.insert("slots", {
            restaurantId,
            sectionId: section._id,
            date,
            time,
            total: section.capacity,
            remaining: section.capacity,
            closed: false,
          }),
        );
      }
    }
  }
  await Promise.all(inserts);
  return { created: inserts.length, pruned, open: true };
}

/**
 * Rebuild upcoming availability for a restaurant: prune unbooked future slots
 * (including any that predate the current rule set) and regenerate `daysAhead`
 * days from the current rules. Booked tables are kept. Called after any rule or
 * one-off slot change, and by the demo-rules retrofit.
 */
export async function rebuildRestaurantSlots(
  ctx: MutationCtx,
  restaurantId: Id<"restaurants">,
  daysAhead = 14,
) {
  const today = dateFromNow(0);
  // M-6: prune only inside the regeneration window. Slots materialized beyond
  // `daysAhead` (ensureForDate has no upper bound) survive rule edits instead
  // of being destroyed and never regenerated.
  const windowEnd = dateFromNow(daysAhead);
  const slots = await ctx.db
    .query("slots")
    .withIndex("by_restaurant_date", (q) => q.eq("restaurantId", restaurantId))
    .collect();

  // Batch-delete unbooked future slots within the window (remaining === total
  // means no bookings reference them) so retrofits stay fast even with
  // hundreds of stale slots.
  await Promise.all(
    slots
      .filter((s) => s.date >= today && s.date < windowEnd && s.remaining === s.total)
      .map((s) => ctx.db.delete(s._id)),
  );

  // Regenerate each day concurrently — days are disjoint documents, so
  // parallel writes keep this fast even when retrofitting many dates.
  await Promise.all(
    Array.from({ length: daysAhead }, (_, i) => ensureSlotsForDate(ctx, restaurantId, dateFromNow(i))),
  );
}

// ---------------------------------------------------------------------------
// queries / mutations exposed to the client
// ---------------------------------------------------------------------------

/** Ensure slots exist for a date. Safe to call repeatedly. */
export const ensureForDate = mutation({
  args: { restaurantId: v.id("restaurants"), date: v.string() },
  handler: async (ctx, { restaurantId, date }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const restaurant = await ctx.db.get(restaurantId);
    if (!restaurant) throw new Error("Restaurant not found.");
    // A disabled restaurant only materializes slots for its owner/admin
    // (moderation preview); everyone else is rejected.
    if (restaurant.disabled) {
      const caller = await ctx.db.get(userId);
      if (restaurant.ownerId !== userId && caller?.role !== "admin") {
        throw new Error("This restaurant is currently unavailable.");
      }
    }
    return ensureSlotsForDate(ctx, restaurantId, date);
  },
});

export type SectionAvailability = {
  _id: string;
  name: string;
  kind: "inside" | "outside" | "bar";
  smoking: boolean;
  capacity: number;
  slots: { _id: string; time: string; total: number; remaining: number; closed: boolean }[];
};

export const forDate = query({
  args: { restaurantId: v.id("restaurants"), date: v.string() },
  handler: async (ctx: QueryCtx, { restaurantId, date }) => {
    const restaurant = await ctx.db.get(restaurantId);
    if (!restaurant || restaurant.disabled) return null;
    const [sections, hours, slots] = await Promise.all([
      ctx.db.query("sections").withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId)).collect(),
      ctx.db.query("hours").withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId)).collect(),
      ctx.db.query("slots").withIndex("by_restaurant_date", (q) => q.eq("restaurantId", restaurantId).eq("date", date)).collect(),
    ]);
    const dow = new Date(`${date}T00:00:00`).getDay();
    const day = hours.find((h) => h.dayOfWeek === dow && h.enabled);

    const sectionAvailability: SectionAvailability[] = sections.map((s) => ({
      _id: s._id,
      name: s.name,
      kind: s.kind,
      smoking: s.smoking,
      capacity: s.capacity,
      slots: slots
        .filter((sl) => sl.sectionId === s._id)
        .sort((a, b) => minutesOf(a.time) - minutesOf(b.time))
        .map((sl) => ({ _id: sl._id, time: sl.time, total: sl.total, remaining: sl.remaining, closed: sl.closed })),
    }));

    return {
      date,
      open: !!day,
      openTime: day?.open ?? null,
      closeTime: day?.close ?? null,
      sections: sectionAvailability,
    };
  },
});

/** Lightweight per-restaurant free-seat summary for a date — powers the
 *  "Find a table" screen. Slots may not be materialized yet (e.g. dates far
 *  ahead); those restaurants report estimated capacity instead. */
export const summary = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const restaurants = (await ctx.db.query("restaurants").collect()).filter((r) => !r.disabled);
    const dow = new Date(`${date}T00:00:00`).getDay();
    // M-5: bulk-load hours + sections once (grouped below) instead of two
    // extra indexed queries per restaurant; the per-date slots query stays
    // per-restaurant but is skipped entirely for closed/unconfigured venues.
    const [allHours, allSections] = await Promise.all([
      ctx.db.query("hours").collect(),
      ctx.db.query("sections").collect(),
    ]);
    const hoursByRestaurant = new Map<string, typeof allHours>();
    for (const h of allHours) {
      const list = hoursByRestaurant.get(h.restaurantId) ?? [];
      list.push(h);
      hoursByRestaurant.set(h.restaurantId, list);
    }
    const sectionsByRestaurant = new Map<string, typeof allSections>();
    for (const s of allSections) {
      const list = sectionsByRestaurant.get(s.restaurantId) ?? [];
      list.push(s);
      sectionsByRestaurant.set(s.restaurantId, list);
    }
    const out: {
      restaurantId: Id<"restaurants">;
      open: boolean;
      freeSeats: number;
      estimated: boolean;
    }[] = [];
    for (const r of restaurants) {
      if (r.disabled) continue; // disabled venues never show availability
      const day = (hoursByRestaurant.get(r._id) ?? []).find((h) => h.dayOfWeek === dow && h.enabled);
      const sections = sectionsByRestaurant.get(r._id) ?? [];
      if (!day || sections.length === 0) {
        out.push({ restaurantId: r._id, open: false, freeSeats: 0, estimated: false });
        continue;
      }
      const slots = await ctx.db
        .query("slots")
        .withIndex("by_restaurant_date", (q) => q.eq("restaurantId", r._id).eq("date", date))
        .collect();
      if (slots.length > 0) {
        const freeSeats = slots.reduce((sum, s) => sum + (s.closed ? 0 : s.remaining), 0);
        out.push({ restaurantId: r._id, open: true, freeSeats, estimated: false });
      } else {
        const capacity = sections.reduce((sum, s) => sum + s.capacity, 0);
        out.push({ restaurantId: r._id, open: true, freeSeats: capacity, estimated: true });
      }
    }
    return out;
  },
});

/** Owner override: close/reopen a single slot. */
export const setSlotClosed = mutation({
  args: { slotId: v.id("slots"), closed: v.boolean() },
  handler: async (ctx, { slotId, closed }) => {
    const slot = await ctx.db.get(slotId);
    if (!slot) throw new Error("Slot not found.");
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const restaurant = await ctx.db.get(slot.restaurantId);
    if (!restaurant || restaurant.ownerId !== userId) throw new Error("You do not own this restaurant.");
    await ctx.db.patch(slotId, { closed });
  },
});
