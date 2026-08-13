#!/usr/bin/env node
/**
 * Kamix — UI-flow test suite (run 2).
 *
 * Closes the gap between the manual click-through scenarios in tests.md and
 * what can be verified headlessly: every scenario here drives the EXACT
 * Convex function the screen calls (same args, same identities), against the
 * live deployment — i.e. the same network/data path the web UI uses.
 *
 *   node scripts/test-ui-flows.mjs
 *
 * Uses fresh identities + a fresh restaurant per run, so it is repeatable.
 * Exit code = number of failures.
 *
 * Notes on this environment:
 * - The `convex run` CLI occasionally returns empty output or fails to
 *   construct its WebSocket transport under load; every call is retried.
 * - Some functions return a bare id (restaurants:create, addSection,
 *   createMenuItem, …) rather than the created doc, so those scenarios verify
 *   through the same reads the UI performs (`restaurants:get`, menuItems).
 * - `restaurants:get` renders nested menu items as `[Array]` in CLI output, so
 *   menu-item assertions read the menuItems table directly.
 */
import { execSync } from "node:child_process";

const FLAGS = ["--typecheck", "disable", "--codegen", "disable"];
let PASS = 0;
let FAIL = 0;
const FAILED = [];

const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/** Synchronous sleep for retry backoff. */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Run `convex run` once; returns { out, status }. */
function runOnce(...args) {
  const cmd =
    ["node", "node_modules/convex/bin/main.js", "run", ...args, ...FLAGS].map(shq).join(" ") +
    " 2>&1";
  try {
    return { out: execSync(cmd, { encoding: "utf8" }), status: 0 };
  } catch (e) {
    return { out: `${e.stdout || ""}${e.stderr || ""}`, status: e.status ?? 1 };
  }
}

/** Retry on the transient CLI failures: empty output or broken WebSocket transport. */
function runfn(...args) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = runOnce(...args);
    const noisy = r.out.includes("webSocketConstructor") || r.out.includes("ProcessExitSentinel");
    if (r.out.trim().length > 0 && !noisy) return r;
    sleepSync(2000 * (attempt + 1));
  }
  return runOnce(...args);
}

/** Extract an id/value from an inline query result (prefer quoted doc ids). */
function iq(query) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { out } = runfn("--inline-query", query);
    const quoted = out.match(/'(?:[a-z0-9]{24,})'|"(?:[a-z0-9]{24,})"/g);
    const matches = quoted && quoted.length ? quoted : out.match(/\b\d+\b/g);
    if (matches && matches.length > 0) {
      return matches[matches.length - 1].replace(/['"]/g, "");
    }
    sleepSync(2000);
  }
  return "";
}

function check(name, expect, ...args) {
  const { out } = runfn(...args);
  if (out.includes(expect)) {
    PASS += 1;
    console.log(`PASS  | ${name}`);
  } else {
    FAIL += 1;
    FAILED.push(name);
    console.log(`FAIL  | ${name} | expected '${expect}'`);
    console.log(`       out: ${out.replace(/\s+/g, " ").slice(0, 420)}`);
  }
}

function checkAbsent(name, absent, ...args) {
  const { out } = runfn(...args);
  if (out.includes(absent)) {
    FAIL += 1;
    FAILED.push(name);
    console.log(`FAIL  | ${name} | must NOT contain '${absent}'`);
    console.log(`       out: ${out.replace(/\s+/g, " ").slice(0, 420)}`);
  } else {
    PASS += 1;
    console.log(`PASS  | ${name}`);
  }
}

const id = (subject) => JSON.stringify({ subject });

// ------------------------------------------------------------------ fixtures
const now = new Date();
const fmt = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const TOMORROW = fmt(new Date(now.getTime() + 86400000));
const STAMP = now.getTime().toString(36);

const OWNER = `ui-owner-${STAMP}`;
const DINER = `ui-diner-${STAMP}`;
const DINER2 = `ui-diner2-${STAMP}`;
const RNAME = `UI Flow Test ${STAMP}`;

console.log(`── UI-flow suite · ${now.toISOString().slice(0, 19).replace("T", " ")} ────────────`);

// ---------------------------------------------------------------- setup
// Owner creates a restaurant (C-1 path) and tunes it to a single 2-seat section
runfn("restaurants:create", JSON.stringify({
  name: RNAME, cuisine: "Italian", city: "Milan", address: "1 UI Test St",
  features: { inside: true, outside: true, bar: true, smoking: false, parking: false, liveMusic: false, soloFriendly: true },
}), "--identity", id(OWNER));
const RID = iq(
  `const r = await ctx.db.query("restaurants").withIndex("by_owner", (q) => q.eq("ownerId", "${OWNER}")).order("desc").first(); return r?._id;`,
);
// C-1b doubles as the regression test for the ownerIsDemo crash: the owner is a
// bare auth subject (no user doc) and restaurants:get used to crash on it.
check("C-1b detail renders for identity-subject owner", RNAME, "restaurants:get", JSON.stringify({ id: RID }));

const DEFSEC = iq(
  `const s = await ctx.db.query("sections").withIndex("by_restaurant", (q) => q.eq("restaurantId", "${RID}")).filter((q) => q.eq(q.field("name"), "Main dining room")).first(); return s?._id;`,
);
runfn("restaurants:addSection", JSON.stringify({
  restaurantId: RID, name: "UI Counter", kind: "inside", smoking: false, capacity: 2,
}), "--identity", id(OWNER));
check("C-2b 2-seat section shows in detail", "UI Counter", "restaurants:get", JSON.stringify({ id: RID }));
runfn("restaurants:deleteSection", JSON.stringify({ id: DEFSEC }), "--identity", id(OWNER));
runfn("restaurants:saveHours", JSON.stringify({
  restaurantId: RID,
  hours: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, open: "17:00", close: "22:00", enabled: true })),
}), "--identity", id(OWNER));
check("C-3b slots materialize", "created: 10", "availability:ensureForDate",
  JSON.stringify({ restaurantId: RID, date: TOMORROW }), "--identity", id(OWNER));

// ---------------------------------------------------------------- C-4/C-7 booking engine
// Fill 19:00 completely (2 seats), then a diner tries 19:00 → nearest-slot fallback
check("C-4b direct booking fills 19:00", "status: 'confirmed'", "bookings:createBooking", JSON.stringify({
  restaurantId: RID, date: TOMORROW, time: "19:00", partySize: 2, name: "UI Diner One",
}), "--identity", id(DINER));

// C-7: 19:00 is now full → booking must land at the next later time (19:30)
check("C-7 nearest-slot fallback shifts to 19:30", "19:30", "bookings:createBooking", JSON.stringify({
  restaurantId: RID, date: TOMORROW, time: "19:00", partySize: 1, name: "UI Diner Two",
}), "--identity", id(DINER2));

const BOOK2 = iq(
  `const b = await ctx.db.query("bookings").withIndex("by_user", (q) => q.eq("userId", "${DINER2}")).order("desc").first(); return b?._id;`,
);
const CODE = (() => {
  const { out } = runfn("--inline-query",
    `const b = await ctx.db.query("bookings").withIndex("by_user", (q) => q.eq("userId", "${DINER2}")).order("desc").first(); return { code: b?.code };`);
  const m = out.match(/'([A-Z0-9]{6})'/);
  return m ? m[1] : "";
})();

// ---------------------------------------------------------------- G-5 invite page
check("G-5 byCode returns the booking", "status: 'confirmed'", "bookings:byCode", JSON.stringify({ code: CODE }));
check("G-5b byCode includes restaurant", RNAME, "bookings:byCode", JSON.stringify({ code: CODE }));

// ---------------------------------------------------------------- D-7 diner notify
// sendForBooking returns the booking (the alert is verified via myAlerts below)
check("D-7 diner sends running_late alert", "status: 'confirmed'", "notifications:sendForBooking", JSON.stringify({
  bookingId: BOOK2, type: "running_late", message: "Traffic, 15 min late",
}), "--identity", id(DINER2));
check("D-7b diner sees own alert (myAlerts)", "running_late", "notifications:myAlerts", "{}", "--identity", id(DINER2));

// ---------------------------------------------------------------- D-6 owner notification center
// Regression test for the forRestaurant crash: the diner is a bare auth subject
// (no user doc) and the center used to crash resolving their name.
check("D-6 unread badge > 0", "ok: true", "--inline-query",
  `const n = await ctx.db.query("notifications").withIndex("by_restaurant_read", (q) => q.eq("restaurantId", "${RID}").eq("read", false)).collect(); return { ok: n.length > 0 };`);
check("D-6b per-booking filter", "running_late", "notifications:forRestaurant",
  JSON.stringify({ restaurantId: RID, bookingId: BOOK2 }), "--identity", id(OWNER));
check("D-6c diner name falls back to Guest", "dinerName: 'Guest'", "notifications:forRestaurant",
  JSON.stringify({ restaurantId: RID }), "--identity", id(OWNER));
runfn("notifications:markAllRead", JSON.stringify({ restaurantId: RID }), "--identity", id(OWNER));
check("D-6d mark all read clears badge", "unread: 0", "--inline-query",
  `const n = await ctx.db.query("notifications").withIndex("by_restaurant_read", (q) => q.eq("restaurantId", "${RID}").eq("read", false)).collect(); return { unread: n.length };`);

// ---------------------------------------------------------------- E-8 menu editor
const MENU = iq(
  `const m = await ctx.db.query("menus").withIndex("by_restaurant", (q) => q.eq("restaurantId", "${RID}")).first(); return m?._id;`,
) || (() => {
  runfn("restaurants:createMenu", JSON.stringify({ restaurantId: RID, name: "Dinner" }), "--identity", id(OWNER));
  return iq(`const m = await ctx.db.query("menus").withIndex("by_restaurant", (q) => q.eq("restaurantId", "${RID}")).first(); return m?._id;`);
})();

// createMenuItem returns a bare id — verify what the menu screen renders instead.
// (Note: `restaurants:get` renders nested items as `[Array]` in the CLI output,
// so the item checks below read the menuItems table directly — the same rows
// restaurants:get resolves and the menu screen displays.)
runfn("restaurants:createMenuItem", JSON.stringify({
  menuId: MENU, name: "Smoked Cacio", description: "Burrata, sage, pecorino",
  priceCents: 1490, category: "Primi", popular: true,
  imageUrl: "https://images.example.com/cacio.jpg",
  tags: ["Vegetarian", "Gluten-free"], allergens: ["Dairy", "Eggs"], spiceLevel: "mild",
}), "--identity", id(OWNER));
check("E-8 add item w/ image + attributes", "Smoked Cacio", "--inline-query",
  `const its = await ctx.db.query("menuItems").withIndex("by_restaurant", (q) => q.eq("restaurantId", "${RID}")).collect(); return its.map((i) => i.name);`);

const ITEM = iq(
  `const it = await ctx.db.query("menuItems").withIndex("by_restaurant", (q) => q.eq("restaurantId", "${RID}")).first(); return it?._id;`,
);
check("E-8b hide item (available=false)", "available: false", "restaurants:updateMenuItem", JSON.stringify({
  id: ITEM, available: false, priceCents: 1590,
}), "--identity", id(OWNER));
check("E-8c invalid spice rejected", "Invalid spice level", "restaurants:updateMenuItem", JSON.stringify({
  id: ITEM, spiceLevel: "nuclear",
}), "--identity", id(OWNER));
check("E-8d item photo persisted", "images.example.com", "--inline-query",
  `const its = await ctx.db.query("menuItems").withIndex("by_restaurant", (q) => q.eq("restaurantId", "${RID}")).collect(); return its.map((i) => i.imageUrl ?? i.imageStorageId ?? null);`);
check("E-8e allergen + spice data persisted", "Dairy", "--inline-query",
  `const its = await ctx.db.query("menuItems").withIndex("by_restaurant", (q) => q.eq("restaurantId", "${RID}")).collect(); return its.flatMap((i) => [...(i.allergens ?? []), i.spiceLevel ?? ""]);`);

// ---------------------------------------------------------------- B-10 menu display data
check("B-10 menu tags on detail", "Gluten-free", "--inline-query",
  `const its = await ctx.db.query("menuItems").withIndex("by_restaurant", (q) => q.eq("restaurantId", "${RID}")).collect(); return its.flatMap((i) => i.tags ?? []);`);

// ---------------------------------------------------------------- F-6 review flow
// Regression: the review author here is a bare auth subject — restaurants:get
// and reviews:listForRestaurant used to crash resolving their name.
check("F-6 owner completes the visit", "status: 'completed'", "bookings:updateStatus", JSON.stringify({
  bookingId: BOOK2, status: "completed",
}), "--identity", id(OWNER));
check("F-6b diner sees it as reviewable", "UI Counter", "reviews:myReviewable", "{}", "--identity", id(DINER2));
check("F-6c verified review created", "rating: 5", "reviews:create", JSON.stringify({
  bookingId: BOOK2, rating: 5, text: "UI-flow review.",
}), "--identity", id(DINER2));
check("F-6d duplicate rejected", "already reviewed", "reviews:create", JSON.stringify({
  bookingId: BOOK2, rating: 4,
}), "--identity", id(DINER2));
check("F-6e rating aggregate on detail", "avg: 5", "reviews:listForRestaurant", JSON.stringify({ restaurantId: RID }));
check("F-6f review no longer reviewable", "[]", "reviews:myReviewable", "{}", "--identity", id(DINER2));

// ---------------------------------------------------------------- G-6 profile favorites (seeded demo diner, deterministic)
const AVA = iq(
  `const u = await ctx.db.query("users").filter((q) => q.eq(q.field("email"), "ava@seatly.demo")).first(); return u?._id;`,
);
// Clear any leftover favorite state before asserting the toggle sequence.
const favState = iq(
  `const u = await ctx.db.get("${AVA}"); return { fav: (u?.favorites ?? []).includes("${RID}") };`,
);
if (favState.includes("true")) {
  runfn("users:toggleFavorite", JSON.stringify({ restaurantId: RID }), "--identity", id(AVA));
}
check("G-6 favorite on", "favorited: true", "users:toggleFavorite", JSON.stringify({ restaurantId: RID }), "--identity", id(AVA));
check("G-6b favorites list shows it", RNAME, "users:myFavorites", "{}", "--identity", id(AVA));
check("G-6c favorite off", "favorited: false", "users:toggleFavorite", JSON.stringify({ restaurantId: RID }), "--identity", id(AVA));

// ---------------------------------------------------------------- B-9 explore data + security
check("B-9 search returns UI-flow restaurant", RNAME, "restaurants:search", "{}");
check("UI-1 non-owner cannot see bookings", "[]", "bookings:byRestaurant",
  JSON.stringify({ restaurantId: RID }), "--identity", id(DINER));
check("UI-2 signed-out booking rejected", "Please sign in", "bookings:createBooking", JSON.stringify({
  restaurantId: RID, date: TOMORROW, time: "20:00", partySize: 2, name: "Nope",
}));

sleepSync(500);

// ------------------------------------------------------------------ summary
console.log("");
console.log("─────────────────────────────────────────────────────────────");
console.log(`RESULT: ${PASS} passed, ${FAIL} failed`);
if (FAILED.length > 0) console.log(`FAILED: ${FAILED.join(", ")}`);
process.exit(FAIL);
