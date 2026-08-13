import { defineApp } from "convex/server";

const app = defineApp();

// Daily demo-rules retrofit.
//
// Databases seeded before the slot-rules engine existed have demo restaurants
// with NO service windows — they fall back to the legacy 30-minute grid and
// keep stale grid slots, so diners see times the restaurant never defined
// (e.g. Sakura House showing 30-min slots instead of fixed omakase seatings).
//
// This cron calls `demoRules:ensureDemoRules` every day at 06:50 UTC. The first
// run (minutes after this deployment) applies the demo service windows to any
// demo restaurant that has none and rebuilds its upcoming availability; every
// later run is a no-op (the retrofit guard skips configured restaurants), so it
// never overrides an owner's own windows.
app.crons.cron(
  "demo-rules-retrofit",
  { hourUTC: 6, minuteUTC: 50 },
  "demoRules:ensureDemoRules",
);

// Day-before booking reminders: every day at 10:00 UTC this sends an SMS
// reminder (Twilio-guarded no-op when not configured) for tomorrow's
// confirmed bookings and marks them reminded so they only fire once.
app.crons.cron(
  "booking-reminders",
  { hourUTC: 10, minuteUTC: 0 },
  "reminders:sendTomorrowReminders",
);

export default app;
