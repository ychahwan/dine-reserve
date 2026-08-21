import { v } from "convex/values";
import { action } from "./_generated/server";
import { sendTwilioMessage } from "./twilio";

/**
 * All SMS sending goes through the shared `sendTwilioMessage` helper in
 * ./twilio (KB-30) — credentials, the TWILIO_ENABLED kill-switch, the
 * Messaging Service / From resolution, the 10s abort timeout, and the
 * graceful no-op when Twilio isn't configured all live in one place.
 */

/**
 * Send a booking SMS via Twilio.
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
    const body =
      event === "confirmed"
        ? `Kamix: your table for ${partySize} at ${restaurantName} (${city}) on ${date} at ${time} is confirmed. Code: ${code}. See you soon!`
        : `Kamix: your booking at ${restaurantName} on ${date} at ${time} has been cancelled.`;
    return await sendTwilioMessage(to, body);
  },
});

/**
 * Day-before booking reminder (scheduled by the daily reminders cron).
 */
export const sendBookingReminder = action({
  args: {
    to: v.string(),
    restaurantName: v.string(),
    city: v.string(),
    date: v.string(), // YYYY-MM-DD
    time: v.string(), // HH:mm
    partySize: v.number(),
    code: v.optional(v.string()),
  },
  handler: async (_ctx, { to, restaurantName, city, date, time, partySize, code }) => {
    const body = `Kamix reminder: ${restaurantName} (${city}) tomorrow at ${time} for ${partySize}. Code: ${code}. Reply or cancel in the app if plans change — see you soon!`;
    return await sendTwilioMessage(to, body);
  },
});

/**
 * Send a 6-digit OTP code via SMS for phone-based authentication.
 */
export const sendOtpSms = action({
  args: {
    phone: v.string(), // E.164 phone number
    code: v.string(),  // 6-digit OTP
  },
  handler: async (_ctx, { phone, code }) => {
    const body = `Your Kamix verification code is: ${code}. It expires in 15 minutes.`;
    return await sendTwilioMessage(phone, body);
  },
});

/**
 * Notify a diner that a table on their waitlist just freed up.
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
    const body = `Kamix: good news! A table for ${partySize} just opened at ${restaurantName} (${city}) on ${date} at ${time}. Book it now before it's gone!`;
    return await sendTwilioMessage(to, body);
  },
});
