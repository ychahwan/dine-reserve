import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("SMS/auth/rate: SMS actions are internal, OTPs are strict, and budgets are indexed", async () => {
  const [sms, reminders, rateLimit, phoneOtp] = await Promise.all([
    source("src/convex/sms.ts"),
    source("src/convex/reminders.ts"),
    source("src/convex/rateLimit.ts"),
    source("src/convex/auth/phoneOtp.ts"),
  ]);

  assert.equal((sms.match(/internalAction\s*\(/g) ?? []).length, 4);
  assert.doesNotMatch(sms, /\baction\s*\(/);
  assert.match(sms, /assertOtpCode/);
  assert.match(reminders, /internal\.sms\.sendBookingReminder/);
  assert.match(rateLimit, /\.eq\("windowStart", windowStart\)/);
  assert.match(rateLimit, /otpSendGlobal/);
  assert.match(phoneOtp, /assertOtpCode\(token\)/);
  assert.match(phoneOtp, /maxAge:\s*60\s*\*\s*5/);
});

test("demo rules: cron is internal and public runs are owner-authorized and bounded", async () => {
  const [demoRules, config] = await Promise.all([
    source("src/convex/demoRules.ts"),
    source("convex.config.ts"),
  ]);

  assert.match(demoRules, /ensureDemoRulesForCron\s*=\s*internalMutation/);
  assert.match(config, /demoRules:ensureDemoRulesForCron/);
  assert.match(demoRules, /MAX_DEMO_DAYS_AHEAD/);
  assert.match(demoRules, /requireDemoRestaurantOwner/);
  assert.doesNotMatch(demoRules, /const isManual/);
});

test("secrets/uploads/AI: references, upload limits, sanitization, backoff and global budgets are enforced", async () => {
  const [settings, uploads, ai] = await Promise.all([
    source("src/convex/settings.ts"),
    source("src/convex/uploads.ts"),
    source("src/convex/ai.ts"),
  ]);

  assert.match(settings, /ENV_REFERENCE_PREFIX/);
  assert.match(settings, /resolveSettingValue/);
  assert.match(uploads, /contentType:\s*v\.string\(\)/);
  assert.match(uploads, /size:\s*v\.number\(\)/);
  assert.match(uploads, /consumeUploadRateLimit/);
  assert.doesNotMatch(ai, /query\("appSettings"\)\.collect\(\)/);
  assert.match(ai, /setTimeout/);
  assert.match(ai, /aiGlobal/);
  assert.match(ai, /favoriteNames.*sanitizeUntrustedText/s);
  assert.match(ai, /dietary:.*sanitizeUntrustedText/s);
});

test("bounded services: reviews, stories, reminders, predictions and admin AI avoid unbounded fan-out", async () => {
  const [reviews, stories, reminders, analytics, adminAi, ai] =
    await Promise.all([
      source("src/convex/reviews.ts"),
      source("src/convex/stories.ts"),
      source("src/convex/reminders.ts"),
      source("src/convex/analytics.ts"),
      source("src/convex/adminAi.ts"),
      source("src/convex/ai.ts"),
    ]);

  assert.match(reviews, /MAX_PUBLIC_REVIEWS/);
  assert.match(reviews, /\.order\("desc"\)\s*\.take\(/);
  assert.match(stories, /\.order\("desc"\)\s*\.take\(/);
  assert.match(reminders, /restaurantPromises/);
  assert.doesNotMatch(analytics, /for \(let w = 1; w <= 12; w\+\+\)/);
  assert.match(analytics, /PREDICTION_HISTORY_DAYS/);
  assert.doesNotMatch(adminAi, /take\(5000\)/);
  assert.match(adminAi, /MAX_ADMIN_MESSAGES/);
  assert.match(ai, /ownerInsightInputs\s*=\s*internalQuery/);
  assert.doesNotMatch(ai, /api\.dining\.restaurantOrders/);
});
