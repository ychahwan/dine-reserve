import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// ---------------------------------------------------------------------------
// Idea #3 — Real-time wait time intelligence
//
// Derives realistic wait/seat-time signals from data the app already records:
//   - booking.time (reserved slot) vs checkedInAt (actual arrival)
//   - checkedInAt → completed (how long diners actually stay)
//   - no_show (never arrived)
// Reported as a rolling average per restaurant; nothing is fabricated.
// ---------------------------------------------------------------------------

async function isOwnerOf(ctx: QueryCtx, userId: string, restaurantId: Id<"restaurants">) {
  const restaurant = await ctx.db.get(restaurantId);
  return !!restaurant && restaurant.ownerId === userId;
}

/** Minutes between two "HH:mm" strings (same day). */
function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Live wait signals for one restaurant, computed from the last `days` of
 * bookings: average delay between the reserved time and actual check-in
 * ("late arrivals"), average time from check-in to completion ("seat time"),
 * and the no-show rate for the window. Returns null for non-owners.
 */
export const waitTimes = query({
  args: { restaurantId: v.id("restaurants"), days: v.optional(v.number()) },
  handler: async (ctx, { restaurantId, days }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    if (!(await isOwnerOf(ctx, userId, restaurantId))) return null;

    const lookback = Math.min(Math.max(days ?? 30, 7), 90);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - lookback);
    const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;

    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect();
    const window = bookings.filter((b) => b.date >= cutoffKey && b.status !== "cancelled");

    const lateDelays: number[] = [];
    const seatTimes: number[] = [];
    let noShow = 0;
    let finished = 0;
    for (const b of window) {
      if (b.status === "no_show") {
        noShow++;
        finished++;
        continue;
      }
      if (b.status === "completed") finished++;
      // arrival delay: actual check-in vs reserved time (only same-day arrivals)
      if (b.checkedInAt) {
        const dayKey = `${new Date(b.checkedInAt).getFullYear()}-${String(new Date(b.checkedInAt).getMonth() + 1).padStart(2, "0")}-${String(new Date(b.checkedInAt).getDate()).padStart(2, "0")}`;
        if (dayKey === b.date) {
          const bookedMin = minutesOf(b.time);
          const arrivedMin = new Date(b.checkedInAt).getHours() * 60 + new Date(b.checkedInAt).getMinutes();
          lateDelays.push(arrivedMin - bookedMin);
        }
      }
      // seat time: check-in → completed (updatedAt is the status-change stamp)
      if (b.checkedInAt && b.status === "completed" && b.updatedAt > b.checkedInAt) {
        seatTimes.push(Math.round((b.updatedAt - b.checkedInAt) / 60_000));
      }
    }

    const avg = (xs: number[]) => (xs.length > 0 ? Math.round(xs.reduce((a, x) => a + x, 0) / xs.length) : null);
    const late = avg(lateDelays);
    const seat = avg(seatTimes);

    return {
      rangeDays: lookback,
      sampleSize: window.length,
      // late > 0 = diners arriving after their slot (pressure on the room);
      // late < 0 = early arrivals waiting to be seated.
      avgLateMinutes: late,
      avgSeatMinutes: seat,
      noShowRate: finished > 0 ? Math.round((noShow / finished) * 100) : 0,
      // friendly summary used by the owner dashboard + restaurant card
      summary:
        late === null && seat === null
          ? "Not enough visit data yet"
          : [
              seat !== null ? `Avg visit ~${seat} min` : null,
              late !== null
                ? late > 0
                  ? `Diners run ~${late} min late`
                  : `Diners arrive ~${Math.abs(late)} min early`
                : null,
            ]
              .filter(Boolean)
              .join(" · "),
    };
  },
});

/**
 * Public, diner-facing wait signal (Idea #3): a short "Avg visit ~X min"
 * summary computed from the same bookings, minus any owner-only detail.
 * Shown on Explore restaurant cards so diners get a sense of pace.
 */
export const publicWaitSignal = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, { restaurantId }) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect();
    const window = bookings.filter((b) => b.date >= cutoffKey && b.status !== "cancelled");
    const seatTimes: number[] = [];
    for (const b of window) {
      if (b.checkedInAt && b.status === "completed" && b.updatedAt > b.checkedInAt) {
        seatTimes.push(Math.round((b.updatedAt - b.checkedInAt) / 60_000));
      }
    }
    if (seatTimes.length < 3) return null; // not enough data — don't guess
    const avg = Math.round(seatTimes.reduce((a, x) => a + x, 0) / seatTimes.length);
    return {
      avgSeatMinutes: avg,
      label: avg >= 90 ? `~${Math.round(avg / 60)}h${avg % 60 ? ` ${avg % 60}m` : ""} visits` : `~${avg} min visits`,
    };
  },
});

// ---------------------------------------------------------------------------
// Idea #5 — Analytics 2.0: business intelligence for the owner
// ---------------------------------------------------------------------------

/**
 * Deeper owner analytics beyond the KPI cards:
 *  - repeatRate: % of diners who returned for a second visit in the window
 *  - topDiners: highest-value regulars (visits + avg party + spend)
 *  - heatmap: day-of-week × hour booking density
 *  - revenueProjection: covers × avg spend per cover (from dine-in orders)
 *  - avgSpendPerCover: average bill per seated guest
 */
export const analytics2 = query({
  args: { restaurantId: v.id("restaurants"), days: v.optional(v.number()) },
  handler: async (ctx, { restaurantId, days }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    if (!(await isOwnerOf(ctx, userId, restaurantId))) return null;

    const lookback = Math.min(Math.max(days ?? 30, 7), 90);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - lookback);
    const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;

    const [bookings, orders] = await Promise.all([
      ctx.db.query("bookings").withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId)).collect(),
      ctx.db.query("dineOrders").withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId)).collect(),
    ]);
    const window = bookings.filter((b) => b.date >= cutoffKey && b.status !== "cancelled");
    const validOrders = orders.filter((o) => o.status !== "cancelled");

    // ── repeat rate: diners with >1 visit in window ────────────────────────
    const visitsByUser = new Map<string, number>();
    for (const b of window) visitsByUser.set(b.userId, (visitsByUser.get(b.userId) ?? 0) + 1);
    let repeaters = 0;
    for (const n of visitsByUser.values()) if (n > 1) repeaters++;
    const uniqueDiners = visitsByUser.size;
    const repeatRate = uniqueDiners > 0 ? Math.round((repeaters / uniqueDiners) * 100) : 0;

    // ── heatmap: day-of-week × hour ────────────────────────────────────────
    const heat: { day: number; hour: number; covers: number }[] = [];
    const heatMap = new Map<string, number>();
    for (const b of window) {
      const day = new Date(`${b.date}T00:00:00`).getDay();
      const hour = Number(b.time.slice(0, 2));
      const key = `${day}:${hour}`;
      heatMap.set(key, (heatMap.get(key) ?? 0) + b.partySize);
    }
    for (const [key, covers] of heatMap) {
      const [day, hour] = key.split(":").map(Number);
      heat.push({ day: day!, hour: hour!, covers });
    }
    heat.sort((a, b) => a.day - b.day || a.hour - b.hour);

    // ── top diners by visits ───────────────────────────────────────────────
    const spendByUser = new Map<string, { visits: number; covers: number; spendCents: number }>();
    for (const b of window) {
      const cur = spendByUser.get(b.userId) ?? { visits: 0, covers: 0, spendCents: 0 };
      cur.visits += 1;
      cur.covers += b.partySize;
      spendByUser.set(b.userId, cur);
    }
    for (const o of validOrders) {
      const cur = spendByUser.get(o.userId);
      if (cur) cur.spendCents += o.totalCents;
    }
    const userIds = [...spendByUser.keys()] as Id<"users">[];
    const users = await Promise.all(userIds.map((id) => ctx.db.get(id)));
    const topDiners = [...spendByUser.entries()]
      .map(([userId, s], i) => {
        const u = users[i];
        return {
          userId,
          name: u?.name ?? "Diner",
          phone: u?.phone,
          visits: s.visits,
          covers: s.covers,
          spendCents: s.spendCents,
        };
      })
      .sort((a, b) => b.visits - a.visits || b.spendCents - a.spendCents)
      .slice(0, 10);

    // ── revenue: avg spend per cover, projected covers → revenue ──────────
    const seatedCovers = window.reduce((s, b) => s + (b.status === "completed" ? b.partySize : 0), 0);
    const revenueCents = validOrders.reduce((s, o) => s + o.totalCents, 0);
    const avgSpendPerCoverCents =
      seatedCovers > 0 ? Math.round(revenueCents / seatedCovers) : 0;
    const projectedRevenueCents = window.reduce((s, b) => s + b.partySize, 0) * avgSpendPerCoverCents;

    return {
      rangeDays: lookback,
      repeatRate,
      uniqueDiners,
      repeatVisits: repeaters,
      heatmap: heat,
      topDiners,
      avgSpendPerCoverCents,
      revenueCents,
      projectedRevenueCents,
      bookedCovers: window.reduce((s, b) => s + b.partySize, 0),
    };
  },
});

// ---------------------------------------------------------------------------
// Idea #20 — Predictive availability
//
// For a date beyond the generated slot window, estimate how likely the
// restaurant is to sell out based on historical same-weekday booking density.
// Honest heuristic, clearly labeled as a prediction.
// ---------------------------------------------------------------------------

export const predict = query({
  args: { restaurantId: v.id("restaurants"), date: v.string() },
  handler: async (ctx, { restaurantId, date }) => {
    const restaurant = await ctx.db.get(restaurantId);
    if (!restaurant) return null;

    const targetDow = new Date(`${date}T00:00:00`).getDay();

    // Historical baseline: same weekday over the last 12 weeks.
    const histories: { booked: number; capacity: number }[] = [];
    for (let w = 1; w <= 12; w++) {
      const d = new Date(`${date}T00:00:00`);
      d.setDate(d.getDate() - w * 7);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const [bookings, sections, slots] = await Promise.all([
        ctx.db.query("bookings").withIndex("by_restaurant_date", (q) => q.eq("restaurantId", restaurantId).eq("date", key)).collect(),
        ctx.db.query("sections").withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId)).collect(),
        ctx.db.query("slots").withIndex("by_restaurant_date", (q) => q.eq("restaurantId", restaurantId).eq("date", key)).collect(),
      ]);
      const capacity =
        slots.length > 0
          ? slots.reduce((s, sl) => s + sl.total, 0)
          : sections.reduce((s, sec) => s + sec.capacity, 0);
      const booked = bookings.filter((b) => b.status !== "cancelled").reduce((s, b) => s + b.partySize, 0);
      if (capacity > 0) histories.push({ booked, capacity });
    }

    if (histories.length === 0) return { date, dow: targetDow, sampleWeeks: 0, likelySoldOut: null, message: "Not enough history to predict yet." };

    const avgDensity =
      histories.reduce((s, h) => s + h.booked / h.capacity, 0) / histories.length;
    const soldOutProb = Math.round(Math.min(0.97, Math.max(0.03, avgDensity * 1.15)) * 100);

    return {
      date,
      dow: targetDow,
      sampleWeeks: histories.length,
      avgDensity: Math.round(avgDensity * 100),
      likelySoldOut: soldOutProb,
      message:
        soldOutProb >= 70
          ? `${soldOutProb}% likely to sell out — book early.`
          : soldOutProb >= 40
            ? `${soldOutProb}% likely to fill up — a good time to book.`
            : "Usually has room — you can likely book last-minute.",
    };
  },
});
