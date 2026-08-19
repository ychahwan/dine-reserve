import { v } from "convex/values";
import { action } from "./_generated/server";

/**
 * Resolve Twilio credentials from the environment. Supports two auth modes:
 *  - Account SID + main Auth Token (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)
 *  - Account SID + API Key (TWILIO_ACCOUNT_SID stays the URL/account, but
 *    Basic Auth uses TWILIO_API_KEY_SID / TWILIO_API_KEY_SECRET instead —
 *    Twilio API Keys authenticate as themselves, never as the Account SID).
 * Returns null (graceful no-op) when neither mode is fully configured.
 *
 * Sender resolution prefers a Messaging Service
 * (TWILIO_MESSAGING_SERVICE_SID) over a bare From number
 * (TWILIO_FROM_NUMBER): a Messaging Service with a registered Alphanumeric
 * Sender ID (e.g. "Beity") routes far more reliably into markets like
 * Lebanon than a raw US long code, which international carriers frequently
 * accept-then-silently-filter even though Twilio's own delivery receipt
 * reports "delivered". At least one of the two must be set.
 */
function twilioConfig() {
  // Respect the TWILIO_ENABLED kill-switch: when set to "false" all SMS
  // sending is skipped regardless of whether credentials are present.
  const enabled = process.env.TWILIO_ENABLED;
  if (enabled !== undefined && enabled.toLowerCase() === "false") return null;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || (!messagingServiceSid && !from)) return null;

  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  const authUser = apiKeySid || accountSid;
  const authPass = apiKeySid ? apiKeySecret : authToken;
  if (!authUser || !authPass) return null;

  return {
    accountSid,
    messagingServiceSid,
    from,
    authHeader: "Basic " + btoa(`${authUser}:${authPass}`),
  };
}

function senderParams(
  cfg: NonNullable<ReturnType<typeof twilioConfig>>,
): Record<string, string> {
  return cfg.messagingServiceSid
    ? { MessagingServiceSid: cfg.messagingServiceSid }
    : { From: cfg.from! };
}

/**
 * Send a booking SMS via the Twilio REST API.
 * Requires TWILIO_ACCOUNT_SID + TWILIO_FROM_NUMBER, plus either
 * TWILIO_AUTH_TOKEN or (TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET), to be
 * set in the environment (Keys UI). When missing the action is a graceful
 * no-op so the app keeps working.
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
    const cfg = twilioConfig();
    if (!cfg) {
      return { sent: false, skipped: true, reason: "twilio not configured" };
    }
    if (!to) return { sent: false, skipped: true, reason: "no phone on booking" };

    const body =
      event === "confirmed"
        ? `Kamix: your table for ${partySize} at ${restaurantName} (${city}) on ${date} at ${time} is confirmed. Code: ${code}. See you soon!`
        : `Kamix: your booking at ${restaurantName} on ${date} at ${time} has been cancelled.`;

    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: cfg.authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: to,
          ...senderParams(cfg),
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
 * Day-before booking reminder (scheduled by the daily reminders cron).
 * Same Twilio env-guard and no-op behavior as sendBookingSms.
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
    const cfg = twilioConfig();
    if (!cfg) {
      return { sent: false, skipped: true, reason: "twilio not configured" };
    }
    if (!to) return { sent: false, skipped: true, reason: "no phone on booking" };

    const body = `Kamix reminder: ${restaurantName} (${city}) tomorrow at ${time} for ${partySize}. Code: ${code}. Reply or cancel in the app if plans change — see you soon!`;

    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: cfg.authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: to,
          ...senderParams(cfg),
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
 * Send a 6-digit OTP code via SMS for phone-based authentication.
 * Replaces the old Freebuff email OTP delivery.
 */
export const sendOtpSms = action({
  args: {
    phone: v.string(), // E.164 phone number
    code: v.string(),  // 6-digit OTP
  },
  handler: async (_ctx, { phone, code }) => {
    const cfg = twilioConfig();
    if (!cfg) {
      return { sent: false, skipped: true, reason: "twilio not configured" };
    }
    if (!phone) return { sent: false, skipped: true, reason: "no phone" };

    const body = `Your Kamix verification code is: ${code}. It expires in 15 minutes.`;

    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: cfg.authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: phone,
          ...senderParams(cfg),
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
    const cfg = twilioConfig();
    if (!cfg) {
      return { sent: false, skipped: true, reason: "twilio not configured" };
    }
    if (!to) return { sent: false, skipped: true, reason: "no phone on waitlist" };

    const body = `Kamix: good news! A table for ${partySize} just opened at ${restaurantName} (${city}) on ${date} at ${time}. Book it now before it's gone!`;

    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: cfg.authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: to,
          ...senderParams(cfg),
          Body: body.slice(0, 1600),
        }),
      });
      return { sent: res.ok, status: res.status };
    } catch (e) {
      return { sent: false, error: e instanceof Error ? e.message : "unknown" };
    }
  },
});
