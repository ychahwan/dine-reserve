import { v } from "convex/values";
import { api } from "./_generated/api";
import { mutation } from "./_generated/server";

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Day-before booking reminders. Called by a daily cron: for every confirmed
 * booking happening tomorrow, send the diner an SMS reminder (Twilio-guarded
 * no-op when not configured) and mark it as reminded so it only fires once.
 * Cancellations are naturally skipped because only `confirmed` bookings match.
 */
export const sendTomorrowReminders = mutation({
  args: { date: v.optional(v.string()) }, // "YYYY-MM-DD" — override for testing
  handler: async (ctx, { date }) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const target = date ?? dateKey(tomorrow);

    const bookings = await ctx.db.query("bookings").collect();
    const due = bookings.filter(
      (b) => b.date === target && b.status === "confirmed" && b.phone && !b.reminderSent,
    );

    let sent = 0;
    for (const b of due) {
      const restaurant = await ctx.db.get(b.restaurantId);
      await ctx.scheduler.runAfter(0, api.sms.sendBookingReminder, {
        to: b.phone ?? "",
        restaurantName: restaurant?.name ?? "",
        city: restaurant?.city ?? "",
        date: b.date,
        time: b.time,
        partySize: b.partySize,
        code: b.code,
      });
      await ctx.db.patch(b._id, { reminderSent: true });
      sent++;
    }
    return { date: target, remindersSent: sent };
  },
});
