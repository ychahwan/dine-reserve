import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../src/convex/", import.meta.url);
const source = async (name) => readFile(new URL(name, root), "utf8");

test("OX-M-01 bounds and throttles slot materialization", async () => {
  const text = await source("availability.ts");
  assert.match(text, /parseOrThrow\(dateSchema, date\)/);
  assert.match(text, /date > dateFromNow\(\w+\)/);
  assert.match(text, /checkRateLimit\(ctx,\s*\{[\s\S]*?ensureForDate/);
});

test("OX-M-02 hardens capability lookup and avoids collecting collisions", async () => {
  const [bookings, validation] = await Promise.all([source("bookings.ts"), source("validation.ts")]);
  assert.match(validation, /bookingCodeSchema[\s\S]*?\.length\(6/);
  assert.match(bookings, /withIndex\("by_code"[\s\S]*?\.first\(\)/);
});

test("OX-M-03 spam-capable dining and walk-in mutations are throttled and menu requests require bookings", async () => {
  const [dining, walkIn] = await Promise.all([source("dining.ts"), source("walkIn.ts")]);
  for (const key of ["placeOrder", "sendAssist", "createMenuRequest"]) {
    assert.match(dining, new RegExp(`key: "${key}"`));
  }
  for (const key of ["walkInCheckIn", "scanTableQR", "hostInitiatedWalkIn"]) {
    assert.match(walkIn, new RegExp(`key: "${key}"`));
  }
  assert.match(dining, /createMenuRequest[\s\S]*?bookingId: v\.id\("bookings"\)/);
  assert.match(dining, /requireConfirmedBookingParticipant\(ctx, userId, bookingId\)/);
});

test("OX-M-04 availability summary validates dates and bounds candidate venues", async () => {
  const text = await source("availability.ts");
  assert.match(text, /summary[\s\S]*?limit: v\.optional\(v\.number\(\)\)/);
  assert.match(text, /summary[\s\S]*?parseOrThrow\(dateSchema, date\)/);
  assert.match(text, /query\("restaurants"\)[\s\S]*?\.take\(effectiveLimit\)/);
  assert.doesNotMatch(text, /const \[allHours, allSections\]/);
});

test("OX-M-05 search bounds indexed candidates and avoids global section/menu scans", async () => {
  const text = await source("restaurants.ts");
  assert.match(text, /const SEARCH_CANDIDATE_LIMIT/);
  assert.doesNotMatch(text, /const allSections = await ctx\.db\.query\("sections"\)\.collect\(\)/);
  assert.doesNotMatch(text, /const allItems = await ctx\.db\.query\("menuItems"\)\.collect\(\)/);
});

test("OX-M-06 owner stats applies date bounds in compound indexes", async () => {
  const text = await source("bookings.ts");
  assert.match(text, /by_restaurant_date[\s\S]*?eq\("restaurantId", restaurantId\)\.gte\("date", cutoffKey\)/);
  assert.doesNotMatch(text, /const inWindow = bookings\.filter/);
});

test("OX-M-07 open badge counts have a bounded fallback", async () => {
  const text = await source("dining.ts");
  assert.match(text, /const OPEN_COUNT_SCAN_LIMIT/);
  assert.match(text, /openCounts[\s\S]*?\.take\(OPEN_COUNT_SCAN_LIMIT\)/);
});

test("OX-M-08 waitlist scoring bounds candidates and per-user history", async () => {
  const text = await source("waitlist.ts");
  assert.match(text, /const VIP_HISTORY_LIMIT/);
  assert.match(text, /const VIP_CANDIDATE_LIMIT/);
  assert.match(text, /candidates\.slice\(0, VIP_CANDIDATE_LIMIT\)/);
});

test("OX-M-09 slot regeneration is scheduled in date-sized chunks", async () => {
  const [availability, rules] = await Promise.all([source("availability.ts"), source("slotRules.ts")]);
  assert.match(availability, /export const rebuildSlotsChunk = internalMutation/);
  assert.match(availability, /internal\.availability\.rebuildSlotsChunk/);
  assert.doesNotMatch(availability, /Array\.from\(\{ length: daysAhead \}/);
  assert.match(rules, /await rebuildRestaurantSlots/);
});

test("OX-L-01 trims and caps walk-in rejection reasons", async () => {
  const text = await source("walkIn.ts");
  assert.match(text, /const reason = args\.reason\?\.trim\(\)\.slice\(0, 300\)/);
  assert.match(text, /rejectReason: reason/);
});

test("OX-L-02 all walk-in party-size entry points enforce integers", async () => {
  const text = await source("walkIn.ts");
  assert.match(text, /parseOrThrow\(partySizeSchema, args\.partySize\)/);
  assert.match(text, /parseOrThrow\(partySizeSchema, request\.partySize\)/);
});

test("OX-L-03 public menus hide disabled restaurants", async () => {
  const text = await source("restaurants.ts");
  assert.match(text, /menuForRestaurant[\s\S]*?if \(restaurant\.disabled\)[\s\S]*?caller\?\.role[\s\S]*?return \{ menuDocs: \[\] \}/);
});

test("OX-L-04 waitlist notifications require an actual seat restoration", async () => {
  const text = await source("bookings.ts");
  assert.match(text, /let seatsRestored = false/);
  assert.match(text, /const freed = seatsRestored[\s\S]*?notifyWaitlistForFreedSeats/);
});

test("OX-L-05 booking codes use rejection sampling", async () => {
  const text = await source("bookings.ts");
  assert.match(text, /const unbiasedUpperBound/);
  assert.match(text, /if \(byte >= unbiasedUpperBound\) continue/);
});

test("OX-L-07 owner and diner list endpoints use bounded reads", async () => {
  const files = await Promise.all(["bookings.ts", "dining.ts", "waitlist.ts", "walkIn.ts"].map(source));
  for (const text of files) assert.match(text, /const .*LIST_LIMIT|const .*HISTORY_LIMIT/);
  assert.match(files[0], /byRestaurant[\s\S]*?\.take\(effectiveLimit\)/);
  assert.match(files[1], /restaurantOrders[\s\S]*?\.take\(effectiveLimit\)/);
  assert.match(files[2], /myWaitlist[\s\S]*?\.take\(WAITLIST_LIST_LIMIT\)/);
  assert.match(files[3], /walkInHistory[\s\S]*?\.take\(effectiveLimit\)/);
});

test("OX-L-08 recommendations bound restaurants and menu reads", async () => {
  const text = await source("restaurants.ts");
  assert.match(text, /forYou[\s\S]*?\.take\(RECOMMENDATION_CANDIDATE_LIMIT\)/);
  assert.doesNotMatch(text, /const allMenuItems[\s\S]*?query\("menuItems"\)\.collect/);
});

test("OX-L-09 queue and waitlist history reads are bounded", async () => {
  const [queue, waitlist] = await Promise.all([source("queue.ts"), source("waitlist.ts")]);
  assert.match(queue, /processSlot[\s\S]*?\.take\(DRAIN_BATCH \+ 1\)/);
  assert.match(queue, /myEntries[\s\S]*?\.take\(QUEUE_HISTORY_LIMIT\)/);
  assert.match(waitlist, /myWaitlist[\s\S]*?\.take\(WAITLIST_LIST_LIMIT\)/);
});

test("OX-L-10 bill assembly deduplicates user reads and omits redundant raw orders", async () => {
  const text = await source("dining.ts");
  assert.match(text, /const participantIds = \[\.\.\.new Set/);
  assert.match(text, /const participantDocs = await Promise\.all/);
  assert.doesNotMatch(text, /\n\s*orders,\n\s*breakdown/);
});
