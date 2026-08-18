import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { internalMutation, internalAction } from "./_generated/server";

/**
 * Day-before booking reminders.
 *
 * Fixes a previously-empty file: `convex.config.ts` schedules a daily cron
 * (10:00 UTC) targeting `reminders:sendTomorrowReminders`, but this function
 * did not exist, so the cron silently failed every run (function-not-found)
 * and no reminder SMS was ever sent.
 *
 * Flow: an internalAction computes "tomorrow" (UTC, YYYY-MM-DD) and calls an
 * internalMutation that finds all confirmed, not-yet-reminded bookings for
 * that date, schedules `sms.sendBookingReminder` for each (Twilio-guarded
 * no-op when not configured — never throws), and marks them `reminderSent`
 * so a booking is only reminded once even if the cron runs more than once.
 */

function tomorrowUtcDateString(): string {
  const now = new Date();
  const tomorrow = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  return tomorrow.toISOString().slice(0, 10); // YYYY-MM-DD
}

export const sendTomorrowReminders = internalAction({
  args: {},
  handler: async (ctx): Promise<{ date: string; count: number }> => {
    const date = tomorrowUtcDateString();
    const count: number = await ctx.runMutation(
      internal.reminders.scheduleRemindersForDate,
      { date },
    );
    return { date, count };
  },
});

export const scheduleRemindersForDate = internalMutation({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    // No index spans "date" alone (by_restaurant_date is scoped per
    // restaurant), so scan the table and filter in memory — acceptable at
    // this scale; a dedicated by-date index can be added later if the
    // bookings table grows large.
    const bookings = await ctx.db.query("bookings").collect();

    const candidates = bookings.filter(
      (b) => b.date === date && b.status === "confirmed" && !b.reminderSent,
    );

    let scheduled = 0;
    for (const booking of candidates) {
      if (!booking.phone) continue; // nothing to text
      const restaurant = await ctx.db.get(booking.restaurantId);
      if (!restaurant) continue;

      await ctx.scheduler.runAfter(0, api.sms.sendBookingReminder, {
        to: booking.phone,
        restaurantName: restaurant.name,
        city: restaurant.city,
        date: booking.date,
        time: booking.time,
        partySize: booking.partySize,
        code: booking.code,
      });
      await ctx.db.patch(booking._id, { reminderSent: true });
      scheduled++;
    }
    return scheduled;
  },
});
