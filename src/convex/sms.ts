import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
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
const E164_PHONE = /^\+[1-9]\d{7,14}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function assertPhone(phone: string): void {
  if (!E164_PHONE.test(phone)) throw new Error("Invalid SMS destination.");
}

function assertText(value: string, name: string, maxLength: number): void {
  if (!value.trim() || value.length > maxLength) {
    throw new Error(`Invalid ${name}.`);
  }
}

function assertBookingDetails(args: {
  to: string;
  restaurantName: string;
  city: string;
  date: string;
  time: string;
  partySize: number;
  code?: string;
}): void {
  assertPhone(args.to);
  assertText(args.restaurantName, "restaurant name", 120);
  assertText(args.city, "city", 80);
  if (!ISO_DATE.test(args.date)) throw new Error("Invalid booking date.");
  if (!CLOCK_TIME.test(args.time)) throw new Error("Invalid booking time.");
  if (
    !Number.isInteger(args.partySize) ||
    args.partySize < 1 ||
    args.partySize > 30
  ) {
    throw new Error("Invalid party size.");
  }
  if (args.code !== undefined && !/^[A-Z0-9]{4,12}$/.test(args.code)) {
    throw new Error("Invalid booking code.");
  }
}

export function assertOtpCode(code: string): void {
  if (!/^\d{6}$/.test(code)) throw new Error("Invalid verification code.");
}

export const sendBookingSms = internalAction({
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
  handler: async (
    ctx,
    { to, event, restaurantName, city, date, time, partySize, code },
  ) => {
    assertBookingDetails({
      to,
      restaurantName,
      city,
      date,
      time,
      partySize,
      code,
    });
    // L-16: omit the code segment entirely when there is no code (never
    // render a literal "Code: undefined").
    const codePart = code ? ` Code: ${code}.` : "";
    const body =
      event === "confirmed"
        ? `Kamix: your table for ${partySize} at ${restaurantName} (${city}) on ${date} at ${time} is confirmed.${codePart} See you soon!`
        : `Kamix: your booking at ${restaurantName} on ${date} at ${time} has been cancelled.`;
    return await sendTwilioMessage(to, body, ctx);
  },
});

/**
 * Day-before booking reminder (scheduled by the daily reminders cron).
 */
export const sendBookingReminder = internalAction({
  args: {
    to: v.string(),
    restaurantName: v.string(),
    city: v.string(),
    date: v.string(), // YYYY-MM-DD
    time: v.string(), // HH:mm
    partySize: v.number(),
    code: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { to, restaurantName, city, date, time, partySize, code },
  ) => {
    assertBookingDetails({
      to,
      restaurantName,
      city,
      date,
      time,
      partySize,
      code,
    });
    const codePart = code ? ` Code: ${code}.` : "";
    const body = `Kamix reminder: ${restaurantName} (${city}) tomorrow at ${time} for ${partySize}.${codePart} Reply or cancel in the app if plans change — see you soon!`;
    return await sendTwilioMessage(to, body, ctx);
  },
});

/**
 * Send a 6-digit OTP code via SMS for phone-based authentication.
 */
export const sendOtpSms = internalAction({
  args: {
    phone: v.string(), // E.164 phone number
    code: v.string(), // 6-digit OTP
  },
  handler: async (ctx, { phone, code }) => {
    assertPhone(phone);
    assertOtpCode(code);
    await ctx.runMutation(internal.rateLimit.checkOtpSendRateLimit, { phone });
    const body = `Your Kamix verification code is: ${code}. It expires in 5 minutes.`;
    return await sendTwilioMessage(phone, body, ctx);
  },
});

/**
 * Notify a diner that a table on their waitlist just freed up.
 */
export const sendWaitlistSms = internalAction({
  args: {
    to: v.string(),
    restaurantName: v.string(),
    city: v.string(),
    date: v.string(), // YYYY-MM-DD
    time: v.string(), // HH:mm
    partySize: v.number(),
  },
  handler: async (ctx, { to, restaurantName, city, date, time, partySize }) => {
    assertBookingDetails({ to, restaurantName, city, date, time, partySize });
    const body = `Kamix: good news! A table for ${partySize} just opened at ${restaurantName} (${city}) on ${date} at ${time}. Book it now before it's gone!`;
    return await sendTwilioMessage(to, body, ctx);
  },
});
