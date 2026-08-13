import { v } from "convex/values";
import { action } from "./_generated/server";

/**
 * Send a booking SMS via the Twilio REST API.
 * Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER
 * to be set in the environment (Keys UI). When they are missing the action
 * is a graceful no-op so the app keeps working.
 *
 * The message fields are passed in by the booking mutation (scheduler), so
 * this action never needs to query the database — which also keeps it free
 * of circular imports with the generated api.
 */
export const sendBookingSms = action({
  args: {
    to: v.string(), // diner phone (E.164)
    event: v.union(v.literal("confirmed"), v.literal("cancelled")),
    restaurantName: v.string(),
    city: v.string(),
    date: v.string(), // YYYY-MM-DD
    time: v.string(), // HH:mm
    partySize: v.number(),
    code: v.optional(v.string()),
  },
  handler: async (_ctx, { to, event, restaurantName, city, date, time, partySize, code }) => {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;
    if (!sid || !token || !from) {
      return { sent: false, skipped: true, reason: "twilio not configured" };
    }
    if (!to) return { sent: false, skipped: true, reason: "no phone on booking" };

    const body =
      event === "confirmed"
        ? `Kamix: your table for ${partySize} at ${restaurantName} (${city}) on ${date} at ${time} is confirmed. Code: ${code}. See you soon!`
        : `Kamix: your booking at ${restaurantName} on ${date} at ${time} has been cancelled.`;

    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${sid}:${token}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: to,
          From: from,
          Body: body.slice(0, 1600),
        }),
      });
      return { sent: res.ok, status: res.status };
    } catch (e) {
      return { sent: false, error: e instanceof Error ? e.message : "unknown" };
    }
  },
});

/**
 * Notify a diner that a table on their waitlist just freed up.
 * Same Twilio env-guard and no-op behavior as sendBookingSms.
 */
export const sendWaitlistSms = action({
  args: {
    to: v.string(),
    restaurantName: v.string(),
    city: v.string(),
    date: v.string(), // YYYY-MM-DD
    time: v.string(), // HH:mm
    partySize: v.number(),
  },
  handler: async (_ctx, { to, restaurantName, city, date, time, partySize }) => {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;
    if (!sid || !token || !from) {
      return { sent: false, skipped: true, reason: "twilio not configured" };
    }
    if (!to) return { sent: false, skipped: true, reason: "no phone on waitlist" };

    const body = `Kamix: good news! A table for ${partySize} just opened at ${restaurantName} (${city}) on ${date} at ${time}. Book it now before it's gone!`;

    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${sid}:${token}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: to,
          From: from,
          Body: body.slice(0, 1600),
        }),
      });
      return { sent: res.ok, status: res.status };
    } catch (e) {
      return { sent: false, error: e instanceof Error ? e.message : "unknown" };
    }
  },
});
