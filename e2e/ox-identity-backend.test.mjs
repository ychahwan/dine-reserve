import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../src/convex/", import.meta.url);
const source = (name) => readFile(new URL(name, ROOT), "utf8");

function exportedDefinition(contents, name) {
  const start = contents.indexOf(`export const ${name} =`);
  assert.notEqual(start, -1, `missing export ${name}`);
  const end = contents.indexOf("\n});", start);
  assert.notEqual(end, -1, `unterminated export ${name}`);
  return contents.slice(start, end + 4);
}

test("OX-C-01/OX-C-02 push fan-out actions are internal-only", async () => {
  const contents = await source("notifications.ts");
  assert.match(contents, /export const sendToUser = internalAction\(/);
  assert.match(contents, /export const broadcast = internalAction\(/);
});

test("OX-C-03/OX-C-04 destructive seed commands are internal-only", async () => {
  const contents = await source("seed.ts");
  assert.match(contents, /export const wipeAllData = internalMutation\(/);
  assert.match(contents, /export const resetData = internalMutation\(/);
});

test("OX-C-05 stress seeding is internal and blocked in production", async () => {
  const contents = await source("stressSeed.ts");
  assert.match(contents, /export const stressSeed = internalMutation\(/);
  assert.match(contents, /CONVEX_DEPLOYMENT/);
  assert.match(contents, /ALLOW_STRESS_SEED/);
});

test("OX-H-01/OX-M-10 password lookup has no public query or fallback scan", async () => {
  const contents = await source("users.ts");
  assert.match(contents, /export const hasPasswordAccount = internalQuery\(/);
  assert.doesNotMatch(contents, /\.take\(2000\)/);
});

test("OX-M-11 phone confirmation rechecks profile and provider uniqueness", async () => {
  const block = exportedDefinition(
    await source("users.ts"),
    "confirmPhoneChange",
  );
  assert.match(block, /\.query\("users"\)[\s\S]*?\.withIndex\("phone"/);
  assert.match(block, /providerAndAccountId/);
  assert.match(block, /already in use/i);
});

test("OX-H-02 admin views use bounded reads", async () => {
  const contents = await source("adminView.ts");
  assert.doesNotMatch(contents, /\.collect\(\)/);
  assert.match(contents, /ADMIN_LIST_LIMIT/);
  assert.match(contents, /ADMIN_DETAIL_LIMIT/);
});

test("OX-M-12/OX-L-14 token registration is validated, limited, capped, and cleanup paginates", async () => {
  const contents = await source("notifications.ts");
  const save = exportedDefinition(contents, "saveToken");
  const cleanup = exportedDefinition(contents, "cleanupTokens");
  assert.match(save, /PUSH_TOKEN_PATTERN/);
  assert.match(save, /checkRateLimit/);
  assert.match(save, /MAX_TOKENS_PER_USER/);
  assert.match(cleanup, /paginate\(/);
  assert.match(cleanup, /active: false/);
});

test("OX-M-13 audit history cannot be cleared or selectively deleted", async () => {
  const contents = await source("admin.ts");
  for (const name of ["clearAuditLog", "deleteAuditEntries"]) {
    const block = exportedDefinition(contents, name);
    assert.match(block, /Audit history is immutable/);
    assert.doesNotMatch(block, /ctx\.db\.delete/);
  }
});

test("OX-M-14 seed, retrofit, activity, and test writes are internal-only", async () => {
  const seed = await source("seed.ts");
  for (const name of ["seed", "retrofitDemoData", "generateDemoActivity"]) {
    assert.match(
      seed,
      new RegExp(`export const ${name} = internalMutation\\(`),
    );
  }
  const status = exportedDefinition(seed, "ensureDemoData");
  assert.doesNotMatch(status, /runSeed|runRetrofit|db\.(insert|patch|delete)/);

  const helpers = await source("testHelpers.ts");
  for (const name of ["wipeRateLimits", "fixAdminAuth", "seedAllTestUsers"]) {
    assert.match(
      helpers,
      new RegExp(`export const ${name} = internalMutation\\(`),
    );
  }
});

test("OX-M-15/OX-M-16 daily diner passes paginate and avoid global review scans", async () => {
  const contents = await source("dinerNotify.ts");
  const reengage = exportedDefinition(contents, "runReengagePass");
  const review = exportedDefinition(contents, "runReviewNudgePass");
  assert.match(reengage, /cursor: v\.optional\(v\.string\(\)\)/);
  assert.match(reengage, /paginate\(/);
  assert.doesNotMatch(reengage, /query\("users"\)\.collect/);
  assert.match(review, /withIndex\("by_booking"/);
  assert.doesNotMatch(review, /query\("reviews"\)\.collect/);
});

test("OX-M-17 favorite cleanup continues in bounded pages", async () => {
  const contents = await source("erasure.ts");
  assert.match(
    contents,
    /export const cleanupRestaurantFavorites = internalMutation\(/,
  );
  assert.match(contents, /FAVORITES_CLEANUP_PAGE/);
  assert.match(contents, /paginate\(/);
  assert.doesNotMatch(contents, /query\("users"\)\.collect/);
});

test("OX-M-18 visit thresholds share one bounded helper", async () => {
  const contents = await source("socialize.ts");
  assert.match(contents, /async function completedVisitCounts/);
  assert.equal((contents.match(/completedVisitCounts\(/g) ?? []).length, 3);
  assert.doesNotMatch(
    contents,
    /visibleUserIds\.map\([\s\S]*?query\("bookings"\)/,
  );
});

test("OX-L-11 scheduled user deletion revalidates role and ownership", async () => {
  const step = exportedDefinition(
    await source("admin.ts"),
    "bulkDeleteUsersStep",
  );
  assert.match(step, /target\.role === "admin"/);
  assert.match(step, /withIndex\("by_owner"/);
});

test("OX-L-12 notification feed mutations and counts are bounded", async () => {
  const contents = await source("notifications.ts");
  assert.match(contents, /export const markAllReadStep = internalMutation\(/);
  assert.match(exportedDefinition(contents, "unreadCount"), /take\(/);
  assert.doesNotMatch(
    exportedDefinition(contents, "markAllRead"),
    /\.collect\(\)/,
  );
});

test("OX-L-13 gift histories and pending counts use bounded reads", async () => {
  const contents = await source("socialize.ts");
  for (const name of [
    "myReceivedGifts",
    "mySentGifts",
    "restaurantGiftDeliveries",
    "pendingGiftCount",
  ]) {
    const block = exportedDefinition(contents, name);
    assert.match(block, /\.take\(/);
    assert.doesNotMatch(block, /\.collect\(\)/);
  }
});

test("OX-L-15 loyalty activity reads newest 20 directly", async () => {
  const block = exportedDefinition(await source("loyalty.ts"), "myBalance");
  assert.match(block, /\.order\("desc"\)[\s\S]*?\.take\(20\)/);
  assert.doesNotMatch(block, /\.collect\(\)/);
});

test("OX-L-16 diner unread badge is capped", async () => {
  const block = exportedDefinition(
    await source("dinerNotify.ts"),
    "unreadCount",
  );
  assert.match(block, /UNREAD_COUNT_CAP/);
  assert.match(block, /\.take\(/);
  assert.doesNotMatch(block, /\.collect\(\)/);
});
